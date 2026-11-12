import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/v1/trends/route";
import { subtractMonths } from "@/features/trends/periods";
import { todayIso } from "@/lib/format";
import { createUser, db, resetDatabase } from "../fixtures/db";
import { expectAdminOnly } from "../fixtures/permission";
import { sessionAs } from "../fixtures/supabase-mock";
import { createTrendsDataset } from "../fixtures/trends";

vi.mock(
  "@/lib/supabase/server",
  async () => (await import("../fixtures/supabase-mock")).supabaseServerMock,
);
vi.mock("next/headers", async () => (await import("../fixtures/session")).nextHeadersMock);

const get = (query = "") => GET(new Request(`http://localhost/api/v1/trends${query}`), undefined);
const OCTOBER = "from=2026-10-01&to=2026-10-31";
const WEEKS = ["2026-09-28", "2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26"];

let adminId: string;
let d: Awaited<ReturnType<typeof createTrendsDataset>>;

beforeEach(async () => {
  await resetDatabase();
  adminId = (await createUser({ role: "ADMIN" })).id;
  sessionAs(adminId);
  d = await createTrendsDataset(adminId);
});

describe("GET /api/v1/trends (RF-17, US-7.2)", () => {
  it("permissão: 401 sem sessão, 404 para usuário comum", async () => {
    expect((await expectAdminOnly(() => get(`?${OCTOBER}`), adminId)).status).toBe(200);
  });

  it("US-7.2 (2): as três métricas batem com o cálculo manual (por semana)", async () => {
    const response = await get(`?groupId=${d.group.id}&${OCTOBER}&bucket=week`);
    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.query).toEqual({
      groupId: d.group.id,
      from: "2026-10-01",
      to: "2026-10-31",
      bucket: "week",
    });
    expect(body.periods).toEqual(WEEKS);
    expect(body.summary).toEqual({
      responses: 10,
      surveysWithResponses: 2,
      busiestPeriod: { period: "2026-10-05", count: 5 },
    });

    // Participação: excluída, rascunho, sem grupo e de outro dono ficam de fora.
    expect(
      body.participation.map((s: { title: string; total: number; points: { count: number }[] }) => [
        s.title,
        s.total,
        s.points.map((p) => p.count),
      ]),
    ).toEqual([
      ["Bundlers de outubro", 7, [0, 4, 1, 1, 1]],
      ["Bundlers de novembro", 3, [0, 1, 0, 2, 0]],
    ]);

    // Preferências: só perguntas de escolha; opção removida não entra no ranking.
    const ranking = body.topOptions.map(
      (q: {
        title: string;
        answeredCount: number;
        options: { label: string; count: number; percent: number }[];
      }) => [q.title, q.answeredCount, q.options.map((o) => [o.label, o.count, o.percent])],
    );
    expect(ranking).toEqual([
      [
        "Bundler?",
        7,
        [
          ["Vite", 3, 42.9],
          ["Webpack", 3, 42.9],
        ],
      ],
      [
        "Testes?",
        5,
        [
          ["Vitest", 4, 80],
          ["Jest", 3, 60],
        ],
      ],
      [
        "Bundler?",
        3,
        [
          ["Vite", 2, 66.7],
          ["Webpack", 1, 33.3],
        ],
      ],
    ]);
    expect(body.topOptions[0]).toMatchObject({
      surveyId: d.s1.id,
      surveyTitle: "Bundlers de outubro",
      questionId: d.q1.id,
      type: "SINGLE_CHOICE",
    });

    // Evolução (RN-16 por período): escolhas da opção ÷ quem respondeu a pergunta no período.
    const trend = (questionId: string, optionId: string) =>
      body.optionTrends.find(
        (t: { questionId: string; optionId: string }) =>
          t.questionId === questionId && t.optionId === optionId,
      );
    expect(trend(d.q1.id, d.q1.o.Vite!).points).toEqual([
      { period: "2026-09-28", answeredCount: 0, count: 0, percent: null },
      { period: "2026-10-05", answeredCount: 4, count: 2, percent: 50 },
      { period: "2026-10-12", answeredCount: 1, count: 0, percent: 0 },
      { period: "2026-10-19", answeredCount: 1, count: 1, percent: 100 },
      { period: "2026-10-26", answeredCount: 1, count: 0, percent: 0 },
    ]);
    expect(
      trend(d.q2.id, d.q2.o.Vitest!).points.map((p: { percent: number | null }) => p.percent),
    ).toEqual([null, 66.7, 100, 100, null]);
    expect(trend(d.q1.id, d.q1.o.Rollup!)).toBeUndefined();
    // 2 opções ativas em cada uma das 3 perguntas de escolha.
    expect(body.optionTrends).toHaveLength(6);
  });

  it("por mês, um período só com o total do grupo", async () => {
    const body = await (await get(`?groupId=${d.group.id}&${OCTOBER}&bucket=month`)).json();
    expect(body.periods).toEqual(["2026-10-01"]);
    expect(body.summary).toEqual({
      responses: 10,
      surveysWithResponses: 2,
      busiestPeriod: { period: "2026-10-01", count: 10 },
    });
    expect(
      body.participation.map((s: { points: { count: number }[] }) => s.points[0]!.count),
    ).toEqual([7, 3]);
  });

  it("sem grupo: todas as pesquisas do administrador, inclusive as sem grupo", async () => {
    const body = await (await get(`?${OCTOBER}`)).json();
    expect(body.query.groupId).toBeNull();
    expect(body.participation.map((s: { title: string }) => s.title)).toEqual([
      "Bundlers de outubro",
      "Bundlers de novembro",
      "Filmes",
    ]);
    expect(body.summary).toEqual({
      responses: 11,
      surveysWithResponses: 3,
      busiestPeriod: { period: "2026-10-05", count: 5 },
    });
    expect(body.topOptions.map((q: { questionId: string }) => q.questionId)).toContain(d.q5.id);
  });

  it("RF-17 (2): grupo sem respostas no período devolve tudo vazio", async () => {
    const empty = await db.surveyGroup.create({ data: { ownerId: adminId, name: "Vazio" } });
    const body = await (await get(`?groupId=${empty.id}&${OCTOBER}`)).json();
    expect(body.periods).toEqual(WEEKS);
    expect(body.summary).toEqual({ responses: 0, surveysWithResponses: 0, busiestPeriod: null });
    expect(body).toMatchObject({ participation: [], topOptions: [], optionTrends: [] });

    const before = await (await get(`?groupId=${d.group.id}&from=2026-01-01&to=2026-01-31`)).json();
    expect(before.summary.responses).toBe(0);
    expect(before.participation).toEqual([]);
  });

  it("sem período: últimos 3 meses até hoje, por semana", async () => {
    const body = await (await get()).json();
    const today = todayIso();
    expect(body.query).toMatchObject({ from: subtractMonths(today, 3), to: today, bucket: "week" });
  });

  it("grupo de outro dono ou inexistente → 404; parâmetros inválidos → 422", async () => {
    const foreign = await db.surveyGroup.create({
      data: { ownerId: (await createUser({ role: "ADMIN" })).id, name: "Alheio" },
    });
    expect((await get(`?groupId=${foreign.id}`)).status).toBe(404);
    expect((await get("?groupId=nao-existe")).status).toBe(404);

    const invalid = async (query: string) => {
      const response = await get(query);
      expect(response.status).toBe(422);
      return (await response.json()).error.details.map((e: { path: string }) => e.path);
    };
    expect(await invalid("?bucket=day")).toEqual(["bucket"]);
    expect(await invalid("?from=2026-10-31&to=2026-10-01")).toEqual(["to"]);
    expect(await invalid("?from=31/10/2026")).toEqual(["from"]);
    // Só o início, depois de hoje: o fim padrão (hoje) fica antes dele.
    expect(await invalid("?from=2999-01-01")).toEqual(["to"]);
  });
});
