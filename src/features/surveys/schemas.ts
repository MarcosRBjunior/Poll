import { z } from "zod";
import { MAX_OPTIONS, MAX_QUESTIONS, type QuestionType } from "@/features/responses/schemas";

// SurveyInput (spec 8.4) escrito uma vez: o construtor (T06) e o serviço usam este schema.
// Rascunho pode ficar incompleto (RF-05, critério 4): o mínimo de opções e de perguntas
// só é exigido ao publicar (RN-01, RN-02, F7).

export const questionTypes = [
  "SINGLE_CHOICE",
  "MULTIPLE_CHOICE",
  "SHORT_TEXT",
  "LONG_TEXT",
] as const satisfies readonly QuestionType[];

export const isChoiceType = (type: QuestionType) =>
  type === "SINGLE_CHOICE" || type === "MULTIPLE_CHOICE";

/**
 * Corpo do construtor: 50 perguntas × 30 opções com textos longos cabem com folga.
 * A spec só fixa o limite do envio de respostas (64 KB); este segue a mesma ideia.
 */
export const SURVEY_BODY_MAX_BYTES = 512 * 1024;

/** Maior valor que cabe em `QuestionOption.value` (Decimal(10, 2)). */
const MAX_OPTION_VALUE = 99_999_999.99;

const id = z.string().min(1).max(64);

/** Texto aparado; vazio vira `null`. */
const optionalText = (max: number, message: string) =>
  z.preprocess(
    (v) => (typeof v === "string" ? v.trim() || null : (v ?? null)),
    z.string().max(max, message).nullable(),
  );

/** Inteiro opcional vindo do formulário (texto) ou da API (número); vazio vira `null`. */
const optionalInt = (min: number, message: string) =>
  z.preprocess(
    (v) => (v === "" || v === undefined ? null : typeof v === "string" ? Number(v) : v),
    z.number({ error: message }).int(message).min(min, message).nullable(),
  );

/** Valor numérico da opção (RF-07): decimal finito com até 2 casas, ou vazio. Aceita vírgula. */
const optionValue = z.preprocess(
  (v) => {
    if (v === "" || v === undefined || v === null) return null;
    if (typeof v === "string") return Number(v.trim().replace(",", "."));
    return v;
  },
  z
    .number({ error: "Use um número, como 3 ou 1,5." })
    .refine(Number.isFinite, "Use um número, como 3 ou 1,5.")
    .refine((n) => Math.abs(n) <= MAX_OPTION_VALUE, "Use um número menor.")
    .refine(
      (n) => Math.abs(Math.round(n * 100) - n * 100) < 1e-6,
      "Use no máximo 2 casas decimais.",
    )
    .nullable(),
);

export const optionInputSchema = z.object({
  id: id.optional(),
  label: z
    .string()
    .trim()
    .min(1, "Escreva o texto da opção.")
    .max(120, "Use no máximo 120 caracteres."),
  value: optionValue,
});

export const questionInputSchema = z
  .object({
    id: id.optional(),
    type: z.enum(questionTypes, { error: "Escolha o tipo da pergunta." }),
    title: z
      .string()
      .trim()
      .min(3, "Use pelo menos 3 caracteres.")
      .max(300, "Use no máximo 300 caracteres."),
    helpText: optionalText(500, "Use no máximo 500 caracteres."),
    required: z.boolean(),
    minSelections: optionalInt(0, "Use um número inteiro a partir de 0."),
    maxSelections: optionalInt(1, "Use um número inteiro a partir de 1."),
    options: z.array(optionInputSchema).max(MAX_OPTIONS, `Use no máximo ${MAX_OPTIONS} opções.`),
  })
  .superRefine((q, ctx) => {
    if (!isChoiceType(q.type)) {
      if (q.options.length > 0) {
        ctx.addIssue({
          code: "custom",
          path: ["options"],
          message: "Pergunta de texto não tem opções.",
        });
      }
      return;
    }

    // RN-03: rótulo único na pergunta, sem diferenciar maiúsculas nem espaços nas pontas.
    const seen = new Set<string>();
    q.options.forEach((option, index) => {
      const key = option.label.toLowerCase();
      if (seen.has(key)) {
        ctx.addIssue({
          code: "custom",
          path: ["options", index, "label"],
          message: "Já existe uma opção com este texto.",
        });
      }
      seen.add(key);
    });

    // RF-06: mínimo ≤ máximo ≤ número de opções (só múltipla escolha tem limites).
    if (q.type !== "MULTIPLE_CHOICE") return;
    const { minSelections: min, maxSelections: max } = q;
    if (min !== null && max !== null && min > max) {
      ctx.addIssue({
        code: "custom",
        path: ["minSelections"],
        message: "O mínimo não pode passar do máximo.",
      });
    }
    if (max !== null && max > q.options.length) {
      ctx.addIssue({
        code: "custom",
        path: ["maxSelections"],
        message: "O máximo não pode passar do número de opções.",
      });
    }
    if (min !== null && min > q.options.length) {
      ctx.addIssue({
        code: "custom",
        path: ["minSelections"],
        message: "O mínimo não pode passar do número de opções.",
      });
    }
  })
  // Limites só valem em múltipla escolha; nos outros tipos são descartados.
  .transform((q) =>
    q.type === "MULTIPLE_CHOICE" ? q : { ...q, minSelections: null, maxSelections: null },
  );

export const surveyInputSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, "Use pelo menos 3 caracteres.")
    .max(120, "Use no máximo 120 caracteres."),
  description: optionalText(1000, "Use no máximo 1.000 caracteres."),
  groupId: z.preprocess((v) => v || null, id.nullable()).optional(),
  isListed: z.boolean().default(false),
  questions: z
    .array(questionInputSchema)
    .max(MAX_QUESTIONS, `Use no máximo ${MAX_QUESTIONS} perguntas.`),
});

/** Salvar edição (`PUT`): a mesma estrutura mais a `version` que foi aberta (RN-17). */
export const surveyUpdateSchema = surveyInputSchema.extend({
  version: z.number().int().min(1),
});

export type SurveyInput = z.output<typeof surveyInputSchema>;
export type QuestionInput = SurveyInput["questions"][number];
export type OptionInput = QuestionInput["options"][number];

// ---- Formulário (T06) ----

/** Valores do construtor: números ficam como texto até o schema convertê-los. */
export type OptionFormValues = { id?: string; label: string; value: string };
export type QuestionFormValues = {
  id?: string;
  type: QuestionType;
  title: string;
  helpText: string;
  required: boolean;
  minSelections: string;
  maxSelections: string;
  options: OptionFormValues[];
};
export type SurveyFormValues = {
  title: string;
  description: string;
  isListed: boolean;
  questions: QuestionFormValues[];
};

/** Padrão ao criar (RN-08): escolha obrigatória, texto opcional. */
export function newQuestion(type: QuestionType = "SINGLE_CHOICE"): QuestionFormValues {
  return {
    type,
    title: "",
    helpText: "",
    required: isChoiceType(type),
    minSelections: "",
    maxSelections: "",
    options: isChoiceType(type) ? [newOption(), newOption()] : [],
  };
}

export const newOption = (): OptionFormValues => ({ label: "", value: "" });
