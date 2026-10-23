"use client";

import { FieldError, HelpText, RequiredMark } from "./question-header";
import { describedBy, ids, type QuestionProps } from "./types";

/** SINGLE_CHOICE: botões de rádio (RF-02). Sim/não e escalas também usam este componente. */
export function SingleChoice({
  question,
  value,
  onChange,
  onBlur,
  error,
  disabled,
}: QuestionProps<string>) {
  const i = ids(question.id);
  return (
    <fieldset
      className="flex min-w-0 flex-col gap-3"
      aria-describedby={describedBy(question, error)}
      aria-invalid={error ? true : undefined}
      disabled={disabled}
    >
      <legend id={i.title} className="mb-1 text-base font-medium">
        {question.title}
        <RequiredMark required={question.required} />
      </legend>
      <HelpText question={question} />
      <div className="flex flex-col gap-2">
        {question.options.map((option) => (
          <label
            key={option.id}
            className="flex cursor-pointer items-start gap-3 rounded-md border border-zinc-300 px-3 py-2 has-[:checked]:border-zinc-900 dark:border-zinc-700 dark:has-[:checked]:border-zinc-100"
          >
            <input
              type="radio"
              name={i.field}
              value={option.id}
              checked={value === option.id}
              onChange={() => onChange(option.id)}
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
