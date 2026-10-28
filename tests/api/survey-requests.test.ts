import { beforeEach, describe, expect, it, vi } from "vitest";
import { PATCH } from "@/app/api/v1/survey-requests/[id]/route";
import { GET as mine } from "@/app/api/v1/survey-requests/mine/route";
import { GET as queue, POST as request } from "@/app/api/v1/survey-requests/route";
import { POST as publish } from "@/app/api/v1/surveys/[id]/publish/route";
import { POST as createSurvey } from "@/app/api/v1/surveys/route";
import { createRequest } from "@/features/requests/service";
import { createUser, db, resetDatabase } from "../fixtures/db";
import { expectAdminOnly } from "../fixtures/permission";
import { sessionAs } from "../fixtures/supabase-mock";

vi.mock(
  "@/lib/supabase/server",
  async () => (await import("../fixtures/supabase-mock")).supabaseServerMock,
);

const ORIGIN = "http://localhost";
const BASE = `${ORIGIN}/api/v1/survey-requests`;

function send(url: string, method: string, body: unknown) {
  return new Request(url, {
    method,
    headers: { origin: ORIGIN, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
const ask = (body: unknown = valid) => request(send(BASE, "POST", body), undefined);
const getMine = () => mine(new Request(`${BASE}/mine`), undefined);
const getQueue = (query = "") => queue(new Request(`${BASE}${query}`), undefined);
const patch = (id: string, body: unknown) =>
  PATCH(send(`${BASE}/${id}`, "PATCH", body), { params: Promise.resolve({ id }) });

const valid = {
  topic: "Ferramentas de teste",
  goal: "Saber quais ferramentas de teste a turma usa.",
  suggestedQuestions: "Qual framework de testes você usa?",
  audience: "",
};

let adminId: string;
let userId: string;

beforeEach(async () => {
  await resetDatabase();
  adminId = (await createUser({ role: "ADMIN" })).id;
  userId = (await createUser({ name: "Ana", email: "ana@example.com" })).id;
});

describe("POST /api/v1/survey-requests (RF-21)", () => {
  it("sem sessão → 401; com conta cria como PENDING", async () => {
    sessionAs(null);
    expect((await ask()).status).toBe(401);

    sessionAs(userId);
    const response = await ask();
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      id: expect.any(String),
      topic: "Ferramentas de teste",
      status: "PENDING",
      adminNote: null,
      createdAt: expect.any(String),
      surveyUrl: null,
    });
    const saved = await db.surveyRequest.findFirstOrThrow();
    expect(saved).toMatchObject({ requesterId: userId, audience: null });
  });

  it("valida os tamanhos com o erro no campo", async () => {
    sessionAs(userId);
    const response = await ask({ topic: "Oi", goal: "", audience: "x".repeat(201) });
    expect(response.status).toBe(422);
    expect((await response.json()).error.details.map((d: { path: string }) => d.path)).toEqual([
      "topic",
      "goal",
      "audience",
    ]);
  });

  it("CT-18: a quarta do dia recebe 429 com Retry-After", async () => {
    sessionAs(userId);
    for (let i = 0; i < 3; i++) expect((await ask()).status).toBe(201);
    const fourth = await ask();
    expect(fourth.status).toBe(429);
    expect(Number(fourth.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await fourth.json()).error.message).toMatch(/Tente de novo amanhã/);

    // O limite é por usuário.
    sessionAs(adminId);
    expect((await ask()).status).toBe(201);
  });

  it("o dia vira à meia-noite de Brasília", async () => {
    const at = (iso: string) => new Date(iso);
    for (const time of ["2026-10-26T03:00:00Z", "2026-10-26T12:00:00Z", "2026-10-27T02:59:00Z"]) {
      await createRequest(userId, valid, at(time)); // 00h, 09h e 23h59 de 26/10 em SP
    }
    await expect(createRequest(userId, valid, at("2026-10-27T02:59:30Z"))).rejects.toMatchObject({
      code: "RATE_LIMITED",
      meta: { retryAfter: 30 },
    });
    await expect(createRequest(userId, valid, at("2026-10-27T03:00:00Z"))).resolves.toMatchObject({
      status: "PENDING",
    });
  });
});

describe("GET /api/v1/survey-requests/mine", () => {
  it("CT-18: cada usuário vê só as próprias", async () => {
    sessionAs(userId);
    await ask({ ...valid, topic: "Pedido da Ana" });
    const other = await createUser();
    sessionAs(other.id);
    await ask({ ...valid, topic: "Pedido de outra pessoa" });

    const body = await (await getMine()).json();
    expect(body.data.map((r: { topic: string }) => r.topic)).toEqual(["Pedido de outra pessoa"]);
    sessionAs(null);
    expect((await getMine()).status).toBe(401);
  });
});

describe("fila e mudança de status (RF-22, RN-22)", () => {
  it("fila: só administrador, das mais antigas para as mais novas, com solicitante e filtro", async () => {
    sessionAs(userId);
    const first = await (await ask({ ...valid, topic: "Primeiro pedido" })).json();
    await ask({ ...valid, topic: "Segundo pedido" });

    const response = await expectAdminOnly(() => getQueue(), adminId);
    const body = await response.json();
    expect(body.data.map((r: { topic: string }) => r.topic)).toEqual([
      "Primeiro pedido",
      "Segundo pedido",
    ]);
    expect(body.data[0].requester).toEqual({ name: "Ana", email: "ana@example.com" });

    await patch(first.id, { status: "IN_REVIEW" });
    const pending = await (await getQueue("?status=PENDING")).json();
    expect(pending.data.map((r: { topic: string }) => r.topic)).toEqual(["Segundo pedido"]);
  });

  it("CT-18: só o administrador muda o status (sem sessão 401, usuário comum 404)", async () => {
    sessionAs(userId);
    const created = await (await ask()).json();
    const response = await expectAdminOnly(
      () => patch(created.id, { status: "IN_REVIEW" }),
      adminId,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "IN_REVIEW" });
  });

  it("transições inválidas → 409; recusar exige nota; concluir exige pesquisa ligada", async () => {
    sessionAs(userId);
    const created = await (await ask()).json();
    sessionAs(adminId);

    const done = await patch(created.id, { status: "DONE" });
    expect(done.status).toBe(409);
    expect((await done.json()).error.code).toBe("INVALID_TRANSITION");

    const noNote = await patch(created.id, { status: "REJECTED" });
    expect(noNote.status).toBe(422);
    expect((await noNote.json()).error.details[0].path).toBe("adminNote");

    const rejected = await patch(created.id, {
      status: "REJECTED",
      adminNote: "Já existe uma igual.",
    });
    expect(await rejected.json()).toMatchObject({
      status: "REJECTED",
      adminNote: "Já existe uma igual.",
    });
    expect((await patch(created.id, { status: "IN_REVIEW" })).status).toBe(409); // final

    // RF-22 (4): quem pediu vê a nota da recusa.
    sessionAs(userId);
    const [mineRow] = (await (await getMine()).json()).data;
    expect(mineRow).toMatchObject({ status: "REJECTED", adminNote: "Já existe uma igual." });
  });

  it("RN-22: criar a partir da solicitação a aceita; publicar a conclui e mostra o link", async () => {
    sessionAs(userId);
    const created = await (await ask()).json();

    sessionAs(adminId);
    const survey = {
      title: "Ferramentas de teste",
      requestId: created.id,
      questions: [
        {
          type: "SINGLE_CHOICE",
          title: "Qual framework de testes?",
          required: true,
          options: [{ label: "Vitest" }, { label: "Jest" }],
        },
      ],
    };
    const draft = await (
      await createSurvey(send(`${ORIGIN}/api/v1/surveys`, "POST", survey), undefined)
    ).json();
    expect(draft.requestId).toBe(created.id);
    expect(await db.surveyRequest.findUniqueOrThrow({ where: { id: created.id } })).toMatchObject({
      status: "ACCEPTED",
      surveyId: draft.id,
    });

    // A mesma solicitação não atende uma segunda pesquisa (nada é gravado).
    const again = await createSurvey(send(`${ORIGIN}/api/v1/surveys`, "POST", survey), undefined);
    expect(again.status).toBe(409);
    expect(await db.survey.count()).toBe(1);

    await publish(send(`${ORIGIN}/api/v1/surveys/${draft.id}/publish`, "POST", {}), {
      params: Promise.resolve({ id: draft.id }),
    });
    expect((await db.surveyRequest.findUniqueOrThrow({ where: { id: created.id } })).status).toBe(
      "DONE",
    );

    // RF-22 (3): concluída, quem pediu vê o link da pesquisa.
    sessionAs(userId);
    const [mineRow] = (await (await getMine()).json()).data;
    expect(mineRow).toMatchObject({ status: "DONE", surveyUrl: `${ORIGIN}/s/${draft.slug}` });
  });
});
