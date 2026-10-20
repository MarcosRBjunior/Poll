import { randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";

export const db = getDb();

const tables = [
  "AnswerSelection",
  "Answer",
  "SurveyResponse",
  "QuestionOption",
  "Question",
  "SurveyRequest",
  "Survey",
  "SurveyGroup",
  "User",
  "RateLimitBucket",
];

export async function resetDatabase() {
  await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t}"`).join(", ")} CASCADE`);
}

export function createUser(data: Partial<Prisma.UserCreateInput> = {}) {
  return db.user.create({
    data: { id: randomUUID(), email: `user-${randomUUID()}@example.com`, ...data },
  });
}

export async function createSurvey(data: Partial<Prisma.SurveyUncheckedCreateInput> = {}) {
  const ownerId = data.ownerId ?? (await createUser({ role: "ADMIN" })).id;
  return db.survey.create({
    data: { title: "Pesquisa de teste", slug: `teste-${randomUUID()}`, ...data, ownerId },
  });
}

export async function createQuestion(data: Partial<Prisma.QuestionUncheckedCreateInput> = {}) {
  const surveyId = data.surveyId ?? (await createSurvey()).id;
  return db.question.create({
    data: { type: "SINGLE_CHOICE", title: "Pergunta?", position: 0, ...data, surveyId },
  });
}
