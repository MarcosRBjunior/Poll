import type { PublicQuestion } from "@/features/responses/schemas";
import type { SurveyDetail } from "@/features/surveys/service";
import type { Control } from "react-hook-form";
import type { QuestionFormValues, SurveyFormValues, SurveyInput } from "@/features/surveys/schemas";

/** Control do construtor: valores do formulário, saída já convertida pelo schema. */
export type BuilderControl = Control<SurveyFormValues, unknown, SurveyInput>;

const text = (n: number | null) => (n === null ? "" : String(n));

/** Detalhe salvo → valores do construtor: só itens ativos; números viram texto. */
export function detailToForm(detail: SurveyDetail): SurveyFormValues {
  return {
    title: detail.title,
    description: detail.description ?? "",
    isListed: detail.isListed,
    questions: detail.questions
      .filter((q) => !q.archivedAt)
      .map((q) => ({
        id: q.id,
        type: q.type,
        title: q.title,
        helpText: q.helpText ?? "",
        required: q.required,
        minSelections: text(q.minSelections),
        maxSelections: text(q.maxSelections),
        options: q.options
          .filter((o) => !o.archivedAt)
          .map((o) => ({ id: o.id, label: o.label, value: text(o.value) })),
      })),
  };
}

export const emptySurveyForm = (): SurveyFormValues => ({
  title: "",
  description: "",
  isListed: false,
  questions: [],
});

const toInt = (value: string) => {
  const n = Number(value);
  return value.trim() !== "" && Number.isInteger(n) ? n : null;
};

/**
 * Pergunta do construtor no formato que o respondente recebe (RF-02), para o preview
 * usar os mesmos componentes do formulário público (RF-05, critério 2).
 */
export function toPreviewQuestion(q: QuestionFormValues, index: number): PublicQuestion {
  return {
    id: `preview-${index}`,
    type: q.type,
    title: q.title.trim() || "Pergunta sem enunciado",
    helpText: q.helpText.trim() || null,
    required: q.required,
    minSelections: q.type === "MULTIPLE_CHOICE" ? toInt(q.minSelections) : null,
    maxSelections: q.type === "MULTIPLE_CHOICE" ? toInt(q.maxSelections) : null,
    options: q.options.map((o, oi) => ({
      id: `preview-${index}-${oi}`,
      label: o.label.trim() || `Opção ${oi + 1}`,
    })),
  };
}
