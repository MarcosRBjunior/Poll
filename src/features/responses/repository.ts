import { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";

// Uma consulta traz a pesquisa com perguntas e opções ativas, já ordenadas (RF-01, RN-13).
const surveySelect = {
  id: true,
  slug: true,
  title: true,
  description: true,
  status: true,
  deletedAt: true,
  questions: {
    where: { archivedAt: null },
    orderBy: { position: "asc" },
    select: {
      id: true,
      type: true,
      title: true,
      helpText: true,
      required: true,
      minSelections: true,
      maxSelections: true,
      options: {
        where: { archivedAt: null },
        orderBy: { position: "asc" },
        select: { id: true, label: true },
      },
    },
  },
} satisfies Prisma.SurveySelect;

export type SurveyRecord = Prisma.SurveyGetPayload<{ select: typeof surveySelect }>;

export function findSurveyBySlug(slug: string): Promise<SurveyRecord | null> {
  return getDb().survey.findUnique({ where: { slug }, select: surveySelect });
}

export async function hasRespondentResponse(surveyId: string, respondentKey: string) {
  const found = await getDb().surveyResponse.findUnique({
    where: { surveyId_respondentKey: { surveyId, respondentKey } },
    select: { id: true },
  });
  return found !== null;
}

export async function hasUserResponse(surveyId: string, userId: string) {
  const found = await getDb().surveyResponse.findUnique({
    where: { surveyId_userId: { surveyId, userId } },
    select: { id: true },
  });
  return found !== null;
}

export type ResponseRecord = { id: string; surveyId: string; submittedAt: Date };

export function findResponseByIdempotencyKey(
  idempotencyKey: string,
): Promise<ResponseRecord | null> {
  return getDb().surveyResponse.findUnique({
    where: { idempotencyKey },
    select: { id: true, surveyId: true, submittedAt: true },
  });
}

export type NewResponse = {
  surveyId: string;
  respondentKey: string;
  /** Conta de quem respondeu, quando entrou (D-02). */
  userId?: string | null;
  idempotencyKey: string;
  answers: { questionId: string; text?: string; optionIds?: string[] }[];
};

/**
 * Grava a resposta, uma Answer por pergunta respondida e uma AnswerSelection por opção,
 * numa única escrita aninhada: o Prisma a executa numa transação (RF-04).
 */
export function insertResponse(data: NewResponse): Promise<ResponseRecord> {
  return getDb().surveyResponse.create({
    data: {
      surveyId: data.surveyId,
      respondentKey: data.respondentKey,
      userId: data.userId ?? null,
      idempotencyKey: data.idempotencyKey,
      answers: {
        create: data.answers.map((answer) => ({
          questionId: answer.questionId,
          textValue: answer.text ?? null,
          selections: { create: (answer.optionIds ?? []).map((optionId) => ({ optionId })) },
        })),
      },
    },
    select: { id: true, surveyId: true, submittedAt: true },
  });
}

/** Qual UNIQUE de SurveyResponse um envio concorrente violou, se foi o caso. */
export function responseConflict(error: unknown): "idempotencyKey" | "respondent" | "user" | null {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
    return null;
  }
  const text = JSON.stringify(error.meta ?? {});
  if (text.includes("idempotencyKey")) return "idempotencyKey";
  if (text.includes("respondentKey")) return "respondent";
  if (text.includes("userId")) return "user";
  return null;
}
