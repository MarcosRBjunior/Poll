import type { PublicQuestion } from "@/features/responses/schemas";

/** Contrato comum dos componentes de pergunta: controlados, sem estado próprio. */
export type QuestionProps<V> = {
  question: PublicQuestion;
  value: V;
  onChange: (value: V) => void;
  onBlur?: () => void;
  error?: string;
  disabled?: boolean;
};

export const ids = (questionId: string) => ({
  field: `q-${questionId}`,
  title: `q-${questionId}-title`,
  help: `q-${questionId}-help`,
  error: `q-${questionId}-error`,
  hint: `q-${questionId}-hint`,
});

/** Ids de ajuda, dica e erro que descrevem o controle (aria-describedby). */
export function describedBy(question: PublicQuestion, error?: string, hint?: boolean) {
  const i = ids(question.id);
  return (
    [question.helpText && i.help, hint && i.hint, error && i.error].filter(Boolean).join(" ") ||
    undefined
  );
}
