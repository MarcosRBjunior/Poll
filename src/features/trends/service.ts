import { percent } from "@/features/results/stats";
import { AppError } from "@/lib/errors";
import { todayIso } from "@/lib/format";
import {
  countAnswersByBucket,
  countParticipation,
  findTrendSurveys,
  groupExists,
  type BucketCount,
  type TrendPeriod,
  type TrendSurveyRecord,
} from "./repository";
import { defaultPeriod, listPeriods } from "./periods";
import { trendsQuerySchema, type TrendBucket } from "./schemas";

type QuestionType = TrendSurveyRecord["questions"][number]["type"];

/** Respostas de uma pesquisa em cada período (participação, D-07). */
export type ParticipationSeries = {
  surveyId: string;
  slug: string;
  title: string;
  total: number;
  points: { period: string; count: number }[];
};

/** Opções ativas de uma pergunta, da mais escolhida para a menos (preferências, D-07). */
export type QuestionRanking = {
  surveyId: string;
  surveyTitle: string;
  questionId: string;
  title: string;
  type: QuestionType;
  answeredCount: number;
  options: { optionId: string; label: string; count: number; percent: number }[];
};

/** Percentual de uma opção em cada período (evolução, D-07). Sem respostas, `null`. */
export type OptionTrend = {
  questionId: string;
  optionId: string;
  points: { period: string; answeredCount: number; count: number; percent: number | null }[];
};

/** Formato de `GET /api/v1/trends` (spec 8.5, RF-17). */
export type Trends = {
  query: { groupId: string | null; from: string; to: string; bucket: TrendBucket };
  /** Início (AAAA-MM-DD) de cada período, em ordem, inclusive os sem respostas. */
  periods: string[];
  summary: {
    responses: number;
    surveysWithResponses: number;
    busiestPeriod: { period: string; count: number } | null;
  };
  participation: ParticipationSeries[];
  topOptions: QuestionRanking[];
  optionTrends: OptionTrend[];
};

/**
 * Painel de tendências (T09). Três consultas agregadas além da lista de pesquisas;
 * nenhuma resposta individual sai do banco.
 */
export async function getTrends(adminId: string, query: unknown): Promise<Trends> {
  const input = trendsQuerySchema.parse(query);
  const period = resolvePeriod(input.from, input.to);
  const { groupId, bucket } = input;

  if (groupId && !(await groupExists(groupId, adminId))) {
    throw new AppError("NOT_FOUND", "Grupo não encontrado.");
  }

  const surveys = await findTrendSurveys(adminId, groupId);
  const questions = surveys.flatMap((s) => s.questions);
  const [participationRows, answerRows] = await Promise.all([
    surveys.length
      ? countParticipation(
          surveys.map((s) => s.id),
          period,
          bucket,
        )
      : [],
    questions.length
      ? countAnswersByBucket(
          questions.map((q) => q.id),
          period,
          bucket,
        )
      : { questions: [], options: [] },
  ]);

  const periods = listPeriods(period, bucket);
  const responsesBy = index(participationRows);
  const answeredBy = index(answerRows.questions);
  const chosenBy = index(answerRows.options);

  const participation = surveys
    .map((s) => series(s, periods, responsesBy))
    .filter((s) => s.total > 0);

  const topOptions: QuestionRanking[] = [];
  const optionTrends: OptionTrend[] = [];
  for (const survey of surveys) {
    for (const question of survey.questions) {
      const answeredCount = total(answeredBy.get(question.id));
      if (answeredCount === 0) continue;

      topOptions.push({
        surveyId: survey.id,
        surveyTitle: survey.title,
        questionId: question.id,
        title: question.title,
        type: question.type,
        answeredCount,
        options: question.options
          .map((o) => {
            const count = total(chosenBy.get(o.id));
            return {
              optionId: o.id,
              label: o.label,
              count,
              percent: percent(count, answeredCount),
            };
          })
          // Ordem estável: empate mantém a ordem da pesquisa.
          .sort((a, b) => b.count - a.count),
      });

      const answeredPerPeriod = answeredBy.get(question.id)!;
      for (const option of question.options) {
        const chosen = chosenBy.get(option.id);
        optionTrends.push({
          questionId: question.id,
          optionId: option.id,
          points: periods.map((p) => {
            const answered = answeredPerPeriod.get(p) ?? 0;
            const count = chosen?.get(p) ?? 0;
            return {
              period: p,
              answeredCount: answered,
              count,
              percent: answered === 0 ? null : percent(count, answered),
            };
          }),
        });
      }
    }
  }

  return {
    query: { groupId: groupId ?? null, from: period.from, to: period.to, bucket },
    periods,
    summary: summarize(participation, periods),
    participation,
    topOptions,
    optionTrends,
  };
}

function series(
  survey: TrendSurveyRecord,
  periods: string[],
  responsesBy: Map<string, Map<string, number>>,
): ParticipationSeries {
  const counts = responsesBy.get(survey.id);
  return {
    surveyId: survey.id,
    slug: survey.slug,
    title: survey.title,
    total: total(counts),
    points: periods.map((p) => ({ period: p, count: counts?.get(p) ?? 0 })),
  };
}

/** Cartões do painel: total, pesquisas com respostas e o período mais movimentado. */
function summarize(participation: ParticipationSeries[], periods: string[]): Trends["summary"] {
  let busiestPeriod: Trends["summary"]["busiestPeriod"] = null;
  periods.forEach((period, i) => {
    const count = participation.reduce((sum, s) => sum + s.points[i]!.count, 0);
    // Empate fica com o período mais antigo.
    if (count > 0 && count > (busiestPeriod?.count ?? 0)) busiestPeriod = { period, count };
  });
  return {
    responses: participation.reduce((sum, s) => sum + s.total, 0),
    surveysWithResponses: participation.length,
    busiestPeriod,
  };
}

/** id → (período → contagem). */
function index(rows: BucketCount[]): Map<string, Map<string, number>> {
  const map = new Map<string, Map<string, number>>();
  for (const row of rows) {
    if (!map.has(row.id)) map.set(row.id, new Map());
    map.get(row.id)!.set(row.period, row.count);
  }
  return map;
}

const total = (counts: Map<string, number> | undefined) =>
  counts ? [...counts.values()].reduce((sum, n) => sum + n, 0) : 0;

/** Período pedido, com os padrões: até hoje e começando 3 meses antes do fim. */
function resolvePeriod(from: string | undefined, to: string | undefined): TrendPeriod {
  const end = to ?? todayIso();
  const start = from ?? defaultPeriod(end).from;
  if (start > end) {
    throw new AppError("VALIDATION_ERROR", "Há campos inválidos.", [
      { path: "to", message: "A data final precisa ser igual ou posterior à inicial." },
    ]);
  }
  return { from: start, to: end };
}
