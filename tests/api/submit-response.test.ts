import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/v1/public/surveys/[slug]/responses/route";
import { db, resetDatabase } from "../fixtures/db";
import { cookieJar, setCookies } from "../fixtures/session";
import { createPublishedSurvey, validBody, type PublishedSurvey } from "../fixtures/surveys";

vi.mock("next/headers", async () => (await import("../fixtures/session")).nextHeadersMock);

const ORIGIN = "http://localhost";
let ipCounter = 0;

type Options = { origin?: string | null; contentType?: string; ip?: string; raw?: string };

function submit(slug: string, body: unknown, options: Options = {}) {
  const headers = new Headers({
    "content-type": options.contentType ?? "application/json",
    "x-forwarded-for": options.ip ?? `10.0.0.${++ipCounter}`,
  });
  if (options.origin !== null) headers.set("origin", options.origin ?? ORIGIN);
  const request = new Request(`${ORIGIN}/api/v1/public/surveys/${slug}/responses`, {
    method: "POST",
    headers,
    body: options.raw ?? JSON.stringify(body),
  });
  return POST(request, { params: Promise.resolve({ slug }) });
}

/** Cada teste começa como um navegador novo, já com cookie de respondente. */
function newBrowser() {
  setCookies([{ name: "poll_rid", value: randomUUID() }]);
}

async function errorCode(response: Response) {
  return (await response.json()).error?.code;
}

let s: PublishedSurvey;

beforeEach(async () => {
  await resetDatabase();
  newBrowser();
  s = await createPublishedSurvey();
});

describe("POST /api/v1/public/surveys/{slug}/responses", () => {
  it("RF-03 (1) / RF-04: envio válido grava resposta, respostas e seleções e devolve 201", async () => {
    const response = await submit(s.survey.slug, validBody(s));
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toEqual({ id: expect.any(String), submittedAt: expect.any(String) });

    const saved = await db.surveyResponse.findUniqueOrThrow({
      where: { id: body.id },
      include: { answers: { include: { selections: true } } },
    });
    expect(saved.userId).toBeNull();
    expect(saved.respondentKey).toMatch(/^[0-9a-f]{64}$/);
    expect(saved.respondentKey).not.toBe(cookieJar.get("poll_rid"));
    const byQuestion = Object.fromEntries(saved.answers.map((a) => [a.questionId, a]));
    expect(byQuestion[s.q.project.id]?.textValue).toBe("Poll");
    expect(byQuestion[s.q.tools.id]?.selections.map((x) => x.optionId).sort()).toEqual(
      [s.o.vite.id, s.o.jest.id].sort(),
    );
    expect(saved.answers).toHaveLength(4);
  });

  it("pergunta opcional em branco não grava Answer", async () => {
    const body = validBody(s);
    body.answers[3] = { questionId: s.q.comment.id, text: "   " };
    expect((await submit(s.survey.slug, body)).status).toBe(201);
    expect(await db.answer.count()).toBe(3);
  });

  it("sem cookie, cria um e grava só o hash dele", async () => {
    setCookies([]);
    expect((await submit(s.survey.slug, validBody(s))).status).toBe(201);
    const token = cookieJar.get("poll_rid");
    expect(token).toMatch(/^[0-9a-f-]{36}$/);
    const saved = await db.surveyResponse.findFirstOrThrow();
    expect(saved.respondentKey).not.toContain(token);
  });

  describe("CT-02: estrutura da pesquisa", () => {
    it("opção de outra pergunta → 422 UNKNOWN_OPTION", async () => {
      const body = validBody(s);
      body.answers[0] = { questionId: s.q.framework.id, optionIds: [s.o.vite.id] };
      const response = await submit(s.survey.slug, body);
      expect(response.status).toBe(422);
      const json = await response.json();
      expect(json.error.code).toBe("UNKNOWN_OPTION");
      expect(json.error.details).toEqual([
        { path: `answers.${s.q.framework.id}`, message: expect.any(String) },
      ]);
    });

    it("pergunta de outra pesquisa → 422 UNKNOWN_QUESTION", async () => {
      const other = await createPublishedSurvey();
      const body = validBody(s);
      body.answers.push({ questionId: other.q.project.id, text: "x" });
      const response = await submit(s.survey.slug, body);
      expect(response.status).toBe(422);
      expect(await errorCode(response)).toBe("UNKNOWN_QUESTION");
    });

    it("opção ou pergunta arquivada → 422", async () => {
      const body = validBody(s);
      body.answers[0] = { questionId: s.q.framework.id, optionIds: [s.o.angular.id] };
      expect(await errorCode(await submit(s.survey.slug, body))).toBe("UNKNOWN_OPTION");

      const withArchived = validBody(s);
      withArchived.answers.push({ questionId: s.q.archived.id, text: "x" });
      expect(await errorCode(await submit(s.survey.slug, withArchived))).toBe("UNKNOWN_QUESTION");
    });
  });

  describe("CT-03: quantidade de seleções", () => {
    it("escolha única com duas opções → 422", async () => {
      const body = validBody(s);
      body.answers[0] = { questionId: s.q.framework.id, optionIds: [s.o.react.id, s.o.vue.id] };
      const response = await submit(s.survey.slug, body);
      expect(response.status).toBe(422);
      expect(await errorCode(response)).toBe("SELECTION_OUT_OF_RANGE");
    });

    it("múltipla escolha acima do máximo → 422", async () => {
      const body = validBody(s);
      body.answers[1] = {
        questionId: s.q.tools.id,
        optionIds: [s.o.vite.id, s.o.jest.id, s.o.bun.id],
      };
      expect(await errorCode(await submit(s.survey.slug, body))).toBe("SELECTION_OUT_OF_RANGE");
    });
  });

  describe("CT-04: obrigatórias", () => {
    it("obrigatória ausente → 422 REQUIRED_MISSING", async () => {
      const body = validBody(s);
      body.answers.splice(0, 1);
      const response = await submit(s.survey.slug, body);
      expect(response.status).toBe(422);
      expect(await errorCode(response)).toBe("REQUIRED_MISSING");
    });

    it("texto só com espaços conta como vazio", async () => {
      const body = validBody(s);
      body.answers[2] = { questionId: s.q.project.id, text: " \t\n " };
      expect(await errorCode(await submit(s.survey.slug, body))).toBe("REQUIRED_MISSING");
    });

    it("texto curto acima de 200 caracteres → 422 TEXT_TOO_LONG", async () => {
      const body = validBody(s);
      body.answers[2] = { questionId: s.q.project.id, text: "x".repeat(201) };
      expect(await errorCode(await submit(s.survey.slug, body))).toBe("TEXT_TOO_LONG");
    });
  });

  describe("CT-05: status da pesquisa", () => {
    it("encerrada → 409 SURVEY_CLOSED", async () => {
      await db.survey.update({ where: { id: s.survey.id }, data: { status: "CLOSED" } });
      const response = await submit(s.survey.slug, validBody(s));
      expect(response.status).toBe(409);
      expect(await errorCode(response)).toBe("SURVEY_CLOSED");
    });

    it.each([
      ["rascunho", { status: "DRAFT" as const }],
      ["excluída", { deletedAt: new Date() }],
    ])("%s → 404", async (_, data) => {
      await db.survey.update({ where: { id: s.survey.id }, data });
      expect((await submit(s.survey.slug, validBody(s))).status).toBe(404);
    });
  });

  it("CT-06: a mesma idempotencyKey duas vezes gera uma resposta; a segunda recebe 200", async () => {
    const body = validBody(s);
    const first = await submit(s.survey.slug, body);
    const second = await submit(s.survey.slug, body);
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect((await second.json()).id).toBe((await first.json()).id);
    expect(await db.surveyResponse.count()).toBe(1);
  });

  it("RF-03 (5): dois envios simultâneos com a mesma chave geram uma resposta", async () => {
    const body = validBody(s);
    const statuses = (await Promise.all([submit(s.survey.slug, body), submit(s.survey.slug, body)]))
      .map((r) => r.status)
      .sort();
    expect(statuses).toEqual([200, 201]);
    expect(await db.surveyResponse.count()).toBe(1);
  });

  it("CT-07: o mesmo cookie com outra chave recebe 409 ALREADY_RESPONDED", async () => {
    expect((await submit(s.survey.slug, validBody(s))).status).toBe(201);
    const again = await submit(s.survey.slug, validBody(s));
    expect(again.status).toBe(409);
    expect(await errorCode(again)).toBe("ALREADY_RESPONDED");

    newBrowser();
    expect((await submit(s.survey.slug, validBody(s))).status).toBe(201);
  });

  describe("passo 1 e formato (8.3)", () => {
    it("Origin de outro site → 403", async () => {
      const response = await submit(s.survey.slug, validBody(s), {
        origin: "https://evil.example",
      });
      expect(response.status).toBe(403);
      expect(await db.surveyResponse.count()).toBe(0);
    });

    it("sem Content-Type JSON → 400", async () => {
      const response = await submit(s.survey.slug, validBody(s), { contentType: "text/plain" });
      expect(response.status).toBe(400);
    });

    it("JSON malformado → 400", async () => {
      expect((await submit(s.survey.slug, null, { raw: "{ quebrado" })).status).toBe(400);
    });

    it("corpo acima de 64 KB → 413", async () => {
      const body = { ...validBody(s), pad: "x".repeat(65 * 1024) };
      const response = await submit(s.survey.slug, body);
      expect(response.status).toBe(413);
      expect(await errorCode(response)).toBe("PAYLOAD_TOO_LARGE");
    });

    it("corpo fora do schema → 422 VALIDATION_ERROR", async () => {
      const response = await submit(s.survey.slug, {
        ...validBody(s),
        idempotencyKey: "não-é-uuid",
      });
      expect(response.status).toBe(422);
      expect(await errorCode(response)).toBe("VALIDATION_ERROR");
    });
  });

  it("o 11º envio no mesmo minuto, do mesmo IP e pesquisa, recebe 429 com Retry-After", async () => {
    const ip = "203.0.113.7";
    for (let i = 0; i < 10; i++) {
      newBrowser();
      expect((await submit(s.survey.slug, validBody(s), { ip })).status).not.toBe(429);
    }
    const eleventh = await submit(s.survey.slug, validBody(s), { ip });
    expect(eleventh.status).toBe(429);
    expect(await errorCode(eleventh)).toBe("RATE_LIMITED");
    expect(Number(eleventh.headers.get("retry-after"))).toBeGreaterThanOrEqual(1);

    // Outro IP segue livre; o IP nunca é gravado em claro.
    newBrowser();
    expect((await submit(s.survey.slug, validBody(s), { ip: "203.0.113.8" })).status).toBe(201);
    const keys = await db.rateLimitBucket.findMany({ select: { key: true } });
    expect(keys.every((k) => !k.key.includes(ip))).toBe(true);
  });
});
