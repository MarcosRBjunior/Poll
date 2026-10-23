"use client";

import { textLimit } from "@/features/responses/schemas";
import { FieldError, HelpText, RequiredMark } from "./question-header";
import { describedBy, ids, type QuestionProps } from "./types";

function Counter({ id, length, limit }: { id: string; length: number; limit: number }) {
  return (
    <p id={id} className="text-right text-sm tabular-nums text-zinc-600 dark:text-zinc-400">
      {length.toLocaleString("pt-BR")}/{limit.toLocaleString("pt-BR")}
      <span className="sr-only"> caracteres</span>
    </p>
  );
}

function TextAnswer({
  question,
  value,
  onChange,
  onBlur,
  error,
  disabled,
  multiline,
}: QuestionProps<string> & { multiline: boolean }) {
  const i = ids(question.id);
  const limit = textLimit(question.type);
  const common = {
    id: i.field,
    name: i.field,
    value,
    maxLength: limit,
    disabled,
    onBlur,
    "aria-describedby": describedBy(question, error, true),
    "aria-invalid": error ? true : undefined,
    className:
      "w-full rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900 aria-[invalid=true]:border-red-700",
  } as const;

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <label htmlFor={i.field} id={i.title} className="text-base font-medium">
        {question.title}
        <RequiredMark required={question.required} />
      </label>
      <HelpText question={question} />
      {multiline ? (
        <textarea {...common} rows={5} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input {...common} type="text" onChange={(e) => onChange(e.target.value)} />
      )}
      <Counter id={i.hint} length={value.length} limit={limit} />
      <FieldError questionId={question.id} error={error} />
    </div>
  );
}

/** SHORT_TEXT: uma linha, até 200 caracteres, com contador (RF-02). */
export function ShortText(props: QuestionProps<string>) {
  return <TextAnswer {...props} multiline={false} />;
}

/** LONG_TEXT: área de texto, até 2.000 caracteres, com contador (RF-02). */
export function LongText(props: QuestionProps<string>) {
  return <TextAnswer {...props} multiline />;
}
