import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as authCallback } from "@/app/api/auth/callback/route";
import { GET as publicTexts } from "@/app/api/v1/public/surveys/[slug]/questions/[questionId]/texts/route";
import { POST as submitResponse } from "@/app/api/v1/public/surveys/[slug]/responses/route";
import { GET as adminExport } from "@/app/api/v1/surveys/[id]/export/route";
import { GET as adminResponses } from "@/app/api/v1/surveys/[id]/responses/route";
import { createUser, db, resetDatabase } from "../fixtures/db";
import { setCookies } from "../fixtures/session";
import { fakeAuth, sessionAs } from "../fixtures/supabase-mock";
import { createPublishedSurvey, validBody } from "../fixtures/surveys";

vi.mock("next/headers", async () => (await import("../fixtures/session")).nextHeadersMock);
vi.mock(
  "@/lib/supabase/server",
  async () => (await import("../fixtures/supabase-mock")).supabaseServerMock,
);

const ORIGIN = "http://localhost";
const ctx = <P extends Record<string, string>>(params: P) => ({ params: Promise.resolve(params) });

/** Tudo que o logger escreveu durante o teste, uma linha JSON por evento. */
let lines: string[];

beforeEach(async () => {
  await resetDatabase();
  // Em desenvolvimento o logger escreve todos os níveis, inclusive debug.
  vi.stubEnv("NODE_ENV", "development");
  lines = [];
  const capture = (line: unknown) => void lines.push(String(line));
  vi.spyOn(console, "log").mockImplementation(capture);
  vi.spyOn(console, "warn").mockImplementation(capture);
  vi.spyOn(console, "error").mockImplementation(capture);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("US-8.2 (2): logs sem conteúdo de respostas nem dados pessoais", () => {
  it("envio, duplicata, erro de validação, leitura do administrador e login com falha", async () => {
    const email = `fulana-${randomUUID()}@exemplo.com`;
    const ip = "203.0.113.77";
    const cookie = randomUUID();
    const comment = `Meu telefone é 11 98888-${randomUUID().slice(0, 4)}`;
    const project = `Projeto secreto ${randomUUID()}`;
    const loginCode = randomUUID();

    const s = await createPublishedSurvey();
    const admin = await createUser({ role: "ADMIN" });
    await db.survey.update({ where: { id: s.survey.id }, data: { ownerId: admin.id } });
    const respondent = await createUser({ email, name: "Fulana de Tal" });

    const body = validBody(s);
    body.answers[2] = { questionId: s.q.project.id, text: project };
    body.answers[3] = { questionId: s.q.comment.id, text: comment };
    const submit = (payload: unknown) =>
      submitResponse(
        new Request(`${ORIGIN}/api/v1/public/surveys/${s.survey.slug}/responses?email=${email}`, {
          method: "POST",
          headers: {
            origin: ORIGIN,
            "content-type": "application/json",
            "x-forwarded-for": ip,
            cookie: `poll_rid=${cookie}`,
          },
          body: JSON.stringify(payload),
        }),
        ctx({ slug: s.survey.slug }),
      );

    // Respondente com login: envio aceito, depois repetido (409) e um inválido (422).
    setCookies([{ name: "poll_rid", value: cookie }]);
    sessionAs(respondent.id);
    expect((await submit(body)).status).toBe(201);
    expect((await submit({ ...body, idempotencyKey: randomUUID() })).status).toBe(409);
    const invalid = { ...body, idempotencyKey: randomUUID() };
    invalid.answers = [{ questionId: s.q.comment.id, text: comment }];
    sessionAs(null);
    setCookies([{ name: "poll_rid", value: randomUUID() }]);
    expect((await submit(invalid)).status).toBe(422);

    // Os textos voltam na resposta (são públicos), mas não no log.
    const texts = await publicTexts(
      new Request(`${ORIGIN}/api/v1/public/surveys/${s.survey.slug}/questions/x/texts`),
      ctx({ slug: s.survey.slug, questionId: s.q.comment.id }),
    );
    expect(await texts.text()).toContain(comment);

    // O administrador lê a tabela individual e baixa o CSV.
    sessionAs(admin.id);
    const table = await adminResponses(
      new Request(`${ORIGIN}/api/v1/surveys/${s.survey.id}/responses`),
      ctx({ id: s.survey.id }),
    );
    expect(await table.text()).toContain(project);
    const csv = await adminExport(
      new Request(`${ORIGIN}/api/v1/surveys/${s.survey.id}/export?format=csv`),
      ctx({ id: s.survey.id }),
    );
    expect(await csv.text()).toContain(comment);

    // Login que falha: o código vem na query string e o Supabase devolve erro.
    fakeAuth.exchangeCodeForSession.mockResolvedValueOnce({
      data: { user: null, session: null },
      error: new Error("invalid grant"),
    });
    const callback = await authCallback(
      new Request(`${ORIGIN}/api/auth/callback?code=${loginCode}&next=/admin`),
      undefined,
    );
    expect(callback.status).toBe(302);

    // Houve log (uma linha por requisição e o aviso do login), todo em JSON.
    const entries = lines.map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(entries.filter((e) => e.msg === "request")).toHaveLength(7);
    expect(entries.some((e) => e.msg === "login callback failed")).toBe(true);
    expect(entries.every((e) => typeof e.requestId === "string")).toBe(true);

    const log = lines.join("\n");
    for (const secret of [
      email,
      "Fulana",
      ip,
      cookie,
      comment,
      project,
      loginCode,
      respondent.id,
      body.idempotencyKey,
    ]) {
      expect(log, `o log contém "${secret}"`).not.toContain(secret);
    }
  });
});
