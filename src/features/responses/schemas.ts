import { z } from "zod";

// Regras de resposta (RN-05 a RN-08) escritas uma vez: o formulário usa `buildFormSchema`,
// o servidor usa `submitBodySchema` + `checkAnswers`. As mensagens são as mesmas nos dois.

export const SHORT_TEXT_MAX = 200;
export const LONG_TEXT_MAX = 2000;
export const MAX_QUESTIONS = 50;
export const MAX_OPTIONS = 30;
/** Corpo de um envio (spec 10.3). */
export const MAX_BODY_BYTES = 64 * 1024;

export type QuestionType = "SINGLE_CHOICE" | "MULTIPLE_CHOICE" | "SHORT_TEXT" | "LONG_TEXT";

/** O que o respondente vê de uma pergunta: sem valores numéricos nem dados internos (8.3). */
export type PublicQuestion = {
  id: string;
  type: QuestionType;
  title: string;
  helpText: string | null;
  required: boolean;
  minSelections: number | null;
  maxSelections: number | null;
  options: { id: string; label: string }[];
};

export type SubmittedAnswer = { questionId: string; optionIds?: string[]; text?: string };

const id = z.string().min(1).max(64);

export const submitBodySchema = z.object({
  idempotencyKey: z.uuid(),
  answers: z
    .array(
      z.object({
        questionId: id,
        optionIds: z.array(id).max(MAX_OPTIONS).optional(),
        // O limite real (200 ou 2.000) depende do tipo e é conferido em checkAnswers.
        text: z
          .string()
          .max(LONG_TEXT_MAX * 2)
          .optional(),
      }),
    )
    .max(MAX_QUESTIONS),
});

export type SubmitBody = z.output<typeof submitBodySchema>;

export const isChoice = (type: QuestionType) =>
  type === "SINGLE_CHOICE" || type === "MULTIPLE_CHOICE";

export const textLimit = (type: QuestionType) =>
  type === "SHORT_TEXT" ? SHORT_TEXT_MAX : LONG_TEXT_MAX;

/** Faixa de seleção efetiva de uma pergunta de escolha (RN-05, RN-06). */
export function selectionRange(question: PublicQuestion): { min: number; max: number } {
  if (question.type === "SINGLE_CHOICE") return { min: question.required ? 1 : 0, max: 1 };
  const max = Math.min(question.maxSelections ?? question.options.length, question.options.length);
  const min = Math.max(question.minSelections ?? 0, question.required ? 1 : 0);
  return { min, max };
}

export type AnswerIssueCode =
  | "VALIDATION_ERROR"
  | "UNKNOWN_QUESTION"
  | "UNKNOWN_OPTION"
  | "REQUIRED_MISSING"
  | "SELECTION_OUT_OF_RANGE"
  | "TEXT_TOO_LONG";

export type AnswerIssue = { code: AnswerIssueCode; questionId: string; message: string };

function plural(n: number, singular: string, pluralForm: string) {
  return `${n} ${n === 1 ? singular : pluralForm}`;
}

/**
 * Confere as respostas contra a estrutura atual da pesquisa (só perguntas e opções ativas).
 * Texto só com espaços conta como não respondido (RN-07). Devolve todos os problemas.
 */
export function checkAnswers(questions: PublicQuestion[], answers: SubmittedAnswer[]) {
  const issues: AnswerIssue[] = [];
  const byId = new Map(questions.map((q) => [q.id, q]));
  const answered = new Map<string, SubmittedAnswer>();

  for (const answer of answers) {
    const question = byId.get(answer.questionId);
    if (!question) {
      issues.push({
        code: "UNKNOWN_QUESTION",
        questionId: answer.questionId,
        message: "Pergunta não encontrada nesta pesquisa.",
      });
      continue;
    }
    if (answered.has(question.id)) {
      // RN-10: cada pergunta no máximo uma vez por envio.
      issues.push({
        code: "VALIDATION_ERROR",
        questionId: question.id,
        message: "Pergunta respondida mais de uma vez.",
      });
      continue;
    }
    answered.set(question.id, answer);
  }

  for (const question of questions) {
    const answer = answered.get(question.id);
    const issue = isChoice(question.type)
      ? checkChoice(question, answer)
      : checkText(question, answer);
    if (issue) issues.push({ ...issue, questionId: question.id });
  }
  return issues;
}

function checkChoice(question: PublicQuestion, answer: SubmittedAnswer | undefined) {
  if (answer?.text !== undefined && answer.text.trim() !== "") {
    return { code: "VALIDATION_ERROR" as const, message: "Esta pergunta não aceita texto." };
  }
  const optionIds = answer?.optionIds ?? [];
  const valid = new Set(question.options.map((o) => o.id));
  if (optionIds.some((optionId) => !valid.has(optionId))) {
    return {
      code: "UNKNOWN_OPTION" as const,
      message: "Opção não encontrada nesta pergunta.",
    };
  }
  if (new Set(optionIds).size !== optionIds.length) {
    return {
      code: "SELECTION_OUT_OF_RANGE" as const,
      message: "Cada opção pode ser escolhida uma vez.",
    };
  }

  const { min, max } = selectionRange(question);
  const count = optionIds.length;
  if (count === 0 && question.required) {
    return { code: "REQUIRED_MISSING" as const, message: "Responda esta pergunta." };
  }
  if (count > max) {
    const message =
      question.type === "SINGLE_CHOICE"
        ? "Escolha só uma opção."
        : `Escolha no máximo ${plural(max, "opção", "opções")}.`;
    return { code: "SELECTION_OUT_OF_RANGE" as const, message };
  }
  if (count > 0 && count < min) {
    return {
      code: "SELECTION_OUT_OF_RANGE" as const,
      message: `Escolha pelo menos ${plural(min, "opção", "opções")}.`,
    };
  }
  return null;
}

function checkText(question: PublicQuestion, answer: SubmittedAnswer | undefined) {
  if (answer?.optionIds?.length) {
    return { code: "VALIDATION_ERROR" as const, message: "Esta pergunta não aceita opções." };
  }
  const text = answer?.text?.trim() ?? "";
  if (text === "") {
    return question.required
      ? { code: "REQUIRED_MISSING" as const, message: "Responda esta pergunta." }
      : null;
  }
  const limit = textLimit(question.type);
  if (text.length > limit) {
    return {
      code: "TEXT_TOO_LONG" as const,
      message: `Use no máximo ${limit.toLocaleString("pt-BR")} caracteres.`,
    };
  }
  return null;
}

// ---- Formulário ----

/** Valor de cada pergunta no formulário: id da opção, ids das opções ou texto. */
export type FormValue = string | string[];
export type FormValues = Record<string, FormValue>;

export function emptyFormValues(questions: PublicQuestion[]): FormValues {
  return Object.fromEntries(questions.map((q) => [q.id, q.type === "MULTIPLE_CHOICE" ? [] : ""]));
}

/** Converte os valores do formulário no corpo da API, sem as perguntas deixadas em branco. */
export function toAnswers(questions: PublicQuestion[], values: FormValues): SubmittedAnswer[] {
  const answers: SubmittedAnswer[] = [];
  for (const question of questions) {
    const value = values[question.id];
    if (isChoice(question.type)) {
      const optionIds = (Array.isArray(value) ? value : value ? [value] : []).filter(Boolean);
      if (optionIds.length) answers.push({ questionId: question.id, optionIds });
    } else {
      const text = typeof value === "string" ? value.trim() : "";
      if (text) answers.push({ questionId: question.id, text });
    }
  }
  return answers;
}

/** Schema do formulário: as mesmas regras do servidor, com o erro no campo da pergunta. */
export function buildFormSchema(questions: PublicQuestion[]) {
  return z
    .record(z.string(), z.union([z.string(), z.array(z.string())]))
    .superRefine((values, ctx) => {
      for (const issue of checkAnswers(questions, toAnswers(questions, values))) {
        ctx.addIssue({ code: "custom", path: [issue.questionId], message: issue.message });
      }
    });
}
