import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, PUT } from "@/app/api/v1/surveys/[id]/route";
import { POST } from "@/app/api/v1/surveys/route";
import { createUser, resetDatabase } from "../fixtures/db";
import { expectAdminOnly } from "../fixtures/permission";
import { createResultsDataset } from "../fixtures/results";
import { sessionAs } from "../fixtures/supabase-mock";

vi.mock(
  "@/lib/supabase/server",
  async () => (await import("../fixtures/supabase-mock")).supabaseServerMock,
);

const ORIGIN = "http://localhost";
const BASE = `${ORIGIN}/api/v1/surveys`;

type Options = { origin?: string | null; raw?: string };

function send(method: "POST" | "PUT", url: string, body: unknown, options: Options = {}) {
  const headers = new Headers({ "content-type": "application/json" });
  if (options.origin !== null) headers.set("origin", options.origin ?? ORIGIN);
  return new Request(url, { method, headers, body: options.raw ?? JSON.stringify(body) });
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const create = (body: unknown, options?: Options) =>
  POST(send("POST", BASE, body, options), undefined);
const open = (id: string) => GET(new Request(`${BASE}/${id}`), ctx(id));
const save = (id: string, body: unknown, options?: Options) =>
  PUT(send("PUT", `${BASE}/${id}`, body, options), ctx(id));

const draft = {
  title: "Pesquisa nova",
  questions: [
    {
      type: "SINGLE_CHOICE",
      title: "Qual framework?",
      required: true,
      options: [{ label: "React" }, { label: "Vue" }],
    },
  ],
};

let adminId: string;

beforeEach(async () => {
  await resetDatabase();
  adminId = (await createUser({ role: "ADMIN" })).id;
});

describe("POST /api/v1/surveys", () => {
  it("permissão: 401 sem sessão, 404 para usuário comum; administrador cria (201)", async () => {
    const response = await expectAdminOnly(() => create(draft));
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      status: "DRAFT",
      slug: expect.stringMatching(/^pesquisa-nova/),
      version: 1,
      questions: [{ title: "Qual framework?", options: [{ label: "React" }, { label: "Vue" }] }],
    });
  });

  it("sem Origin → 403; JSON malformado → 400; acima de 512 KB → 413", async () => {
    sessionAs(adminId);
    expect((await create(draft, { origin: null })).status).toBe(403);
    expect((await create(draft, { raw: "{" })).status).toBe(400);
    expect((await create(draft, { raw: JSON.stringify({ t: "x".repeat(530_000) }) })).status).toBe(
      413,
    );
  });

  it("RF-05 (3): erro de validação volta com o caminho do campo", async () => {
    sessionAs(adminId);
    const response = await create({ ...draft, title: "ab" });
    expect(response.status).toBe(422);
    expect((await response.json()).error.details).toEqual([
      { path: "title", message: "Use pelo menos 3 caracteres." },
    ]);
  });
});

describe("GET e PUT /api/v1/surveys/{id}", () => {
  it("permissão nas duas rotas", async () => {
    sessionAs(adminId);
    const created = await (await create(draft)).json();
    await expectAdminOnly(() => open(created.id), adminId);
    const response = await expectAdminOnly(
      () => save(created.id, { ...created, version: created.version }),
      adminId,
    );
    expect(response.status).toBe(200);
  });

  it("CT-10: salvar com version desatualizada → 409 VERSION_CONFLICT", async () => {
    sessionAs(adminId);
    const created = await (await create(draft)).json();
    const body = { title: "Primeira aba", questions: created.questions, version: created.version };
    expect((await save(created.id, body)).status).toBe(200);
    const stale = await save(created.id, { ...body, title: "Segunda aba" });
    expect(stale.status).toBe(409);
    expect((await stale.json()).error.code).toBe("VERSION_CONFLICT");
  });

  it("CT-09 na API: trocar o tipo com respostas → 422 EDIT_NOT_ALLOWED", async () => {
    const d = await createResultsDataset({ ownerId: adminId });
    sessionAs(adminId);
    const detail = await (await open(d.survey.id)).json();
    type Item = { id: string; type: string; archivedAt: string | null; options: Item[] };
    // Como o construtor: só perguntas e opções ativas voltam no PUT.
    const active = (detail.questions as Item[])
      .filter((q) => !q.archivedAt)
      .map((q) => ({ ...q, options: q.options.filter((o) => !o.archivedAt) }));
    const response = await save(d.survey.id, {
      title: detail.title,
      version: detail.version,
      questions: active.map((q) => (q.id === d.q.comment.id ? { ...q, type: "SHORT_TEXT" } : q)),
    });
    expect(response.status).toBe(422);
    expect((await response.json()).error).toMatchObject({
      code: "EDIT_NOT_ALLOWED",
      details: [{ path: "questions.3.type" }],
    });
  });

  it("GET de outro administrador → 404; detalhe inclui itens arquivados marcados", async () => {
    const d = await createResultsDataset({ ownerId: adminId });
    sessionAs((await createUser({ role: "ADMIN" })).id);
    expect((await open(d.survey.id)).status).toBe(404);

    sessionAs(adminId);
    const detail = await (await open(d.survey.id)).json();
    expect(detail).toMatchObject({ hasResponses: true, responseCount: 10 });
    expect(detail.questions.at(-1)).toMatchObject({
      title: "Pergunta antiga",
      archivedAt: expect.any(String),
    });
  });
});
