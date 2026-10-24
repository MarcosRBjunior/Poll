import { beforeEach, describe, expect, it } from "vitest";
import { getAdminResults, getPublicResults } from "@/features/results/service";
import { AppError } from "@/lib/errors";
import { createSurvey, createUser, db, resetDatabase } from "../fixtures/db";
import { createResultsDataset, type ResultsDataset } from "../fixtures/results";

let d: ResultsDataset;

beforeEach(async () => {
  await resetDatabase();
  d = await createResultsDataset();
});

const question = (results: Awaited<ReturnType<typeof getPublicResults>>, id: string) =>
  results.questions.find((q) => q.id === id)!;

describe("CT-08: números exatos sobre 10 respostas conhecidas (RF-12, RN-16)", () => {
  it("totais, primeira e última resposta e respostas por dia no fuso de São Paulo", async () => {
    const results = await getPublicResults(d.survey.slug, {});
    expect(results.survey).toEqual({
      slug: d.survey.slug,
      title: "Pesquisa do CT-08",
      status: "PUBLISHED",
    });
    expect(results.totals).toEqual({
      responses: 10,
      firstAt: new Date("2026-10-19T12:00:00Z"),
      lastAt: new Date("2026-10-22T13:00:00Z"),
    });
    expect(results.perDay).toEqual([
      { date: "2026-10-19", count: 2 },
      { date: "2026-10-20", count: 4 },
      { date: "2026-10-21", count: 0 },
      { date: "2026-10-22", count: 4 },
    ]);
  });

  it("escolha única com valores: contagens, percentuais, média e mediana", async () => {
    const nota = question(await getPublicResults(d.survey.slug, {}), d.q.nota.id);
    expect(nota.answeredCount).toBe(10);
    expect(nota.options.map((o) => [o.label, o.count, o.percent, o.archived])).toEqual([
      ["1", 1, 10, false],
      ["2", 1, 10, false],
      ["3", 1, 10, false],
      ["4", 3, 30, false],
      ["5", 3, 30, false],
      ["0", 1, 10, true],
    ]);
    expect(nota.numeric).toEqual({ mean: 3.3, median: 4 });
    expect(nota.textCount).toBeNull();
  });

  it("múltipla escolha: percentual sobre quem respondeu, somando mais de 100%", async () => {
    const tools = question(await getPublicResults(d.survey.slug, {}), d.q.tools.id);
    expect(tools.answeredCount).toBe(8);
    expect(tools.options.map((o) => [o.label, o.count, o.percent])).toEqual([
      ["Vite", 5, 62.5],
      ["Jest", 3, 37.5],
      ["Bun", 3, 37.5],
      ["Webpack", 1, 12.5],
    ]);
    expect(tools.options.reduce((sum, o) => sum + o.percent, 0)).toBe(150);
    expect(tools.numeric).toBeNull(); // só escolha única tem média (decisão da F5)
  });

  it("escolha única sem valores e opcional: sem média, base só de quem respondeu", async () => {
    const framework = question(await getPublicResults(d.survey.slug, {}), d.q.framework.id);
    expect(framework.answeredCount).toBe(3);
    expect(framework.options.map((o) => o.percent)).toEqual([66.7, 33.3]);
    expect(framework.numeric).toBeNull();
  });

  it("texto conta as respostas; removida aparece no fim, marcada, com dados históricos", async () => {
    const results = await getPublicResults(d.survey.slug, {});
    expect(results.questions.map((q) => [q.title, q.archived])).toEqual([
      ["Nota", false],
      ["Ferramentas", false],
      ["Framework", false],
      ["Comentário", false],
      ["Pergunta antiga", true],
    ]);
    expect(question(results, d.q.comment.id)).toMatchObject({ textCount: 3, options: [] });
    expect(question(results, d.q.removed.id)).toMatchObject({ textCount: 2, answeredCount: 2 });
  });

  it("média só quando todas as opções ativas têm valor", async () => {
    await db.questionOption.create({
      data: { questionId: d.q.nota.id, label: "Não sei", position: 6 },
    });
    expect(question(await getPublicResults(d.survey.slug, {}), d.q.nota.id).numeric).toBeNull();
  });
});

describe("filtro de período", () => {
  it("usa os limites do dia em São Paulo, com o fim incluído", async () => {
    const results = await getPublicResults(d.survey.slug, { from: "2026-10-20", to: "2026-10-20" });
    expect(results.totals.responses).toBe(4);
    expect(results.perDay).toEqual([{ date: "2026-10-20", count: 4 }]);
    expect(question(results, d.q.tools.id).answeredCount).toBe(4);
    expect(question(results, d.q.nota.id).numeric).toEqual({ mean: 3.5, median: 3.5 });
  });

  it("período sem respostas devolve zeros, sem média", async () => {
    const results = await getPublicResults(d.survey.slug, { from: "2026-11-01" });
    expect(results.totals).toEqual({ responses: 0, firstAt: null, lastAt: null });
    expect(results.perDay).toEqual([]);
    expect(question(results, d.q.nota.id)).toMatchObject({ answeredCount: 0, numeric: null });
    expect(question(results, d.q.nota.id).options.every((o) => o.percent === 0)).toBe(true);
  });

  it("início depois do fim → VALIDATION_ERROR", async () => {
    await expect(
      getPublicResults(d.survey.slug, { from: "2026-10-22", to: "2026-10-20" }),
    ).rejects.toMatchObject({ name: "ZodError" });
  });
});

describe("visibilidade (RN-23, RN-12)", () => {
  const notFound = { code: "NOT_FOUND" } satisfies Partial<AppError>;

  it("pública: encerrada aparece; rascunho, excluída e inexistente → 404", async () => {
    await db.survey.update({ where: { id: d.survey.id }, data: { status: "CLOSED" } });
    expect((await getPublicResults(d.survey.slug, {})).survey.status).toBe("CLOSED");

    const draft = await createSurvey({ status: "DRAFT" });
    const deleted = await createSurvey({ status: "PUBLISHED", deletedAt: new Date() });
    for (const slug of [draft.slug, deleted.slug, "nao-existe"]) {
      await expect(getPublicResults(slug, {})).rejects.toMatchObject(notFound);
    }
  });

  it("administrador: vê rascunho próprio; de outro dono ou excluída → 404", async () => {
    const draft = await createSurvey({ status: "DRAFT", ownerId: d.survey.ownerId });
    expect((await getAdminResults(d.survey.ownerId, draft.id, {})).totals.responses).toBe(0);
    expect((await getAdminResults(d.survey.ownerId, d.survey.id, {})).totals.responses).toBe(10);

    const otherAdmin = await createUser({ role: "ADMIN" });
    await expect(getAdminResults(otherAdmin.id, d.survey.id, {})).rejects.toMatchObject(notFound);

    await db.survey.update({ where: { id: draft.id }, data: { deletedAt: new Date() } });
    await expect(getAdminResults(d.survey.ownerId, draft.id, {})).rejects.toMatchObject(notFound);
  });
});
