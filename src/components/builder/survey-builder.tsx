"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useFieldArray, useForm, type FieldPath, type Resolver } from "react-hook-form";
import {
  newQuestion,
  surveyInputSchema,
  type SurveyFormValues,
  type SurveyInput,
} from "@/features/surveys/schemas";
import type { SurveyDetail } from "@/features/surveys/service";
import { CopyLinkButton } from "@/components/ui/copy-link-button";
import { BuilderPreview } from "./builder-preview";
import { Field, inputClass } from "./fields";
import { detailToForm, emptySurveyForm } from "./form-values";
import { QuestionEditor } from "./question-editor";

/** Solicitação que originou a pesquisa (RF-22): preenche o título e fica visível ao montar. */
export type FromRequest = {
  id: string;
  topic: string;
  goal: string;
  suggestedQuestions: string | null;
  audience: string | null;
};

type Props = { detail?: SurveyDetail; fromRequest?: FromRequest };

type Status =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "published" }
  | { kind: "conflict" }
  | { kind: "error"; message: string };

type ErrorBody = {
  error?: { code?: string; message?: string; details?: { path: string; message: string }[] };
};

const statusLabel = { DRAFT: "Rascunho", PUBLISHED: "Publicada", CLOSED: "Encerrada" } as const;

/** Construtor de pesquisas (T06, RF-05 a RF-07, RF-09). Sem `detail`, cria uma nova. */
export function SurveyBuilder({ detail: initial, fromRequest }: Props) {
  // O detalhe salvo mais recente: version, slug e status vêm da resposta do PUT.
  const [detail, setDetail] = useState(initial);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [showPreview, setShowPreview] = useState(false);
  const restricted = detail?.hasResponses ?? false;
  const conflictButton = useRef<HTMLButtonElement>(null);
  const leaving = useRef(false);

  const { control, register, handleSubmit, setValue, setError, reset, getValues, formState } =
    useForm<SurveyFormValues, unknown, SurveyInput>({
      defaultValues: initial
        ? detailToForm(initial)
        : { ...emptySurveyForm(), title: fromRequest?.topic.slice(0, 120) ?? "" },
      // O schema converte os textos do formulário (valores, limites) em números.
      resolver: zodResolver(surveyInputSchema) as unknown as Resolver<
        SurveyFormValues,
        unknown,
        SurveyInput
      >,
      shouldFocusError: true,
    });
  const { fields, append, remove, move, insert } = useFieldArray({
    control,
    name: "questions",
    keyName: "key",
  });
  const { errors, isDirty } = formState;

  // Aviso ao sair com alterações não salvas (T06).
  useEffect(() => {
    if (!isDirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      if (!leaving.current) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty]);

  useEffect(() => {
    if (status.kind === "conflict") conflictButton.current?.focus();
  }, [status]);

  /** Mostra os erros da API junto dos campos (os caminhos seguem os nomes do formulário). */
  function showErrors(error: ErrorBody["error"], fallback: string) {
    const details = error?.details ?? [];
    details.forEach((d, i) => {
      setError(
        d.path as FieldPath<SurveyFormValues>,
        { type: "server", message: d.message },
        { shouldFocus: i === 0 },
      );
    });
    setStatus({
      kind: "error",
      message: details.length ? (error?.message ?? "Revise os campos destacados.") : fallback,
    });
  }

  /** Passa a editar o que foi salvo: ids e version novos vêm do servidor. */
  function adopt(saved: SurveyDetail) {
    setDetail(saved);
    reset(detailToForm(saved));
    if (!detail) {
      // Criada agora: a URL vira a de edição sem recarregar a tela.
      window.history.replaceState(null, "", `/admin/surveys/${saved.id}/edit`);
    }
  }

  async function save(input: SurveyInput, publishAfter = false) {
    setStatus({ kind: "saving" });
    let response: Response;
    try {
      response = await fetch(detail ? `/api/v1/surveys/${detail.id}` : "/api/v1/surveys", {
        method: detail ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          detail ? { ...input, version: detail.version } : { ...input, requestId: fromRequest?.id },
        ),
      });
    } catch {
      setStatus({ kind: "error", message: "Não foi possível salvar: verifique sua conexão." });
      return;
    }

    if (!response.ok) {
      const error = ((await response.json().catch(() => null)) as ErrorBody | null)?.error;
      if (error?.code === "VERSION_CONFLICT") setStatus({ kind: "conflict" });
      else showErrors(error, "Não foi possível salvar. Tente novamente.");
      return;
    }

    const saved = (await response.json()) as SurveyDetail;
    adopt(saved);
    if (publishAfter) await publish(saved);
    else setStatus({ kind: "saved" });
  }

  /** Publicar (RF-11): a API revalida a pesquisa inteira e lista o que falta. */
  async function publish(saved: SurveyDetail) {
    const response = await fetch(`/api/v1/surveys/${saved.id}/publish`, { method: "POST" }).catch(
      () => null,
    );
    if (response?.ok) {
      setDetail({ ...saved, status: "PUBLISHED" });
      setStatus({ kind: "published" });
      return;
    }
    const error = ((await response?.json().catch(() => null)) as ErrorBody | null)?.error;
    showErrors(error, "Salvo, mas não foi possível publicar agora. Tente de novo.");
  }

  const saving = status.kind === "saving";

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          <Link href="/admin" className="underline">
            Administração
          </Link>
          {detail && ` · ${statusLabel[detail.status]}`}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">
          {detail ? "Editar pesquisa" : "Nova pesquisa"}
        </h1>
        {detail && (
          <div className="flex flex-wrap gap-4 text-sm">
            <Link href={`/admin/surveys/${detail.id}/results`} className="underline">
              Resultados
            </Link>
            {detail.status !== "DRAFT" && (
              <>
                <Link href={`/s/${detail.slug}`} className="underline">
                  Abrir a pesquisa
                </Link>
                <CopyLinkButton path={`/s/${detail.slug}`} />
              </>
            )}
          </div>
        )}
      </header>

      {fromRequest && !detail && (
        <aside
          aria-label="Solicitação de origem"
          className="flex flex-col gap-2 rounded-md border border-zinc-300 p-3 text-sm dark:border-zinc-700"
        >
          <p className="font-medium">A partir da solicitação “{fromRequest.topic}”</p>
          <p className="whitespace-pre-line break-words">
            <strong>Objetivo:</strong> {fromRequest.goal}
          </p>
          {fromRequest.audience && (
            <p className="break-words">
              <strong>Público-alvo:</strong> {fromRequest.audience}
            </p>
          )}
          {fromRequest.suggestedQuestions && (
            <p className="whitespace-pre-line break-words">
              <strong>Sugestões de perguntas:</strong> {fromRequest.suggestedQuestions}
            </p>
          )}
          <p className="text-zinc-600 dark:text-zinc-400">
            Ao salvar, a solicitação passa a aceita; ao publicar, a concluída.
          </p>
        </aside>
      )}

      {restricted && (
        <div
          role="note"
          className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
        >
          <strong>Modo restrito:</strong> esta pesquisa já tem {detail?.responseCount} resposta(s).
          Você pode corrigir textos, adicionar e reordenar. Perguntas e opções removidas são
          arquivadas e continuam nos resultados. Não dá para trocar o tipo de uma pergunta salva nem
          o valor de uma opção salva.
        </div>
      )}

      <button
        type="button"
        onClick={() => setShowPreview((v) => !v)}
        aria-expanded={showPreview}
        aria-controls="builder-preview"
        className="self-start rounded-md border border-zinc-300 px-3 py-1.5 text-sm lg:hidden dark:border-zinc-700"
      >
        {showPreview ? "Voltar para a edição" : "Ver preview"}
      </button>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <form
          onSubmit={(event) => void handleSubmit((input) => save(input))(event)}
          noValidate
          className={`flex flex-col gap-6 ${showPreview ? "hidden lg:flex" : ""}`}
        >
          <section className="flex flex-col gap-4" aria-label="Dados da pesquisa">
            <Field id="survey-title" label="Título" error={errors.title?.message}>
              {(props) => <input {...props} {...register("title")} className={inputClass} />}
            </Field>
            <Field
              id="survey-description"
              label="Descrição (opcional)"
              error={errors.description?.message}
            >
              {(props) => (
                <textarea {...props} {...register("description")} rows={3} className={inputClass} />
              )}
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" {...register("isListed")} className="size-4" />
              Mostrar na página inicial quando publicada
            </label>
          </section>

          <section className="flex flex-col gap-4" aria-labelledby="questions-heading">
            <h2 id="questions-heading" className="text-lg font-semibold">
              Perguntas
            </h2>
            {fields.length === 0 && (
              <p className="rounded-md border border-dashed border-zinc-300 p-4 text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
                Adicione a primeira pergunta.
              </p>
            )}
            {/* Erro da lista inteira: limite de perguntas (schema) ou nenhuma pergunta (publicar). */}
            {(errors.questions?.message ?? errors.questions?.root?.message) && (
              <p className="text-sm font-medium text-red-700 dark:text-red-400">
                {errors.questions?.message ?? errors.questions?.root?.message}
              </p>
            )}
            {fields.map((field, index) => (
              <QuestionEditor
                key={field.key}
                index={index}
                count={fields.length}
                control={control}
                register={register}
                setValue={setValue}
                locked={restricted && field.id !== undefined}
                onMove={(to) => move(index, to)}
                onDuplicate={() => {
                  // A cópia é uma pergunta nova: sem ids de pergunta nem de opção.
                  const { id: _id, options, ...copy } = getValues(`questions.${index}`);
                  void _id;
                  insert(index + 1, {
                    ...copy,
                    options: options.map((o) => ({ label: o.label, value: o.value })),
                  });
                }}
                onRemove={() => remove(index)}
              />
            ))}
            <button
              type="button"
              disabled={fields.length >= 50}
              onClick={() => append(newQuestion())}
              className="self-start rounded-md border border-zinc-300 px-3 py-1.5 text-sm disabled:opacity-40 dark:border-zinc-700"
            >
              + Adicionar pergunta
            </button>
          </section>

          <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t border-zinc-200 bg-[var(--background)] py-3 dark:border-zinc-800">
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-zinc-900 px-5 py-2 font-medium text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
            >
              {saving ? "Salvando…" : "Salvar"}
            </button>
            {(!detail || detail.status === "DRAFT") && (
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleSubmit((input) => save(input, true))()}
                className="rounded-md border border-zinc-900 px-5 py-2 font-medium disabled:opacity-60 dark:border-zinc-100"
              >
                Salvar e publicar
              </button>
            )}
            <p aria-live="polite" className="text-sm">
              {status.kind === "saved" && !isDirty && "Alterações salvas."}
              {status.kind === "published" &&
                !isDirty &&
                "Pesquisa publicada. O link está no topo da página."}
              {isDirty && !saving && "Há alterações não salvas."}
            </p>
            {status.kind === "error" && (
              <p role="alert" className="w-full text-sm font-medium text-red-700 dark:text-red-400">
                {status.message}
              </p>
            )}
          </div>
        </form>

        <div
          id="builder-preview"
          className={`${showPreview ? "" : "hidden"} lg:block lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:self-start lg:overflow-y-auto rounded-md border border-zinc-200 p-4 dark:border-zinc-800`}
        >
          <BuilderPreview control={control} />
        </div>
      </div>

      {status.kind === "conflict" && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 p-4">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="conflict-title"
            aria-describedby="conflict-text"
            className="flex max-w-md flex-col gap-3 rounded-md bg-[var(--background)] p-5 shadow-lg"
          >
            <h2 id="conflict-title" className="text-lg font-semibold">
              Esta pesquisa mudou
            </h2>
            <p id="conflict-text" className="text-sm">
              Outra aba (ou outra pessoa) salvou uma versão mais nova. Recarregue para ver a versão
              atual; as alterações desta tela que não foram salvas serão perdidas.
            </p>
            <div className="flex gap-2">
              <button
                ref={conflictButton}
                type="button"
                onClick={() => {
                  leaving.current = true; // recarregar descarta o que não foi salvo, já avisado
                  window.location.reload();
                }}
                className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
              >
                Recarregar
              </button>
              <button
                type="button"
                onClick={() => setStatus({ kind: "idle" })}
                className="rounded-md border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700"
              >
                Continuar editando
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
