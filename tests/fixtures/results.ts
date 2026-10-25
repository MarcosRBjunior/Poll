import { randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { createSurvey, db } from "./db";

/**
 * Conjunto fixo de 10 respostas do CT-08, com os números esperados calculados à mão.
 *
 * - nota (escolha única, valores 1 a 5, mais a opção "0" removida com valor 0):
 *   5,4,4,3,5,2,4,1,5,0 → média 3,3; mediana 4.
 * - ferramentas (múltipla): Vite 5, Jest 3, Bun 3, Webpack (removida) 1, de 8 que
 *   responderam → 62,5% + 37,5% + 37,5% + 12,5% = 150%.
 * - framework (escolha única sem valores, opcional): React 2, Vue 1 de 3.
 * - comentário (texto longo, opcional): 3 textos, um deles começando com "=".
 * - pergunta removida (texto curto arquivado): 2 textos.
 *
 * Dias em America/Sao_Paulo: 19/10 → 2 (uma às 23h30 local, 02h30 UTC do dia 20),
 * 20/10 → 4, 21/10 → 0, 22/10 → 4.
 */
export async function createResultsDataset(data: Partial<Prisma.SurveyUncheckedCreateInput> = {}) {
  const survey = await createSurvey({
    title: "Pesquisa do CT-08",
    status: "PUBLISHED",
    publishedAt: new Date("2026-10-19T00:00:00Z"),
    ...data,
  });
  const question = (q: Omit<Prisma.QuestionUncheckedCreateInput, "surveyId">) =>
    db.question.create({ data: { ...q, surveyId: survey.id } });
  const option = (questionId: string, label: string, position: number, extra = {}) =>
    db.questionOption.create({ data: { questionId, label, position, ...extra } });

  const nota = await question({ type: "SINGLE_CHOICE", title: "Nota", position: 0 });
  const tools = await question({ type: "MULTIPLE_CHOICE", title: "Ferramentas", position: 1 });
  const framework = await question({
    type: "SINGLE_CHOICE",
    title: "Framework",
    position: 2,
    required: false,
  });
  const comment = await question({
    type: "LONG_TEXT",
    title: "Comentário",
    position: 3,
    required: false,
  });
  const removed = await question({
    type: "SHORT_TEXT",
    title: "Pergunta antiga",
    position: 1, // posição repetida de propósito: removida não ocupa lugar
    archivedAt: new Date(),
  });

  const n: Record<number, string> = {};
  for (const value of [1, 2, 3, 4, 5]) {
    n[value] = (await option(nota.id, String(value), value - 1, { value })).id;
  }
  n[0] = (await option(nota.id, "0", 5, { value: 0, archivedAt: new Date() })).id;
  const vite = (await option(tools.id, "Vite", 0)).id;
  const jest = (await option(tools.id, "Jest", 1)).id;
  const bun = (await option(tools.id, "Bun", 2)).id;
  const webpack = (await option(tools.id, "Webpack", 3, { archivedAt: new Date() })).id;
  const react = (await option(framework.id, "React", 0)).id;
  const vue = (await option(framework.id, "Vue", 1)).id;

  type Row = {
    at: string;
    nota: number;
    tools?: string[];
    framework?: string;
    comment?: string;
    removed?: string;
  };
  const rows: Row[] = [
    {
      at: "2026-10-19T12:00:00Z",
      nota: 5,
      tools: [vite, jest],
      framework: react,
      comment: "Ótimo",
      removed: "antigo",
    },
    {
      at: "2026-10-20T02:30:00Z",
      nota: 4,
      tools: [vite],
      framework: vue,
      removed: "antigo; 2",
    },
    { at: "2026-10-20T03:30:00Z", nota: 4, tools: [vite, bun], framework: react },
    { at: "2026-10-20T15:00:00Z", nota: 3, tools: [jest], comment: "=SOMA(A1)" },
    { at: "2026-10-20T15:01:00Z", nota: 5, tools: [vite, jest, bun] },
    { at: "2026-10-20T15:02:00Z", nota: 2, tools: [webpack] },
    { at: "2026-10-22T10:00:00Z", nota: 4 },
    { at: "2026-10-22T11:00:00Z", nota: 1, tools: [vite] },
    { at: "2026-10-22T12:00:00Z", nota: 5, tools: [bun], comment: 'Bom, "muito" bom' },
    { at: "2026-10-22T13:00:00Z", nota: 0 },
  ];

  const responses = [];
  for (const row of rows) {
    const answers: Prisma.AnswerCreateWithoutResponseInput[] = [
      {
        question: { connect: { id: nota.id } },
        selections: { create: [{ optionId: n[row.nota]! }] },
      },
    ];
    if (row.tools) {
      answers.push({
        question: { connect: { id: tools.id } },
        selections: { create: row.tools.map((optionId) => ({ optionId })) },
      });
    }
    if (row.framework) {
      answers.push({
        question: { connect: { id: framework.id } },
        selections: { create: [{ optionId: row.framework }] },
      });
    }
    if (row.comment)
      answers.push({ question: { connect: { id: comment.id } }, textValue: row.comment });
    if (row.removed)
      answers.push({ question: { connect: { id: removed.id } }, textValue: row.removed });

    responses.push(
      await db.surveyResponse.create({
        data: {
          surveyId: survey.id,
          respondentKey: randomUUID().replaceAll("-", ""),
          idempotencyKey: randomUUID(),
          submittedAt: new Date(row.at),
          answers: { create: answers },
        },
      }),
    );
  }

  return {
    survey,
    q: { nota, tools, framework, comment, removed },
    o: { n, vite, jest, bun, webpack, react, vue },
    responses,
  };
}

export type ResultsDataset = Awaited<ReturnType<typeof createResultsDataset>>;
