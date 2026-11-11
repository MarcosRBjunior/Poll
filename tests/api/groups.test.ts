import { beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE, PATCH } from "@/app/api/v1/groups/[id]/route";
import { GET as list, POST as create } from "@/app/api/v1/groups/route";
import { PUT as saveSurvey } from "@/app/api/v1/surveys/[id]/route";
import { createSurvey, createUser, db, resetDatabase } from "../fixtures/db";
import { expectAdminOnly } from "../fixtures/permission";
import { sessionAs } from "../fixtures/supabase-mock";

vi.mock(
  "@/lib/supabase/server",
  async () => (await import("../fixtures/supabase-mock")).supabaseServerMock,
);

const ORIGIN = "http://localhost";
const BASE = `${ORIGIN}/api/v1/groups`;

function send(url: string, method: string, body?: unknown) {
  return new Request(url, {
    method,
    headers: { origin: ORIGIN, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const getList = () => list(new Request(BASE), undefined);
const doCreate = (body: unknown) => create(send(BASE, "POST", body), undefined);
const doPatch = (id: string, body: unknown) => PATCH(send(`${BASE}/${id}`, "PATCH", body), ctx(id));
const doDelete = (id: string) => DELETE(send(`${BASE}/${id}`, "DELETE"), ctx(id));

/** Salva a pesquisa pelo construtor só trocando o grupo (RF-16, critério 1). */
async function moveSurvey(surveyId: string, groupId: string | null) {
  const survey = await db.survey.findUniqueOrThrow({ where: { id: surveyId } });
  return saveSurvey(
    send(`${ORIGIN}/api/v1/surveys/${surveyId}`, "PUT", {
      title: survey.title,
      groupId,
      questions: [],
      version: survey.version,
    }),
    ctx(surveyId),
  );
}

let adminId: string;

beforeEach(async () => {
  await resetDatabase();
  adminId = (await createUser({ role: "ADMIN" })).id;
});

describe("permissão (US-4.2): sem sessão 401, usuário comum 404", () => {
  it("vale para listar, criar, renomear e excluir", async () => {
    await expectAdminOnly(getList, adminId);
    await expectAdminOnly(() => doCreate({ name: "Entretenimento" }), adminId);
    const group = await db.surveyGroup.create({ data: { ownerId: adminId, name: "Outro" } });
    await expectAdminOnly(() => doPatch(group.id, { name: "Outro nome" }), adminId);
    expect((await expectAdminOnly(() => doDelete(group.id), adminId)).status).toBe(204);
  });
});

describe("CRUD de grupos (RF-16)", () => {
  it("cria, lista em ordem alfabética com o número de pesquisas ativas", async () => {
    sessionAs(adminId);
    const created = await doCreate({ name: "  Entretenimento ", description: "" });
    expect(created.status).toBe(201);
    const group = await created.json();
    expect(group).toEqual({
      id: expect.any(String),
      name: "Entretenimento",
      description: null,
      surveyCount: 0,
    });
    await doCreate({ name: "Ecossistema JavaScript", description: "Ferramentas e bibliotecas." });

    await createSurvey({ ownerId: adminId, groupId: group.id });
    await createSurvey({ ownerId: adminId, groupId: group.id, deletedAt: new Date() }); // não conta

    const { data } = await (await getList()).json();
    expect(data.map((g: { name: string; surveyCount: number }) => [g.name, g.surveyCount])).toEqual(
      [
        ["Ecossistema JavaScript", 0],
        ["Entretenimento", 1],
      ],
    );
  });

  it("valida nome (2 a 80) e descrição (até 500) com o erro no campo", async () => {
    sessionAs(adminId);
    const response = await doCreate({ name: "A", description: "x".repeat(501) });
    expect(response.status).toBe(422);
    const paths = (await response.json()).error.details.map((d: { path: string }) => d.path);
    expect(paths).toEqual(["name", "description"]);
    expect((await doCreate({ name: "x".repeat(81) })).status).toBe(422);
  });

  it("nome repetido → 409 NAME_TAKEN no campo, ao criar e ao renomear", async () => {
    sessionAs(adminId);
    await doCreate({ name: "Entretenimento" });
    const other = await (await doCreate({ name: "Jogos" })).json();

    const again = await doCreate({ name: "Entretenimento" });
    expect(again.status).toBe(409);
    const body = await again.json();
    expect(body.error.code).toBe("NAME_TAKEN");
    expect(body.error.details[0].path).toBe("name");

    expect((await doPatch(other.id, { name: "Entretenimento" })).status).toBe(409);

    // O nome é único por dono: outro administrador pode usar o mesmo.
    sessionAs((await createUser({ role: "ADMIN" })).id);
    expect((await doCreate({ name: "Entretenimento" })).status).toBe(201);
  });

  it("renomeia e muda a descrição; grupo de outro dono → 404", async () => {
    sessionAs(adminId);
    const group = await (await doCreate({ name: "Entretenimento" })).json();
    const renamed = await doPatch(group.id, { name: "Cultura pop" });
    expect(await renamed.json()).toMatchObject({ name: "Cultura pop", description: null });
    const described = await doPatch(group.id, { description: "Filmes e séries." });
    expect(await described.json()).toMatchObject({
      name: "Cultura pop",
      description: "Filmes e séries.",
    });

    const foreign = await db.surveyGroup.create({
      data: { ownerId: (await createUser({ role: "ADMIN" })).id, name: "Alheio" },
    });
    expect((await doPatch(foreign.id, { name: "Meu" })).status).toBe(404);
    expect((await doDelete(foreign.id)).status).toBe(404);
    expect(await db.surveyGroup.count({ where: { id: foreign.id } })).toBe(1);
  });
});

describe("pesquisas e grupos (RF-16, RN-21)", () => {
  it("critério 1: uma pesquisa entra num grupo, muda de grupo e sai dele", async () => {
    sessionAs(adminId);
    const a = await (await doCreate({ name: "Ecossistema JavaScript" })).json();
    const b = await (await doCreate({ name: "Entretenimento" })).json();
    const survey = await createSurvey({ ownerId: adminId });
    const groupOf = async () =>
      (await db.survey.findUniqueOrThrow({ where: { id: survey.id } })).groupId;

    expect((await moveSurvey(survey.id, a.id)).status).toBe(200);
    expect(await groupOf()).toBe(a.id);
    await moveSurvey(survey.id, b.id);
    expect(await groupOf()).toBe(b.id);
    await moveSurvey(survey.id, null);
    expect(await groupOf()).toBeNull();
  });

  it("não aceita grupo de outro dono no construtor", async () => {
    sessionAs(adminId);
    const foreign = await db.surveyGroup.create({
      data: { ownerId: (await createUser({ role: "ADMIN" })).id, name: "Alheio" },
    });
    const survey = await createSurvey({ ownerId: adminId });
    const response = await moveSurvey(survey.id, foreign.id);
    expect(response.status).toBe(422);
    expect((await response.json()).error.details[0].path).toBe("groupId");
  });

  it("critério 2: excluir o grupo não exclui as pesquisas; elas ficam sem grupo", async () => {
    sessionAs(adminId);
    const group = await (await doCreate({ name: "Entretenimento" })).json();
    const first = await createSurvey({ ownerId: adminId, groupId: group.id });
    const second = await createSurvey({ ownerId: adminId, groupId: group.id });

    expect((await doDelete(group.id)).status).toBe(204);
    const surveys = await db.survey.findMany({ where: { id: { in: [first.id, second.id] } } });
    expect(surveys).toHaveLength(2);
    expect(surveys.every((s) => s.groupId === null && s.deletedAt === null)).toBe(true);
    expect((await doDelete(group.id)).status).toBe(404);
  });
});
