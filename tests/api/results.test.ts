import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as publicResults } from "@/app/api/v1/public/surveys/[slug]/results/route";
import { GET as publicTexts } from "@/app/api/v1/public/surveys/[slug]/questions/[questionId]/texts/route";
import { GET as adminExport } from "@/app/api/v1/surveys/[id]/export/route";
import { GET as adminTexts } from "@/app/api/v1/surveys/[id]/questions/[questionId]/texts/route";
import { GET as adminResponses } from "@/app/api/v1/surveys/[id]/responses/route";
import { GET as adminResults } from "@/app/api/v1/surveys/[id]/results/route";
import { iterateResponses } from "@/features/results/repository";
import { createSurvey, createUser, db, resetDatabase } from "../fixtures/db";
import { expectAdminOnly } from "../fixtures/permission";
import { createResultsDataset, type ResultsDataset } from "../fixtures/results";
import { sessionAs } from "../fixtures/supabase-mock";

vi.mock(
  "@/lib/supabase/server",
  async () => (await import("../fixtures/supabase-mock")).supabaseServerMock,
);

const BASE = "http://localhost/api/v1";
let d: ResultsDataset;

beforeEach(async () => {
  await resetDatabase();
  d = await createResultsDataset();
});

const req = (path: string) => new Request(`${BASE}${path}`);
const ctx = <P extends Record<string, string>>(params: P) => ({ params: Promise.resolve(params) });

const getAdminResults = (id: string, query = "") =>
  adminResults(req(`/surveys/${id}/results${query}`), ctx({ id }));
const getResponses = (id: string, query = "") =>
  adminResponses(req(`/surveys/${id}/responses${query}`), ctx({ id }));
const getAdminTexts = (id: string, questionId: string, query = "") =>
  adminTexts(req(`/surveys/${id}/questions/${questionId}/texts${query}`), ctx({ id, questionId }));
const getExport = (id: string, query = "?format=csv") =>
  adminExport(req(`/surveys/${id}/export${query}`), ctx({ id }));
const getPublicResults = (slug: string, query = "") =>
  publicResults(req(`/public/surveys/${slug}/results${query}`), ctx({ slug }));
const getPublicTexts = (slug: string, questionId: string, query = "") =>
  publicTexts(
    req(`/public/surveys/${slug}/questions/${questionId}/texts${query}`),
    ctx({ slug, questionId }),
  );

describe("GET /api/v1/surveys/{id}/results", () => {
  it("permissão: 401 sem sessão, 404 para usuário comum; o dono recebe o painel", async () => {
    const response = await expectAdminOnly(() => getAdminResults(d.survey.id), d.survey.ownerId);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.totals).toEqual({
      responses: 10,
      firstAt: "2026-10-19T12:00:00.000Z",
      lastAt: "2026-10-22T13:00:00.000Z",
    });
    expect(body.questions).toHaveLength(5);
  });

  it("outro administrador não vê a pesquisa (404)", async () => {
    sessionAs((await createUser({ role: "ADMIN" })).id);
    expect((await getAdminResults(d.survey.id)).status).toBe(404);
  });

  it("período invertido → 422 no campo to", async () => {
    sessionAs(d.survey.ownerId);
    const response = await getAdminResults(d.survey.id, "?from=2026-10-22&to=2026-10-20");
    expect(response.status).toBe(422);
    expect((await response.json()).error.details[0].path).toBe("to");
  });
});

describe("GET /api/v1/surveys/{id}/responses (RF-13)", () => {
  it("permissão e formato: colunas, mais recente primeiro, múltiplas unidas por '; '", async () => {
    const response = await expectAdminOnly(
      () => getResponses(d.survey.id, "?pageSize=3"),
      d.survey.ownerId,
    );
    const body = await response.json();
    expect(body).toMatchObject({ page: 1, pageSize: 3, total: 10 });
    expect(body.columns.map((c: { title: string }) => c.title)).toEqual([
      "Nota",
      "Ferramentas",
      "Framework",
      "Comentário",
      "Pergunta antiga",
    ]);
    expect(body.data.map((r: { submittedAt: string }) => r.submittedAt)).toEqual([
      "2026-10-22T13:00:00.000Z",
      "2026-10-22T12:00:00.000Z",
      "2026-10-22T11:00:00.000Z",
    ]);
    expect(body.data[1].cells).toEqual({
      [d.q.nota.id]: "5",
      [d.q.tools.id]: "Bun",
      [d.q.comment.id]: 'Bom, "muito" bom',
    });

    const last = await (await getResponses(d.survey.id, "?page=4&pageSize=3")).json();
    expect(last.data[0].cells[d.q.tools.id]).toBe("Vite; Jest");
  });

  it("paginação estável: resposta nova depois da primeira página não duplica linhas", async () => {
    sessionAs(d.survey.ownerId);
    const first = await (await getResponses(d.survey.id, "?pageSize=5")).json();
    await db.surveyResponse.create({
      data: {
        surveyId: d.survey.id,
        idempotencyKey: crypto.randomUUID(),
        respondentKey: "nova",
      },
    });
    const asOf = encodeURIComponent(first.asOf);
    const second = await (
      await getResponses(d.survey.id, `?page=2&pageSize=5&asOf=${asOf}`)
    ).json();
    const ids = [...first.data, ...second.data].map((r: { id: string }) => r.id);
    expect(new Set(ids).size).toBe(10);
    expect(second.total).toBe(10);
  });

  it("pageSize acima de 100 → 422", async () => {
    sessionAs(d.survey.ownerId);
    expect((await getResponses(d.survey.id, "?pageSize=101")).status).toBe(422);
  });
});

describe("GET /api/v1/surveys/{id}/questions/{questionId}/texts", () => {
  it("permissão e textos paginados, do mais recente ao mais antigo", async () => {
    const response = await expectAdminOnly(
      () => getAdminTexts(d.survey.id, d.q.comment.id, "?pageSize=2"),
      d.survey.ownerId,
    );
    expect(await response.json()).toEqual({
      data: [
        { text: 'Bom, "muito" bom', submittedAt: "2026-10-22T12:00:00.000Z" },
        { text: "=SOMA(A1)", submittedAt: "2026-10-20T15:00:00.000Z" },
      ],
      page: 1,
      pageSize: 2,
      total: 3,
    });
  });

  it("pergunta de escolha ou de outra pesquisa → 404", async () => {
    sessionAs(d.survey.ownerId);
    expect((await getAdminTexts(d.survey.id, d.q.nota.id)).status).toBe(404);
    const other = await createSurvey({ ownerId: d.survey.ownerId });
    expect((await getAdminTexts(other.id, d.q.comment.id)).status).toBe(404);
  });
});

describe("CT-12: GET /api/v1/surveys/{id}/export (RF-15)", () => {
  it("permissão e arquivo: BOM, ';', todas as respostas, fórmulas neutralizadas", async () => {
    const response = await expectAdminOnly(() => getExport(d.survey.id), d.survey.ownerId);
    expect(response.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("content-disposition")).toMatch(
      new RegExp(`^attachment; filename="pesquisa-${d.survey.slug}-\\d{4}-\\d{2}-\\d{2}\\.csv"$`),
    );

    const bytes = new Uint8Array(await response.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); // BOM UTF-8
    const lines = new TextDecoder().decode(bytes).split("\r\n"); // o decoder descarta o BOM
    expect(lines.at(-1)).toBe("");
    expect(lines[0]).toBe(
      "Resposta;Enviada em;Nota;Ferramentas;Framework;Comentário;Pergunta antiga (removida)",
    );
    expect(lines).toHaveLength(12); // cabeçalho + 10 respostas + linha vazia final
    expect(lines[1]).toBe(`${d.responses[9]!.id};22/10/2026 10:00;0;;;;`);
    expect(lines).toContain(`${d.responses[3]!.id};20/10/2026 12:00;3;Jest;;'=SOMA(A1);`);
    expect(lines).toContain(
      `${d.responses[0]!.id};19/10/2026 09:00;5;"Vite; Jest";React;Ótimo;antigo`,
    );
    expect(lines).toContain(`${d.responses[1]!.id};19/10/2026 23:30;4;Vite;Vue;;"antigo; 2"`);
  });

  it("formato diferente de csv → 422 UNSUPPORTED_FORMAT", async () => {
    sessionAs(d.survey.ownerId);
    const response = await getExport(d.survey.id, "?format=xlsx");
    expect(response.status).toBe(422);
    expect((await response.json()).error.code).toBe("UNSUPPORTED_FORMAT");
  });

  it("lê em lotes sem perder nem repetir respostas", async () => {
    const ids: string[] = [];
    for await (const batch of iterateResponses(d.survey.id, 3)) ids.push(...batch.map((r) => r.id));
    expect(ids).toHaveLength(10);
    expect(new Set(ids).size).toBe(10);
  });
});

describe("CT-16: resultados públicos sem dado de quem respondeu (RN-23)", () => {
  it("results e texts não trazem id de resposta, usuário, e-mail nem chave", async () => {
    const user = await createUser({ email: "respondente@example.com" });
    await db.surveyResponse.update({
      where: { id: d.responses[0]!.id },
      data: { userId: user.id },
    });

    const results = await getPublicResults(d.survey.slug);
    const texts = await getPublicTexts(d.survey.slug, d.q.comment.id);
    expect(results.status).toBe(200);
    expect(texts.status).toBe(200);

    const raw = (await results.text()) + (await texts.text());
    for (const secret of [
      user.id,
      user.email,
      ...d.responses.flatMap((r) => [r.id, r.respondentKey!, r.idempotencyKey]),
    ]) {
      expect(raw).not.toContain(secret);
    }
    expect(raw).not.toMatch(/userId|respondentKey|idempotencyKey|email/);
  });

  it("comentários públicos só têm texto e data", async () => {
    const body = await (await getPublicTexts(d.survey.slug, d.q.comment.id)).json();
    expect(Object.keys(body.data[0]).sort()).toEqual(["submittedAt", "text"]);
  });

  it("rascunho e excluída → 404 nas duas rotas públicas", async () => {
    for (const data of [{ status: "DRAFT" as const }, { deletedAt: new Date() }]) {
      await db.survey.update({ where: { id: d.survey.id }, data });
      expect((await getPublicResults(d.survey.slug)).status).toBe(404);
      expect((await getPublicTexts(d.survey.slug, d.q.comment.id)).status).toBe(404);
      await db.survey.update({
        where: { id: d.survey.id },
        data: { status: "PUBLISHED", deletedAt: null },
      });
    }
  });
});
