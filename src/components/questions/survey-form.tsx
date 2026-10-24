"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useAtom } from "jotai";
import { RESET } from "jotai/utils";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Controller, useForm, type FieldErrors } from "react-hook-form";
import {
  buildFormSchema,
  emptyFormValues,
  toAnswers,
  type FormValues,
  type PublicQuestion,
} from "@/features/responses/schemas";
import { DRAFT_DELAY_MS, responseDraftFamily } from "@/state/response-draft";
import { QuestionRenderer } from "./question-renderer";

type Props = { slug: string; questions: PublicQuestion[] };

type Status =
  { kind: "idle" } | { kind: "sending" } | { kind: "error"; message: string; retry: boolean };

type ErrorBody = {
  error?: { code?: string; message?: string; details?: { path: string; message: string }[] };
};

/** Só reaproveita do rascunho valores de perguntas que ainda existem, no formato certo. */
function restore(questions: PublicQuestion[], saved: FormValues): FormValues {
  const values = emptyFormValues(questions);
  for (const question of questions) {
    const value = saved[question.id];
    const expectsList = question.type === "MULTIPLE_CHOICE";
    if (expectsList ? Array.isArray(value) : typeof value === "string")
      values[question.id] = value!;
  }
  return values;
}

function focusQuestion(questionId: string) {
  document.querySelector<HTMLElement>(`[name="q-${CSS.escape(questionId)}"]`)?.focus();
}

/** Formulário de resposta (T02, RF-03). Os valores vivem no React Hook Form. */
export function SurveyForm({ slug, questions }: Props) {
  const router = useRouter();
  const [draft, setDraft] = useAtom(responseDraftFamily(slug));
  // A mesma chave em todas as tentativas deste preenchimento: repetir o envio não duplica (RN-14).
  const idempotencyKey = useRef(draft?.idempotencyKey ?? crypto.randomUUID());
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const { control, handleSubmit, reset, subscribe, setError } = useForm<FormValues>({
    defaultValues: emptyFormValues(questions),
    resolver: zodResolver(buildFormSchema(questions)),
    shouldFocusError: false,
  });

  // Recupera o rascunho uma vez, depois da hidratação (US-2.4).
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    if (draft) reset(restore(questions, draft.values));
  }, [draft, questions, reset]);

  // Copia os valores para o rascunho 500 ms depois da última mudança.
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    const unsubscribe = subscribe({
      formState: { values: true },
      callback: ({ values }) => {
        clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => {
          setDraft({ values, idempotencyKey: idempotencyKey.current });
        }, DRAFT_DELAY_MS);
      },
    });
    return () => {
      unsubscribe();
      clearTimeout(saveTimer.current);
    };
  }, [subscribe, setDraft]);

  function onInvalid(errors: FieldErrors<FormValues>) {
    const first = questions.find((q) => errors[q.id]);
    if (first) focusQuestion(first.id);
  }

  async function onSubmit(values: FormValues) {
    setStatus({ kind: "sending" });
    let response: Response;
    try {
      response = await fetch(`/api/v1/public/surveys/${encodeURIComponent(slug)}/responses`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          idempotencyKey: idempotencyKey.current,
          answers: toAnswers(questions, values),
        }),
      });
    } catch {
      setStatus({
        kind: "error",
        message: "Não foi possível enviar: verifique sua conexão. Suas respostas foram mantidas.",
        retry: true,
      });
      return;
    }

    if (response.ok) {
      clearTimeout(saveTimer.current);
      setDraft(RESET);
      router.push(`/s/${encodeURIComponent(slug)}/thanks`);
      return;
    }

    const body = (await response.json().catch(() => null)) as ErrorBody | null;
    const error = body?.error;
    const fieldErrors = (error?.details ?? []).filter((d) => d.path.startsWith("answers."));
    for (const detail of fieldErrors) {
      setError(detail.path.slice("answers.".length), { type: "server", message: detail.message });
    }
    const firstField = questions.find((q) => fieldErrors.some((d) => d.path === `answers.${q.id}`));
    if (firstField) focusQuestion(firstField.id);

    const retry = response.status >= 500 || response.status === 429;
    setStatus({
      kind: "error",
      message:
        error?.code === "ALREADY_RESPONDED" ||
        error?.code === "SURVEY_CLOSED" ||
        response.status === 429
          ? (error?.message ?? "Não foi possível enviar.")
          : fieldErrors.length
            ? "Revise as perguntas destacadas."
            : "Não foi possível enviar. Tente novamente.",
      retry: retry || (!fieldErrors.length && response.status !== 409),
    });
  }

  const sending = status.kind === "sending";

  return (
    <form
      onSubmit={(event) => void handleSubmit(onSubmit, onInvalid)(event)}
      noValidate
      className="flex flex-col gap-8"
    >
      {questions.map((question) => (
        <Controller
          key={question.id}
          name={question.id}
          control={control}
          render={({ field, fieldState }) => (
            <QuestionRenderer
              question={question}
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              error={fieldState.error?.message}
              disabled={sending}
            />
          )}
        />
      ))}

      <p className="rounded-md bg-zinc-100 p-3 text-sm text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
        As respostas de texto aparecem nos resultados públicos, sem identificar quem escreveu. Não
        escreva dados pessoais.{" "}
        <Link href="/privacy" className="underline">
          Saiba como tratamos os dados
        </Link>
        .
      </p>

      {status.kind === "error" && (
        <p
          role="alert"
          className="rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200"
        >
          {status.message}
        </p>
      )}

      <button
        type="submit"
        disabled={sending}
        className="self-start rounded-md bg-zinc-900 px-5 py-2.5 font-medium text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {sending
          ? "Enviando…"
          : status.kind === "error" && status.retry
            ? "Tentar novamente"
            : "Salvar"}
      </button>
    </form>
  );
}
