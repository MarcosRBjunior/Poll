import { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import { RESULTS_TIME_ZONE, type Period } from "./schemas";

// Estrutura completa da pesquisa, com perguntas e opções arquivadas: o painel mostra
// os dados históricos delas marcados como "removida" (RF-12, critério 4).
const resultsSurveySelect = {
  id: true,
  ownerId: true,
  slug: true,
  title: true,
  status: true,
  deletedAt: true,
  questions: {
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      type: true,
      title: true,
      archivedAt: true,
      options: {
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
        select: { id: true, label: true, value: true, archivedAt: true },
      },
    },
  },
} satisfies Prisma.SurveySelect;

type SurveyRow = Prisma.SurveyGetPayload<{ select: typeof resultsSurveySelect }>;

/** Igual ao registro do banco, com o valor numérico da opção já como `number`. */
export type ResultsSurveyRecord = Omit<SurveyRow, "questions"> & {
  questions: (Omit<SurveyRow["questions"][number], "options"> & {
    options: (Omit<SurveyRow["questions"][number]["options"][number], "value"> & {
      value: number | null;
    })[];
  })[];
};

export async function findResultsSurvey(
  where: { slug: string } | { id: string },
): Promise<ResultsSurveyRecord | null> {
  const survey = await getDb().survey.findUnique({ where, select: resultsSurveySelect });
  if (!survey) return null;
  return {
    ...survey,
    questions: survey.questions.map((q) => ({
      ...q,
      options: q.options.map((o) => ({ ...o, value: o.value?.toNumber() ?? null })),
    })),
  };
}

/** Condição de período sobre `submittedAt`, com os limites do dia no fuso dos resultados. */
function periodCondition(column: Prisma.Sql, period: Period): Prisma.Sql {
  const conditions = [Prisma.sql`TRUE`];
  if (period.from) {
    conditions.push(
      Prisma.sql`${column} >= (${period.from}::date)::timestamp AT TIME ZONE ${RESULTS_TIME_ZONE}::text`,
    );
  }
  if (period.to) {
    conditions.push(
      Prisma.sql`${column} < (${period.to}::date + 1)::timestamp AT TIME ZONE ${RESULTS_TIME_ZONE}::text`,
    );
  }
  return Prisma.join(conditions, " AND ");
}

export type DayCount = { date: string; count: number; firstAt: Date; lastAt: Date };

/** Respostas por dia, com a primeira e a última de cada dia. Uma consulta agrupada. */
export function countResponsesPerDay(surveyId: string, period: Period): Promise<DayCount[]> {
  return getDb().$queryRaw<DayCount[]>`
    SELECT to_char(("submittedAt" AT TIME ZONE ${RESULTS_TIME_ZONE}::text)::date, 'YYYY-MM-DD') AS "date",
           count(*)::int AS "count",
           min("submittedAt") AS "firstAt",
           max("submittedAt") AS "lastAt"
    FROM "SurveyResponse"
    WHERE "surveyId" = ${surveyId} AND ${periodCondition(Prisma.sql`"submittedAt"`, period)}
    GROUP BY 1
    ORDER BY 1`;
}

export type AnswerCounts = { questions: Map<string, number>; options: Map<string, number> };

/**
 * Quantos responderam cada pergunta e quantas vezes cada opção foi escolhida, numa
 * consulta. Só existe `Answer` para pergunta respondida: em branco não é gravada (RN-07).
 */
export async function countAnswers(surveyId: string, period: Period): Promise<AnswerCounts> {
  const inPeriod = periodCondition(Prisma.sql`r."submittedAt"`, period);
  const rows = await getDb().$queryRaw<
    { kind: "question" | "option"; id: string; count: number }[]
  >`
    SELECT 'question' AS "kind", a."questionId" AS "id", count(*)::int AS "count"
    FROM "Answer" a
    JOIN "SurveyResponse" r ON r."id" = a."responseId"
    WHERE r."surveyId" = ${surveyId} AND ${inPeriod}
    GROUP BY a."questionId"
    UNION ALL
    SELECT 'option', s."optionId", count(*)::int
    FROM "AnswerSelection" s
    JOIN "Answer" a ON a."id" = s."answerId"
    JOIN "SurveyResponse" r ON r."id" = a."responseId"
    WHERE r."surveyId" = ${surveyId} AND ${inPeriod}
    GROUP BY s."optionId"`;

  const counts: AnswerCounts = { questions: new Map(), options: new Map() };
  for (const row of rows) {
    (row.kind === "question" ? counts.questions : counts.options).set(row.id, row.count);
  }
  return counts;
}
