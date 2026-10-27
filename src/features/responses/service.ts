import { AppError, type ErrorCode } from "@/lib/errors";
import { enforceRateLimit, responseSubmitLimit } from "@/lib/rate-limit";
import { keyedHash } from "@/lib/respondent";
import {
  findResponseByIdempotencyKey,
  findSurveyBySlug,
  hasRespondentResponse,
  hasUserResponse,
  insertResponse,
  responseConflict,
  type SurveyRecord,
} from "./repository";
import { checkAnswers, submitBodySchema, type AnswerIssue, type PublicQuestion } from "./schemas";

export type PublicSurvey = {
  slug: string;
  title: string;
  description: string | null;
  status: "PUBLISHED" | "CLOSED";
  questions: PublicQuestion[];
};

const notFound = () => new AppError("NOT_FOUND", "Pesquisa não encontrada.");

/** Pesquisa visível ao público: publicada ou encerrada. Rascunho e excluída não existem (RN-04). */
async function loadVisibleSurvey(slug: string) {
  const survey = await findSurveyBySlug(slug);
  if (!survey || survey.deletedAt || survey.status === "DRAFT") throw notFound();
  return survey as SurveyRecord & { status: PublicSurvey["status"] };
}

function toPublic(survey: SurveyRecord & { status: PublicSurvey["status"] }): PublicSurvey {
  return {
    slug: survey.slug,
    title: survey.title,
    description: survey.description,
    status: survey.status,
    // Encerrada não expõe mais o formulário (8.3).
    questions: survey.status === "CLOSED" ? [] : survey.questions,
  };
}

/** Pesquisa para responder (RF-01, `GET /api/v1/public/surveys/{slug}`). */
export async function getPublicSurvey(slug: string): Promise<PublicSurvey> {
  return toPublic(await loadVisibleSurvey(slug));
}

/**
 * Já respondeu (RN-14): pela conta, com login, ou por este navegador, pelo cookie.
 * Com login valem os dois (decisão da F7): quem respondeu sem conta não repete depois de entrar.
 */
async function hasResponded(surveyId: string, respondentKey: string | undefined, userId?: string) {
  if (userId && (await hasUserResponse(surveyId, userId))) return true;
  return respondentKey !== undefined && hasRespondentResponse(surveyId, respondentKey);
}

/** Pesquisa para a página T02, com o aviso de "já respondeu" (RN-14). */
export async function getSurveyForRespondent(
  slug: string,
  respondentToken: string | undefined,
  userId?: string,
) {
  const survey = await loadVisibleSurvey(slug);
  const alreadyResponded =
    survey.status === "PUBLISHED" &&
    (await hasResponded(
      survey.id,
      respondentToken === undefined ? undefined : keyedHash(respondentToken),
      userId,
    ));
  return { survey: toPublic(survey), alreadyResponded };
}

export type SubmitInput = {
  slug: string;
  body: unknown;
  respondentToken: string;
  ip: string;
  /** Conta da sessão, quando o respondente entrou (D-02, US-4.3). */
  userId?: string;
};

export type SubmitResult = { id: string; submittedAt: Date; created: boolean };

// Quando há problemas de tipos diferentes, vale o primeiro desta lista (passos 7 e 8 da 8.3).
const issuePriority: AnswerIssue["code"][] = [
  "VALIDATION_ERROR",
  "UNKNOWN_QUESTION",
  "UNKNOWN_OPTION",
  "REQUIRED_MISSING",
  "SELECTION_OUT_OF_RANGE",
  "TEXT_TOO_LONG",
];

const issueMessages: Record<AnswerIssue["code"], string> = {
  VALIDATION_ERROR: "Há campos inválidos.",
  UNKNOWN_QUESTION: "Há uma pergunta que não pertence a esta pesquisa.",
  UNKNOWN_OPTION: "Há uma opção que não pertence à pergunta.",
  REQUIRED_MISSING: "Responda todas as perguntas obrigatórias.",
  SELECTION_OUT_OF_RANGE: "Há perguntas com quantidade de opções fora do permitido.",
  TEXT_TOO_LONG: "Há respostas com texto acima do limite.",
};

function rejectIssues(issues: AnswerIssue[]): never {
  const code = issuePriority.find((c) => issues.some((i) => i.code === c)) as ErrorCode;
  const details = issues.map((i) => ({ path: `answers.${i.questionId}`, message: i.message }));
  throw new AppError(code, issueMessages[code as AnswerIssue["code"]], details);
}

const alreadyResponded = () =>
  new AppError("ALREADY_RESPONDED", "Você já respondeu esta pesquisa.");

/**
 * Envio de respostas (RF-03, RF-04), na ordem da spec 8.3. Origem e tamanho do corpo
 * (passo 1) ficam na rota. O limite vem logo depois de achar a pesquisa, porque a chave
 * usa o id dela (spec 6.5).
 */
export async function submitResponse(input: SubmitInput): Promise<SubmitResult> {
  const survey = await loadVisibleSurvey(input.slug);
  await enforceRateLimit(`responses:${survey.id}:${keyedHash(input.ip)}`, responseSubmitLimit);

  const body = submitBodySchema.parse(input.body);

  if (survey.status === "CLOSED") {
    throw new AppError("SURVEY_CLOSED", "Esta pesquisa não aceita mais respostas.");
  }

  const existing = await findResponseByIdempotencyKey(body.idempotencyKey);
  if (existing) {
    if (existing.surveyId !== survey.id) {
      throw new AppError("VALIDATION_ERROR", "Há campos inválidos.", [
        { path: "idempotencyKey", message: "Chave já usada em outro envio." },
      ]);
    }
    return { ...existing, created: false };
  }

  const respondentKey = keyedHash(input.respondentToken);
  if (await hasResponded(survey.id, respondentKey, input.userId)) {
    // Repetição simultânea: a outra requisição gravou entre a checagem da chave e esta.
    const repeated = await findResponseByIdempotencyKey(body.idempotencyKey);
    if (repeated?.surveyId === survey.id) return { ...repeated, created: false };
    throw alreadyResponded();
  }

  const issues = checkAnswers(survey.questions, body.answers);
  if (issues.length) rejectIssues(issues);

  try {
    const saved = await insertResponse({
      surveyId: survey.id,
      respondentKey,
      userId: input.userId ?? null,
      idempotencyKey: body.idempotencyKey,
      // Pergunta opcional em branco não vira Answer (RN-07: vazio é não respondida).
      answers: body.answers
        .map((a) => ({
          questionId: a.questionId,
          optionIds: a.optionIds?.length ? a.optionIds : undefined,
          text: a.text?.trim() || undefined,
        }))
        .filter((a) => a.optionIds || a.text),
    });
    return { ...saved, created: true };
  } catch (error) {
    // Dois envios simultâneos: o banco decide quem chegou primeiro (UNIQUE). Com a mesma
    // chave e o mesmo cookie, os dois UNIQUE são violados e o Postgres pode acusar qualquer
    // um deles: se a chave já foi gravada nesta pesquisa, é repetição (200), não 409.
    const conflict = responseConflict(error);
    if (conflict === null) throw error;
    const winner = await findResponseByIdempotencyKey(body.idempotencyKey);
    if (winner?.surveyId === survey.id) return { ...winner, created: false };
    if (conflict === "respondent" || conflict === "user") throw alreadyResponded();
    throw error;
  }
}
