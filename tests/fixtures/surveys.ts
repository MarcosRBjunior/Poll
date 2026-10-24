import { randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { createSurvey, db } from "./db";

/**
 * Pesquisa publicada com os quatro tipos de pergunta, fora de ordem no banco para provar
 * a ordenação, e com uma pergunta e uma opção arquivadas que não podem aparecer.
 */
export async function createPublishedSurvey(data: Partial<Prisma.SurveyUncheckedCreateInput> = {}) {
  const survey = await createSurvey({ status: "PUBLISHED", publishedAt: new Date(), ...data });
  const question = (q: Omit<Prisma.QuestionUncheckedCreateInput, "surveyId">) =>
    db.question.create({ data: { ...q, surveyId: survey.id } });
  const option = (questionId: string, label: string, position: number, archived = false) =>
    db.questionOption.create({
      data: { questionId, label, position, archivedAt: archived ? new Date() : null },
    });

  const comment = await question({
    type: "LONG_TEXT",
    title: "Comentário",
    position: 3,
    required: false,
  });
  const framework = await question({ type: "SINGLE_CHOICE", title: "Framework?", position: 0 });
  const tools = await question({
    type: "MULTIPLE_CHOICE",
    title: "Ferramentas?",
    position: 1,
    minSelections: 1,
    maxSelections: 2,
  });
  const project = await question({ type: "SHORT_TEXT", title: "Nome do projeto", position: 2 });
  const archived = await question({
    type: "SHORT_TEXT",
    title: "Pergunta arquivada",
    position: 4,
    archivedAt: new Date(),
  });

  const vue = await option(framework.id, "Vue", 1);
  const react = await option(framework.id, "React", 0);
  const angular = await option(framework.id, "Angular", 2, true);
  const vite = await option(tools.id, "Vite", 0);
  const jest = await option(tools.id, "Jest", 1);
  const bun = await option(tools.id, "Bun", 2);

  return {
    survey,
    q: { framework, tools, project, comment, archived },
    o: { react, vue, angular, vite, jest, bun },
  };
}

export type PublishedSurvey = Awaited<ReturnType<typeof createPublishedSurvey>>;

/** Corpo válido: responde todas as obrigatórias e o comentário. */
export function validBody(s: PublishedSurvey, idempotencyKey: string = randomUUID()) {
  return {
    idempotencyKey,
    answers: [
      { questionId: s.q.framework.id, optionIds: [s.o.react.id] },
      { questionId: s.q.tools.id, optionIds: [s.o.vite.id, s.o.jest.id] },
      { questionId: s.q.project.id, text: "  Poll  " },
      { questionId: s.q.comment.id, text: "Sinto falta de uma ferramenta X" },
    ],
  };
}
