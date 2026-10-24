import type { PublicQuestion } from "@/features/responses/schemas";
import { ids } from "./types";

export function RequiredMark({ required }: { required: boolean }) {
  // O espaço fica fora do <span>: dentro dele o nome acessível sairia colado ("Título?(opcional)").
  if (!required) {
    return (
      <>
        {" "}
        <span className="font-normal text-zinc-600 dark:text-zinc-400">(opcional)</span>
      </>
    );
  }
  return (
    <>
      {" "}
      <span className="text-red-700 dark:text-red-400" aria-hidden="true">
        *
      </span>
      <span className="sr-only">(obrigatória)</span>
    </>
  );
}

export function HelpText({ question }: { question: PublicQuestion }) {
  if (!question.helpText) return null;
  return (
    <p id={ids(question.id).help} className="text-sm text-zinc-600 dark:text-zinc-400">
      {question.helpText}
    </p>
  );
}

export function FieldError({ questionId, error }: { questionId: string; error?: string }) {
  if (!error) return null;
  return (
    <p id={ids(questionId).error} className="text-sm font-medium text-red-700 dark:text-red-400">
      {error}
    </p>
  );
}
