import { AppError } from "@/lib/errors";
import {
  countAnswers,
  countResponsesPerDay,
  findResultsSurvey,
  type AnswerCounts,
  type DayCount,
  type ResultsSurveyRecord,
} from "./repository";
import { periodSchema, type Period } from "./schemas";
import { percent, weightedMean, weightedMedian } from "./stats";

type QuestionType = ResultsSurveyRecord["questions"][number]["type"];
type SurveyStatus = ResultsSurveyRecord["status"];

export type OptionResult = {
  id: string;
  label: string;
  archived: boolean;
  count: number;
  percent: number;
};

export type QuestionResult = {
  id: string;
  title: string;
  type: QuestionType;
  archived: boolean;
  answeredCount: number;
  options: OptionResult[];
  numeric: { mean: number; median: number } | null;
  textCount: number | null;
};

/** Formato dos resultados, igual nas rotas pública e do administrador (spec 8.5). */
export type SurveyResults = {
  survey: { slug: string; title: string; status: SurveyStatus };
  totals: { responses: number; firstAt: Date | null; lastAt: Date | null };
  perDay: { date: string; count: number }[];
  questions: QuestionResult[];
};

const notFound = () => new AppError("NOT_FOUND", "Pesquisa não encontrada.");

/** Pesquisa com resultados públicos: publicada ou encerrada, não excluída (RN-23). */
export async function loadPublicResultsSurvey(slug: string) {
  const survey = await findResultsSurvey({ slug });
  if (!survey || survey.deletedAt || survey.status === "DRAFT") throw notFound();
  return survey;
}

/** Pesquisa do administrador, inclusive rascunho. De outro dono ou excluída: 404 (RN-12). */
export async function loadAdminResultsSurvey(adminId: string, surveyId: string) {
  const survey = await findResultsSurvey({ id: surveyId });
  if (!survey || survey.deletedAt || survey.ownerId !== adminId) throw notFound();
  return survey;
}

/** Painel público (T10, `GET /api/v1/public/surveys/{slug}/results`). */
export async function getPublicResults(slug: string, query: unknown): Promise<SurveyResults> {
  const survey = await loadPublicResultsSurvey(slug);
  return buildResults(survey, periodSchema.parse(query));
}

/** Painel do administrador (T07, `GET /api/v1/surveys/{id}/results`). */
export async function getAdminResults(
  adminId: string,
  surveyId: string,
  query: unknown,
): Promise<SurveyResults> {
  const survey = await loadAdminResultsSurvey(adminId, surveyId);
  return buildResults(survey, periodSchema.parse(query));
}

/** Duas consultas agregadas; nenhuma resposta individual sai do banco (US-3.1, critério 3). */
async function buildResults(survey: ResultsSurveyRecord, period: Period): Promise<SurveyResults> {
  const [days, counts] = await Promise.all([
    countResponsesPerDay(survey.id, period),
    countAnswers(survey.id, period),
  ]);

  // Perguntas ativas primeiro, na ordem da pesquisa; as removidas vêm no fim.
  const questions = [
    ...survey.questions.filter((q) => !q.archivedAt),
    ...survey.questions.filter((q) => q.archivedAt),
  ];

  return {
    survey: { slug: survey.slug, title: survey.title, status: survey.status },
    totals: {
      responses: days.reduce((sum, d) => sum + d.count, 0),
      firstAt: days[0]?.firstAt ?? null,
      lastAt: days.at(-1)?.lastAt ?? null,
    },
    perDay: fillDays(days),
    questions: questions.map((q) => questionResult(q, counts)),
  };
}

function questionResult(
  question: ResultsSurveyRecord["questions"][number],
  counts: AnswerCounts,
): QuestionResult {
  const answeredCount = counts.questions.get(question.id) ?? 0;
  const isText = question.type === "SHORT_TEXT" || question.type === "LONG_TEXT";
  const options = question.options.map((o) => {
    const count = counts.options.get(o.id) ?? 0;
    return {
      id: o.id,
      label: o.label,
      archived: o.archivedAt !== null,
      count,
      percent: percent(count, answeredCount),
    };
  });

  return {
    id: question.id,
    title: question.title,
    type: question.type,
    archived: question.archivedAt !== null,
    answeredCount,
    options,
    numeric: numericStats(question, counts),
    textCount: isText ? answeredCount : null,
  };
}

/**
 * Média e mediana (RF-07, RN-16): só em escolha única e só quando todas as opções ativas
 * têm valor. Escolhas de opções removidas entram se a opção tinha valor.
 */
function numericStats(question: ResultsSurveyRecord["questions"][number], counts: AnswerCounts) {
  if (question.type !== "SINGLE_CHOICE") return null;
  const active = question.options.filter((o) => !o.archivedAt);
  if (active.length === 0 || active.some((o) => o.value === null)) return null;

  const values = question.options
    .filter((o) => o.value !== null)
    .map((o) => ({ value: o.value!, count: counts.options.get(o.id) ?? 0 }));
  const mean = weightedMean(values);
  const median = weightedMedian(values);
  return mean === null || median === null ? null : { mean, median };
}

/** Dias sem resposta entre o primeiro e o último entram com zero, para o gráfico de linha. */
function fillDays(days: DayCount[]): SurveyResults["perDay"] {
  if (days.length === 0) return [];
  const byDate = new Map(days.map((d) => [d.date, d.count]));
  const result: SurveyResults["perDay"] = [];
  const last = days.at(-1)!.date;
  for (let date = days[0]!.date; date <= last; date = nextDay(date)) {
    result.push({ date, count: byDate.get(date) ?? 0 });
  }
  return result;
}

function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
