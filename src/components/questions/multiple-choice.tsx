"use client";

import { selectionRange } from "@/features/responses/schemas";
import { FieldError, HelpText, RequiredMark } from "./question-header";
import { describedBy, ids, type QuestionProps } from "./types";

function rangeHint(min: number, max: number, total: number) {
  if (min > 1 && max < total) return `Escolha de ${min} a ${max} opções.`;
  if (min > 1) return `Escolha pelo menos ${min} opções.`;
  if (max < total) return max === 1 ? "Escolha até 1 opção." : `Escolha até ${max} opções.`;
  return "Escolha quantas quiser.";
}

/** MULTIPLE_CHOICE: caixas de seleção, com mínimo e máximo opcionais (RF-02, RN-06). */
export function MultipleChoice({
  question,
  value,
  onChange,
  onBlur,
  error,
  disabled,
}: QuestionProps<string[]>) {
  const i = ids(question.id);
  const { min, max } = selectionRange(question);
  const selected = new Set(value);

  function toggle(optionId: string, checked: boolean) {
    // Mantém a ordem das opções, não a ordem dos cliques.
    const next = new Set(selected);
    if (checked) next.add(optionId);
    else next.delete(optionId);
    onChange(question.options.map((o) => o.id).filter((id) => next.has(id)));
  }

  return (
    <fieldset
      className="flex min-w-0 flex-col gap-3"
      aria-describedby={describedBy(question, error, true)}
      aria-invalid={error ? true : undefined}
      disabled={disabled}
    >
      <legend id={i.title} className="mb-1 text-base font-medium">
        {question.title}
        <RequiredMark required={question.required} />
      </legend>
      <HelpText question={question} />
      <p id={i.hint} className="text-sm text-zinc-600 dark:text-zinc-400">
        {rangeHint(min, max, question.options.length)}
      </p>
      <div className="flex flex-col gap-2">
        {question.options.map((option) => (
          <label
            key={option.id}
            className="flex cursor-pointer items-start gap-3 rounded-md border border-zinc-300 px-3 py-2 has-[:checked]:border-zinc-900 dark:border-zinc-700 dark:has-[:checked]:border-zinc-100"
          >
            <input
              type="checkbox"
              name={i.field}
              value={option.id}
              checked={selected.has(option.id)}
              onChange={(event) => toggle(option.id, event.target.checked)}
              onBlur={onBlur}
              className="mt-1 size-4 shrink-0"
            />
            <span className="min-w-0 break-words">{option.label}</span>
          </label>
        ))}
      </div>
      <FieldError questionId={question.id} error={error} />
    </fieldset>
  );
}
