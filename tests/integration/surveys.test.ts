import { beforeEach, describe, expect, it } from "vitest";
import { getAdminResults } from "@/features/results/service";
import {
  createSurvey,
  getSurveyDetail,
  updateSurvey,
  type SurveyDetail,
} from "@/features/surveys/service";
import { createUser, db, resetDatabase } from "../fixtures/db";
import { createResultsDataset } from "../fixtures/results";

let adminId: string;

beforeEach(async () => {
  await resetDatabase();
  adminId = (await createUser({ role: "ADMIN" })).id;
});

const draft = {
  title: "Ferramentas do dia a dia",
  description: "Uma pesquisa curta.",
  questions: [
    {
      type: "SINGLE_CHOICE",
      title: "Qual framework?",
      required: true,
      options: [
        { label: "React", value: "" },
        { label: "Vue", value: "" },
      ],
    },
    { type: "SHORT_TEXT", title: "Nome do projeto", required: false, options: [] },
    {
      type: "MULTIPLE_CHOICE",
      title: "Quais ferramentas?",
      required: true,
      minSelections: "1",
      maxSelections: "2",
      options: [{ label: "Vite" }, { label: "Jest" }, { label: "Bun" }],
    },
  ],
};

/** Corpo do PUT a partir do detalhe salvo: só itens ativos, com ids. */
function toBody(detail: SurveyDetail) {
  return {
    version: detail.version,
    title: detail.title,
    description: detail.description,
    isListed: detail.isListed,
    questions: detail.questions
      .filter((q) => !q.archivedAt)
      .map((q) => ({
        ...q,
        options: q.options.filter((o) => !o.archivedAt),
      })),
  };
}

describe("criar rascunho (RF-05)", () => {
  it("cria em DRAFT com slug do título, posições em ordem e version 1", async () => {
    const detail = await createSurvey(adminId, draft);
    expect(detail).toMatchObject({
      status: "DRAFT",
      slug: "ferramentas-do-dia-a-dia",
      version: 1,
      hasResponses: false,
      responseCount: 0,
    });
    expect(detail.questions.map((q) => [q.title, q.type])).toEqual([
      ["Qual framework?", "SINGLE_CHOICE"],
      ["Nome do projeto", "SHORT_TEXT"],
      ["Quais ferramentas?", "MULTIPLE_CHOICE"],
    ]);
    expect(detail.questions[2]).toMatchObject({ minSelections: 1, maxSelections: 2 });
    const positions = await db.question.findMany({
      where: { surveyId: detail.id },
      orderBy: { position: "asc" },
      select: { position: true },
    });
    expect(positions.map((p) => p.position)).toEqual([0, 1, 2]);
  });

  it("RN-20: título repetido ganha sufixo -2, -3", async () => {
    const slugs = [];
    for (let i = 0; i < 3; i++) slugs.push((await createSurvey(adminId, draft)).slug);
    expect(slugs).toEqual([
      "ferramentas-do-dia-a-dia",
      "ferramentas-do-dia-a-dia-2",
      "ferramentas-do-dia-a-dia-3",
    ]);
  });

  it("grupo de outro dono → VALIDATION_ERROR em groupId", async () => {
    const other = await createUser({ role: "ADMIN" });
    const group = await db.surveyGroup.create({ data: { ownerId: other.id, name: "Outro" } });
    await expect(createSurvey(adminId, { ...draft, groupId: group.id })).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      details: [{ path: "groupId", message: "Grupo não encontrado." }],
    });
  });
});

describe("editar sem respostas (RF-09, critério 1)", () => {
  it("tudo pode mudar: tipo, valores, remoção física, reordenação e slug do rascunho", async () => {
    const created = await createSurvey(adminId, draft);
    const body = toBody(created);
    const [framework, project, tools] = body.questions;
    const updated = await updateSurvey(adminId, created.id, {
      ...body,
      title: "Outro título",
      questions: [
        { ...tools!, options: tools!.options.slice(0, 2), maxSelections: 2 },
        { ...framework!, type: "LONG_TEXT", options: [] }, // escolha → texto
        {
          type: "SINGLE_CHOICE",
          title: "Nova pergunta",
          required: true,
          options: [{ label: "Sim", value: 1 }],
        },
      ],
    });
    void project; // removida sem respostas: apagada

    expect(updated).toMatchObject({ version: 2, slug: "outro-titulo" });
    expect(updated.questions.map((q) => [q.title, q.type, q.archivedAt])).toEqual([
      ["Quais ferramentas?", "MULTIPLE_CHOICE", null],
      ["Qual framework?", "LONG_TEXT", null],
      ["Nova pergunta", "SINGLE_CHOICE", null],
    ]);
    expect(await db.question.count({ where: { surveyId: created.id } })).toBe(3);
    expect(await db.questionOption.count({ where: { question: { surveyId: created.id } } })).toBe(
      3,
    );
  });

  it("trocar rótulos entre duas opções não esbarra no índice único (RN-03)", async () => {
    const created = await createSurvey(adminId, draft);
    const body = toBody(created);
    const [react, vue] = body.questions[0]!.options;
    const updated = await updateSurvey(adminId, created.id, {
      ...body,
      questions: [
        {
          ...body.questions[0]!,
          options: [
            { ...react!, label: "Vue" },
            { ...vue!, label: "React" },
          ],
        },
        ...body.questions.slice(1),
      ],
    });
    expect(updated.questions[0]!.options.map((o) => [o.id, o.label])).toEqual([
      [react!.id, "Vue"],
      [vue!.id, "React"],
    ]);
  });

  it("slug fica fixo depois da primeira publicação (RN-20)", async () => {
    const created = await createSurvey(adminId, draft);
    await db.survey.update({
      where: { id: created.id },
      data: { status: "PUBLISHED", publishedAt: new Date() },
    });
    const updated = await updateSurvey(adminId, created.id, {
      ...toBody(created),
      title: "Novo nome",
    });
    expect(updated.slug).toBe("ferramentas-do-dia-a-dia");
  });

  it("id de outra pesquisa ou repetido → VALIDATION_ERROR no campo", async () => {
    const created = await createSurvey(adminId, draft);
    const other = await createSurvey(adminId, draft);
    const body = toBody(created);
    await expect(
      updateSurvey(adminId, created.id, {
        ...body,
        questions: [{ ...body.questions[1]!, id: other.questions[1]!.id }],
      }),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      details: [{ path: "questions.0.id" }],
    });
  });
});

describe("CT-09: editar com respostas, modo restrito (RN-11)", () => {
  it("remover opção com escolhas a arquiva e o painel mantém os resultados antigos", async () => {
    const d = await createResultsDataset({ ownerId: adminId });
    const detail = await getSurveyDetail(adminId, d.survey.id);
    const body = toBody(detail);
    const tools = body.questions.find((q) => q.id === d.q.tools.id)!;

    const updated = await updateSurvey(adminId, d.survey.id, {
      ...body,
      questions: body.questions.map((q) =>
        q.id === tools.id
          ? {
              ...q,
              title: "Ferramentas de build", // corrigir texto pode
              required: false, // obrigatória e limites podem mudar (decisão da F6)
              options: q.options.filter((o) => o.id !== d.o.vite).map((o) => ({ ...o })),
            }
          : q,
      ),
    });

    const vite = await db.questionOption.findUniqueOrThrow({ where: { id: d.o.vite } });
    expect(vite.archivedAt).not.toBeNull();
    expect(updated.questions.find((q) => q.id === tools.id)).toMatchObject({
      title: "Ferramentas de build",
      required: false,
    });

    // RF-09 (2): some do formulário público, mas o painel continua contando.
    const results = await getAdminResults(adminId, d.survey.id, {});
    const toolsResult = results.questions.find((q) => q.id === tools.id)!;
    expect(toolsResult.options.find((o) => o.id === d.o.vite)).toMatchObject({
      archived: true,
      count: 5,
      percent: 62.5,
    });
  });

  it("remover pergunta com respostas a arquiva; sem respostas, apaga", async () => {
    const d = await createResultsDataset({ ownerId: adminId });
    const empty = await db.question.create({
      data: { surveyId: d.survey.id, type: "SHORT_TEXT", title: "Ninguém respondeu", position: 9 },
    });
    const body = toBody(await getSurveyDetail(adminId, d.survey.id));
    await updateSurvey(adminId, d.survey.id, {
      ...body,
      questions: body.questions.filter((q) => q.id !== d.q.framework.id && q.id !== empty.id),
    });
    expect(
      (await db.question.findUnique({ where: { id: d.q.framework.id } }))?.archivedAt,
    ).not.toBeNull();
    expect(await db.question.findUnique({ where: { id: empty.id } })).toBeNull();
  });

  it("trocar o tipo → 422 EDIT_NOT_ALLOWED no campo, sem gravar nada", async () => {
    const d = await createResultsDataset({ ownerId: adminId });
    const body = toBody(await getSurveyDetail(adminId, d.survey.id));
    await expect(
      updateSurvey(adminId, d.survey.id, {
        ...body,
        questions: body.questions.map((q) =>
          q.id === d.q.comment.id ? { ...q, type: "SHORT_TEXT" } : q,
        ),
      }),
    ).rejects.toMatchObject({
      code: "EDIT_NOT_ALLOWED",
      details: [{ path: "questions.3.type" }],
    });
    expect((await db.survey.findUniqueOrThrow({ where: { id: d.survey.id } })).version).toBe(1);
  });

  it("trocar o valor numérico → 422 EDIT_NOT_ALLOWED; manter o valor e mudar o rótulo pode", async () => {
    const d = await createResultsDataset({ ownerId: adminId });
    const body = toBody(await getSurveyDetail(adminId, d.survey.id));
    const nota = body.questions.find((q) => q.id === d.q.nota.id)!;
    const withValue = (value: number, label?: string) => ({
      ...body,
      questions: body.questions.map((q) =>
        q.id === nota.id
          ? {
              ...q,
              options: q.options.map((o, i) =>
                i === 0 ? { ...o, value, label: label ?? o.label } : o,
              ),
            }
          : q,
      ),
    });
    await expect(updateSurvey(adminId, d.survey.id, withValue(10))).rejects.toMatchObject({
      code: "EDIT_NOT_ALLOWED",
      details: [{ path: "questions.0.options.0.value" }],
    });
    const updated = await updateSurvey(adminId, d.survey.id, withValue(1, "Um"));
    expect(updated.questions[0]!.options[0]).toMatchObject({ label: "Um", value: 1 });
  });

  it("adicionar e reordenar pode; posições ficam 0, 1, 2… (RN-13)", async () => {
    const d = await createResultsDataset({ ownerId: adminId });
    const body = toBody(await getSurveyDetail(adminId, d.survey.id));
    const updated = await updateSurvey(adminId, d.survey.id, {
      ...body,
      questions: [
        { type: "LONG_TEXT", title: "Pergunta nova", required: false, options: [] },
        ...body.questions.reverse(),
      ],
    });
    expect(updated.questions.filter((q) => !q.archivedAt).map((q) => q.title)).toEqual([
      "Pergunta nova",
      "Comentário",
      "Framework",
      "Ferramentas",
      "Nota",
    ]);
    const active = await db.question.findMany({
      where: { surveyId: d.survey.id, archivedAt: null },
      orderBy: { position: "asc" },
      select: { position: true },
    });
    expect(active.map((q) => q.position)).toEqual([0, 1, 2, 3, 4]);
  });
});

describe("CT-10 / RN-17: conflito de versão e dono", () => {
  it("version desatualizada → VERSION_CONFLICT", async () => {
    const created = await createSurvey(adminId, draft);
    const body = toBody(created);
    await updateSurvey(adminId, created.id, body);
    await expect(updateSurvey(adminId, created.id, body)).rejects.toMatchObject({
      code: "VERSION_CONFLICT",
    });
  });

  it("dois salvamentos simultâneos da mesma versão: só um grava", async () => {
    const created = await createSurvey(adminId, draft);
    const body = toBody(created);
    const results = await Promise.allSettled([
      updateSurvey(adminId, created.id, { ...body, title: "Primeira aba" }),
      updateSurvey(adminId, created.id, { ...body, title: "Segunda aba" }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"]);
    expect((await db.survey.findUniqueOrThrow({ where: { id: created.id } })).version).toBe(2);
  });

  it("pesquisa de outro administrador ou excluída → NOT_FOUND", async () => {
    const created = await createSurvey(adminId, draft);
    const other = await createUser({ role: "ADMIN" });
    await expect(getSurveyDetail(other.id, created.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await db.survey.update({ where: { id: created.id }, data: { deletedAt: new Date() } });
    await expect(getSurveyDetail(adminId, created.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
