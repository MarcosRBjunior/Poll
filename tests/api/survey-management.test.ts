import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as getPublicSurvey } from "@/app/api/v1/public/surveys/[slug]/route";
import { POST as submit } from "@/app/api/v1/public/surveys/[slug]/responses/route";
import { POST as close } from "@/app/api/v1/surveys/[id]/close/route";
import { POST as publish } from "@/app/api/v1/surveys/[id]/publish/route";
import { POST as reopen } from "@/app/api/v1/surveys/[id]/reopen/route";
import { DELETE, PUT } from "@/app/api/v1/surveys/[id]/route";
import { GET as list, POST as create } from "@/app/api/v1/surveys/route";
import { createSurvey, createUser, db, resetDatabase } from "../fixtures/db";
import { expectAdminOnly } from "../fixtures/permission";
import { createResultsDataset } from "../fixtures/results";
import { setCookies } from "../fixtures/session";
import { sessionAs } from "../fixtures/supabase-mock";
import { createPublishedSurvey, validBody } from "../fixtures/surveys";

vi.mock(
  "@/lib/supabase/server",
  async () => (await import("../fixtures/supabase-mock")).supabaseServerMock,
);
vi.mock("next/headers", async () => (await import("../fixtures/session")).nextHeadersMock);

const ORIGIN = "http://localhost";
const BASE = `${ORIGIN}/api/v1/surveys`;

function post(url: string, body?: unknown, method = "POST") {
  return new Request(url, {
    method,
    headers: { origin: ORIGIN, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
type ActionHandler = (
  request: Request,
  context: { params: Promise<{ id: string }> },
) => Promise<Response>;
const action = (handler: ActionHandler, name: string) => (id: string) =>
  handler(post(`${BASE}/${id}/${name}`), ctx(id));
const doPublish = action(publish, "publish");
const doClose = action(close, "close");
const doReopen = action(reopen, "reopen");
const doDelete = (id: string) => DELETE(post(`${BASE}/${id}`, undefined, "DELETE"), ctx(id));
const getList = (query = "") => list(new Request(`${BASE}${query}`), undefined);
const code = async (response: Response) => (await response.json()).error?.code;

const validDraft = {
  title: "Pesquisa para publicar",
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
  sessionAs(adminId);
});

async function createDraft(body: unknown = validDraft) {
  return (await create(post(BASE, body), undefined)).json();
}

describe("CT-11: publicar, encerrar e reabrir (RF-11, RN-15, RN-20)", () => {
  it("permissão nas três rotas e na exclusão", async () => {
    const draft = await createDraft();
    expect((await expectAdminOnly(() => doPublish(draft.id), adminId)).status).toBe(200);
    expect((await expectAdminOnly(() => doClose(draft.id), adminId)).status).toBe(200);
    expect((await expectAdminOnly(() => doReopen(draft.id), adminId)).status).toBe(200);
    expect((await expectAdminOnly(() => doDelete(draft.id), adminId)).status).toBe(204);
  });

  it("publicar devolve status, data e link público; o slug fica fixo depois", async () => {
    const draft = await createDraft();
    const response = await doPublish(draft.id);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "PUBLISHED",
      publishedAt: expect.any(String),
      publicUrl: `${ORIGIN}/s/pesquisa-para-publicar`,
    });

    const saved = await db.survey.findUniqueOrThrow({ where: { id: draft.id } });
    const edit = await PUT(
      post(
        `${BASE}/${draft.id}`,
        { ...validDraft, title: "Outro título", version: saved.version },
        "PUT",
      ),
      ctx(draft.id),
    );
    expect((await edit.json()).slug).toBe("pesquisa-para-publicar");
  });

  it("RF-11 (1): rascunho inválido lista os erros e não muda o status", async () => {
    const draft = await createDraft({
      title: "Incompleta",
      questions: [
        { type: "SHORT_TEXT", title: "Texto ok", required: false, options: [] },
        {
          type: "MULTIPLE_CHOICE",
          title: "Só uma opção",
          required: true,
          options: [{ label: "A" }],
        },
      ],
    });
    const response = await doPublish(draft.id);
    expect(response.status).toBe(422);
    expect((await response.json()).error).toMatchObject({
      code: "NOT_PUBLISHABLE",
      details: [
        {
          path: "questions.1.options",
          message: "Pergunta de escolha precisa de pelo menos 2 opções.",
        },
      ],
    });

    const empty = await createDraft({ title: "Sem perguntas", questions: [] });
    expect((await (await doPublish(empty.id)).json()).error.details).toEqual([
      { path: "questions", message: "Adicione pelo menos uma pergunta." },
    ]);
    expect((await db.survey.findUniqueOrThrow({ where: { id: draft.id } })).status).toBe("DRAFT");
  });

  it("transições inválidas → 409 INVALID_TRANSITION", async () => {
    const draft = await createDraft();
    expect(await code(await doClose(draft.id))).toBe("INVALID_TRANSITION"); // DRAFT → CLOSED
    expect(await code(await doReopen(draft.id))).toBe("INVALID_TRANSITION"); // DRAFT → reabrir
    await doPublish(draft.id);
    expect(await code(await doPublish(draft.id))).toBe("INVALID_TRANSITION"); // já publicada
    expect(await code(await doReopen(draft.id))).toBe("INVALID_TRANSITION"); // publicada → reabrir
    await doClose(draft.id);
    expect(await code(await doClose(draft.id))).toBe("INVALID_TRANSITION"); // já encerrada
    expect(await code(await doPublish(draft.id))).toBe("INVALID_TRANSITION"); // encerrada → publicar
    expect((await doClose(draft.id)).status).toBe(409);
  });

  it("RF-11 (3) e (4): encerrada recusa envios com 409; reaberta aceita no mesmo link", async () => {
    const s = await createPublishedSurvey({ ownerId: adminId });
    setCookies([{ name: "poll_rid", value: randomUUID() }]);
    const send = () =>
      submit(
        new Request(`${ORIGIN}/api/v1/public/surveys/${s.survey.slug}/responses`, {
          method: "POST",
          headers: {
            origin: ORIGIN,
            "content-type": "application/json",
            "x-forwarded-for": "10.1.1.1",
          },
          body: JSON.stringify(validBody(s)),
        }),
        { params: Promise.resolve({ slug: s.survey.slug }) },
      );

    await doClose(s.survey.id);
    const closed = await send();
    expect(closed.status).toBe(409);
    expect(await code(closed)).toBe("SURVEY_CLOSED");

    expect(await (await doReopen(s.survey.id)).json()).toEqual({ status: "PUBLISHED" });
    expect((await send()).status).toBe(201);
    const reopened = await db.survey.findUniqueOrThrow({ where: { id: s.survey.id } });
    expect(reopened).toMatchObject({ slug: s.survey.slug, closedAt: null });
  });

  it("pesquisa de outro administrador → 404", async () => {
    const other = await createSurvey({ status: "DRAFT" });
    expect((await doPublish(other.id)).status).toBe(404);
    expect((await doDelete(other.id)).status).toBe(404);
  });
});

describe("DELETE /api/v1/surveys/{id} (RF-10, RN-19)", () => {
  it("exclusão lógica: some da lista e o link público passa a 404", async () => {
    const s = await createPublishedSurvey({ ownerId: adminId });
    expect((await doDelete(s.survey.id)).status).toBe(204);
    expect(
      (await db.survey.findUniqueOrThrow({ where: { id: s.survey.id } })).deletedAt,
    ).not.toBeNull();
    expect((await getList()).status).toBe(200);
    expect((await (await getList()).json()).total).toBe(0);
    const pub = await getPublicSurvey(
      new Request(`${ORIGIN}/api/v1/public/surveys/${s.survey.slug}`),
      {
        params: Promise.resolve({ slug: s.survey.slug }),
      },
    );
    expect(pub.status).toBe(404);
    expect((await doDelete(s.survey.id)).status).toBe(404); // já excluída
  });
});

describe("GET /api/v1/surveys (RF-08)", () => {
  it("permissão, ordem pela última alteração e contagem igual à do painel", async () => {
    const d = await createResultsDataset({ ownerId: adminId, title: "Resultados de teste" });
    await createDraft({ title: "Rascunho mais novo", questions: [] });
    const response = await expectAdminOnly(() => getList(), adminId);
    const body = await response.json();
    expect(body).toMatchObject({ page: 1, pageSize: 20, total: 2 });
    expect(body.data.map((s: { title: string }) => s.title)).toEqual([
      "Rascunho mais novo",
      "Resultados de teste",
    ]);
    expect(body.data[1]).toMatchObject({
      id: d.survey.id,
      status: "PUBLISHED",
      responseCount: 10,
      lastResponseAt: "2026-10-22T13:00:00.000Z",
    });
    expect(body.data[0]).toMatchObject({ responseCount: 0, lastResponseAt: null });
  });

  it("RF-08 (2): filtros combinados de status, grupo e título; nunca de outro dono", async () => {
    const group = await db.surveyGroup.create({ data: { ownerId: adminId, name: "JS" } });
    await createSurvey({
      ownerId: adminId,
      title: "Ferramentas JS",
      status: "PUBLISHED",
      groupId: group.id,
    });
    await createSurvey({
      ownerId: adminId,
      title: "Ferramentas de teste",
      status: "DRAFT",
      groupId: group.id,
    });
    await createSurvey({ ownerId: adminId, title: "Filmes", status: "PUBLISHED" });
    await createSurvey({ title: "Ferramentas de outro dono", status: "PUBLISHED" });

    const titles = async (query: string) =>
      (await (await getList(query)).json()).data.map((s: { title: string }) => s.title).sort();
    expect(await titles("?q=ferramentas")).toEqual(["Ferramentas JS", "Ferramentas de teste"]);
    expect(await titles("?q=ferramentas&status=PUBLISHED")).toEqual(["Ferramentas JS"]);
    expect(await titles(`?groupId=${group.id}&status=DRAFT`)).toEqual(["Ferramentas de teste"]);
    expect(await titles("?status=PUBLISHED")).toEqual(["Ferramentas JS", "Filmes"]);
    expect((await getList("?status=ARCHIVED")).status).toBe(422);
  });
});
