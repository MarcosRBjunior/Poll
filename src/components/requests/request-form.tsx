"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, type FieldPath, type Resolver } from "react-hook-form";
import { Field, inputClass } from "@/components/builder/fields";
import {
  requestInputSchema,
  type RequestFormValues,
  type RequestInput,
} from "@/features/requests/schemas";

type ErrorBody = {
  error?: { code?: string; message?: string; details?: { path: string; message: string }[] };
};

/** Formulário de solicitação (T11, RF-21). */
export function RequestForm() {
  const router = useRouter();
  const [sending, setSending] = useState(false);
  const [error, setErrorMessage] = useState<string | null>(null);
  const { register, handleSubmit, setError, formState } = useForm<
    RequestFormValues,
    unknown,
    RequestInput
  >({
    defaultValues: { topic: "", goal: "", suggestedQuestions: "", audience: "" },
    resolver: zodResolver(requestInputSchema) as unknown as Resolver<
      RequestFormValues,
      unknown,
      RequestInput
    >,
  });
  const { errors } = formState;

  async function send(input: RequestInput) {
    setSending(true);
    setErrorMessage(null);
    const response = await fetch("/api/v1/survey-requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }).catch(() => null);
    if (response?.ok) {
      router.push("/requests?enviada=1");
      return;
    }
    setSending(false);
    const body = (await response?.json().catch(() => null)) as ErrorBody | null;
    const details = body?.error?.details ?? [];
    details.forEach((d, i) =>
      setError(
        d.path as FieldPath<RequestFormValues>,
        { type: "server", message: d.message },
        { shouldFocus: i === 0 },
      ),
    );
    setErrorMessage(
      response?.status === 429
        ? (body?.error?.message ?? "Você atingiu o limite de solicitações de hoje.")
        : details.length
          ? "Revise os campos destacados."
          : "Não foi possível enviar. Tente de novo.",
    );
  }

  return (
    <form
      onSubmit={(event) => void handleSubmit(send)(event)}
      noValidate
      className="flex flex-col gap-5"
    >
      <Field id="request-topic" label="Tema" error={errors.topic?.message}>
        {(props) => <input {...props} {...register("topic")} className={inputClass} />}
      </Field>
      <Field id="request-goal" label="Objetivo" error={errors.goal?.message}>
        {(props) => <textarea {...props} {...register("goal")} rows={3} className={inputClass} />}
      </Field>
      <Field
        id="request-questions"
        label="Sugestões de perguntas (opcional)"
        error={errors.suggestedQuestions?.message}
      >
        {(props) => (
          <textarea
            {...props}
            {...register("suggestedQuestions")}
            rows={5}
            className={inputClass}
          />
        )}
      </Field>
      <Field id="request-audience" label="Público-alvo (opcional)" error={errors.audience?.message}>
        {(props) => <input {...props} {...register("audience")} className={inputClass} />}
      </Field>
      {error && (
        <p
          role="alert"
          className="rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200"
        >
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={sending}
        className="self-start rounded-md bg-zinc-900 px-5 py-2.5 font-medium text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {sending ? "Enviando…" : "Enviar solicitação"}
      </button>
    </form>
  );
}
