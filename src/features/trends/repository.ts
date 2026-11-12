import { Prisma } from "@/generated/prisma/client";
import { periodCondition } from "@/features/results/repository";
import { RESULTS_TIME_ZONE } from "@/features/results/schemas";
import { getDb } from "@/lib/db";
import type { TrendBucket } from "./schemas";

/** Período já resolvido pelo serviço: os dois limites existem. */
export type TrendPeriod = { from: string; to: string };

/** O dono tem esse grupo? (RN-12: grupo de outro dono é tratado como inexistente.) */
export async function groupExists(id: string, ownerId: string): Promise<boolean> {
  return (await getDb().surveyGroup.count({ where: { id, ownerId } })) === 1;
}

// Só perguntas e opções ativas entram no ranking e na evolução (decisão da F8).
const trendSurveySelect = {
  id: true,
  slug: true,
  title: true,
  questions: {
    where: { archivedAt: null, type: { in: ["SINGLE_CHOICE", "MULTIPLE_CHOICE"] } },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      type: true,
      title: true,
      options: {
        where: { archivedAt: null },
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
        select: { id: true, label: true },
      },
    },
  },
} satisfies Prisma.SurveySelect;

export type TrendSurveyRecord = Prisma.SurveyGetPayload<{ select: typeof trendSurveySelect }>;

/**
 * Pesquisas do painel: do dono, publicadas ou encerradas, não excluídas. Sem `groupId`,
 * todas, inclusive as sem grupo (decisão da F8).
 */
export function findTrendSurveys(
  ownerId: string,
  groupId: string | undefined,
): Promise<TrendSurveyRecord[]> {
  return getDb().survey.findMany({
    where: {
      ownerId,
      deletedAt: null,
      status: { in: ["PUBLISHED", "CLOSED"] },
      ...(groupId ? { groupId } : {}),
    },
    orderBy: [{ publishedAt: "asc" }, { createdAt: "asc" }],
    select: trendSurveySelect,
  });
}

/**
 * Início do período (AAAA-MM-DD) em que a resposta caiu, no fuso do app.
 * `date_trunc('week')` do Postgres começa na segunda-feira.
 */
function bucketOf(column: Prisma.Sql, bucket: TrendBucket): Prisma.Sql {
  const unit = bucket === "month" ? Prisma.sql`'month'` : Prisma.sql`'week'`;
  return Prisma.sql`to_char(date_trunc(${unit}, ${column} AT TIME ZONE ${RESULTS_TIME_ZONE}::text), 'YYYY-MM-DD')`;
}

export type BucketCount = { id: string; period: string; count: number };

/** Respostas por pesquisa e período. Uma consulta agrupada. */
export function countParticipation(
  surveyIds: string[],
  period: TrendPeriod,
  bucket: TrendBucket,
): Promise<BucketCount[]> {
  return getDb().$queryRaw<BucketCount[]>`
    SELECT "surveyId" AS "id",
           ${bucketOf(Prisma.sql`"submittedAt"`, bucket)} AS "period",
           count(*)::int AS "count"
    FROM "SurveyResponse"
    WHERE "surveyId" = ANY(${surveyIds}) AND ${periodCondition(Prisma.sql`"submittedAt"`, period)}
    GROUP BY 1, 2`;
}

export type AnswerBucketCounts = { questions: BucketCount[]; options: BucketCount[] };

/**
 * Por período: quantos responderam cada pergunta e quantas vezes cada opção foi escolhida
 * (a base do RN-16). Uma consulta; em branco não grava `Answer` (RN-07).
 */
export async function countAnswersByBucket(
  questionIds: string[],
  period: TrendPeriod,
  bucket: TrendBucket,
): Promise<AnswerBucketCounts> {
  const inPeriod = periodCondition(Prisma.sql`r."submittedAt"`, period);
  const bucketExpr = bucketOf(Prisma.sql`r."submittedAt"`, bucket);
  const rows = await getDb().$queryRaw<(BucketCount & { kind: "question" | "option" })[]>`
    SELECT 'question' AS "kind", a."questionId" AS "id", ${bucketExpr} AS "period",
           count(*)::int AS "count"
    FROM "Answer" a
    JOIN "SurveyResponse" r ON r."id" = a."responseId"
    WHERE a."questionId" = ANY(${questionIds}) AND ${inPeriod}
    GROUP BY 1, 2, 3
    UNION ALL
    SELECT 'option', s."optionId", ${bucketExpr}, count(*)::int
    FROM "AnswerSelection" s
    JOIN "Answer" a ON a."id" = s."answerId"
    JOIN "SurveyResponse" r ON r."id" = a."responseId"
    WHERE a."questionId" = ANY(${questionIds}) AND ${inPeriod}
    GROUP BY 1, 2, 3`;

  const counts: AnswerBucketCounts = { questions: [], options: [] };
  for (const { kind, ...row } of rows) {
    (kind === "question" ? counts.questions : counts.options).push(row);
  }
  return counts;
}
