import { CSV_BOM, csvRow } from "@/lib/csv";
import { AppError } from "@/lib/errors";
import { formatDateTime, todayIso } from "@/lib/format";
import { skipFor, type Page } from "@/lib/pagination";
import {
  countAnswers,
  countResponsesPerDay,
  findResponsePage,
  findResultsSurvey,
  findTexts,
  iterateResponses,
  type AnswerCounts,
  type DayCount,
  type ResponseRow,
  type ResultsSurveyRecord,
  type TextRow,
} from "./repository";
import {
  exportQuerySchema,
  periodSchema,
  responsesQuerySchema,
  textsQuerySchema,
  type Period,
} from "./schemas";
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

// ---- Textos (comentários) ----

const isTextType = (type: QuestionType) => type === "SHORT_TEXT" || type === "LONG_TEXT";

async function textsOf(survey: ResultsSurveyRecord, questionId: string, query: unknown) {
  const question = survey.questions.find((q) => q.id === questionId);
  if (!question || !isTextType(question.type)) {
    throw new AppError("NOT_FOUND", "Pergunta não encontrada.");
  }
  const page = textsQuerySchema.parse(query);
  const { data, total } = await findTexts(survey.id, questionId, {
    skip: skipFor(page),
    take: page.pageSize,
  });
  return { data, total, ...page } satisfies Page<TextRow>;
}

/** Comentários públicos (`GET /api/v1/public/surveys/{slug}/questions/{id}/texts`, RN-23). */
export async function getPublicTexts(slug: string, questionId: string, query: unknown) {
  return textsOf(await loadPublicResultsSurvey(slug), questionId, query);
}

/** Textos para o administrador (`GET /api/v1/surveys/{id}/questions/{id}/texts`). */
export async function getAdminTexts(
  adminId: string,
  surveyId: string,
  questionId: string,
  query: unknown,
) {
  return textsOf(await loadAdminResultsSurvey(adminId, surveyId), questionId, query);
}

// ---- Tabela individual e CSV (só administrador, RN-23) ----

export type ResponseColumn = { questionId: string; title: string; archived: boolean };

/** Colunas na ordem do painel: ativas primeiro, removidas no fim. */
function columnsOf(survey: ResultsSurveyRecord): ResponseColumn[] {
  return [
    ...survey.questions.filter((q) => !q.archivedAt),
    ...survey.questions.filter((q) => q.archivedAt),
  ].map((q) => ({ questionId: q.id, title: q.title, archived: q.archivedAt !== null }));
}

/** Texto de cada pergunta num envio; opções múltiplas unidas por "; " (RF-13). */
function cellsOf(row: ResponseRow): Record<string, string> {
  return Object.fromEntries(row.answers.map((a) => [a.questionId, a.text ?? a.labels.join("; ")]));
}

export type ResponsesTable = Page<{
  id: string;
  submittedAt: Date;
  cells: Record<string, string>;
}> & {
  columns: ResponseColumn[];
  asOf: Date;
};

/** Tabela de respostas (RF-13, `GET /api/v1/surveys/{id}/responses`). */
export async function getResponsesTable(
  adminId: string,
  surveyId: string,
  query: unknown,
  now = new Date(),
): Promise<ResponsesTable> {
  const survey = await loadAdminResultsSurvey(adminId, surveyId);
  const { asOf: asOfParam, ...page } = responsesQuerySchema.parse(query);
  const asOf = asOfParam ? new Date(asOfParam) : now;
  const { data, total } = await findResponsePage(survey.id, asOf, {
    skip: skipFor(page),
    take: page.pageSize,
  });
  return {
    columns: columnsOf(survey),
    data: data.map((row) => ({ id: row.id, submittedAt: row.submittedAt, cells: cellsOf(row) })),
    total,
    asOf,
    ...page,
  };
}

/**
 * CSV com todas as respostas (RF-15): "Resposta" e "Enviada em" (horário de Brasília)
 * mais uma coluna por pergunta. Sai em pedaços, um lote de respostas por vez.
 */
export async function exportResponses(
  adminId: string,
  surveyId: string,
  query: unknown,
  now = new Date(),
): Promise<{ filename: string; chunks: AsyncIterable<string> }> {
  const { format } = exportQuerySchema.parse(query);
  if (format !== "csv") {
    throw new AppError("UNSUPPORTED_FORMAT", "Formato não suportado. Use csv.", [
      { path: "format", message: "Use csv." },
    ]);
  }
  const survey = await loadAdminResultsSurvey(adminId, surveyId);
  const columns = columnsOf(survey);

  async function* chunks() {
    yield CSV_BOM +
      csvRow([
        "Resposta",
        "Enviada em",
        ...columns.map((c) => (c.archived ? `${c.title} (removida)` : c.title)),
      ]);
    for await (const batch of iterateResponses(survey.id)) {
      yield batch
        .map((row) => {
          const cells = cellsOf(row);
          return csvRow([
            row.id,
            formatDateTime(row.submittedAt),
            ...columns.map((c) => cells[c.questionId] ?? ""),
          ]);
        })
        .join("");
    }
  }

  return { filename: `pesquisa-${survey.slug}-${todayIso(now)}.csv`, chunks: chunks() };
}
