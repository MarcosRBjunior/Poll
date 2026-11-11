"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useForm, type FieldPath, type Resolver } from "react-hook-form";
import { Field, inputClass } from "@/components/builder/fields";
import { groupInputSchema, type GroupFormValues, type GroupInput } from "@/features/groups/schemas";
import type { GroupRow } from "@/features/groups/service";
import { formatNumber } from "@/lib/format";

type ErrorBody = {
  error?: { message?: string; details?: { path: string; message: string }[] };
};

const buttonClass =
  "rounded-md border border-zinc-300 px-3 py-1.5 text-sm disabled:opacity-40 dark:border-zinc-700";
const primaryClass =
  "rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900";

type Dialog = { kind: "edit"; group?: GroupRow } | { kind: "delete"; group: GroupRow } | null;

/** T08 (RF-16): lista de grupos com criar, renomear e excluir. */
export function GroupManager({ groups }: { groups: GroupRow[] }) {
  const router = useRouter();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [message, setMessage] = useState<string | null>(null);

  function done(text: string) {
    setDialog(null);
    setMessage(text);
    router.refresh();
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p role="status" className="text-sm">
          {message}
        </p>
        <button
          type="button"
          onClick={() => {
            setMessage(null);
            setDialog({ kind: "edit" });
          }}
          className={primaryClass}
        >
          Novo grupo
        </button>
      </div>

      {groups.length === 0 ? (
        <div className="rounded-md border border-dashed border-zinc-300 p-6 text-sm dark:border-zinc-700">
          <p className="font-medium">Nenhum grupo ainda.</p>
          <p className="mt-1 text-zinc-600 dark:text-zinc-400">
            Um grupo reúne pesquisas relacionadas, como “Ecossistema JavaScript” ou
            “Entretenimento”. O painel de tendências compara as pesquisas de um mesmo grupo ao longo
            do tempo. Depois de criar, escolha o grupo no construtor de cada pesquisa.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {groups.map((group) => (
            <li
              key={group.id}
              aria-label={group.name}
              className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-zinc-200 p-4 dark:border-zinc-800"
            >
              <div className="min-w-0">
                <h2 className="font-semibold break-words">{group.name}</h2>
                {group.description && (
                  <p className="mt-1 text-sm break-words text-zinc-600 dark:text-zinc-400">
                    {group.description}
                  </p>
                )}
                <p className="mt-1 text-sm">
                  {group.surveyCount === 1
                    ? "1 pesquisa"
                    : `${formatNumber(group.surveyCount)} pesquisas`}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setMessage(null);
                    setDialog({ kind: "edit", group });
                  }}
                  className={buttonClass}
                >
                  Renomear
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMessage(null);
                    setDialog({ kind: "delete", group });
                  }}
                  className={buttonClass}
                >
                  Excluir
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {dialog?.kind === "edit" && (
        <GroupDialog
          group={dialog.group}
          onCancel={() => setDialog(null)}
          onSaved={() => done(dialog.group ? "Grupo atualizado." : "Grupo criado.")}
        />
      )}
      {dialog?.kind === "delete" && (
        <DeleteDialog
          group={dialog.group}
          onCancel={() => setDialog(null)}
          onDeleted={() => done("Grupo excluído. As pesquisas dele ficaram sem grupo.")}
        />
      )}
    </>
  );
}

function Modal({
  labelledBy,
  describedBy,
  role = "dialog",
  onCancel,
  children,
}: {
  labelledBy: string;
  describedBy?: string;
  role?: "dialog" | "alertdialog";
  onCancel: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 p-4">
      <div
        role={role}
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        onKeyDown={(e) => e.key === "Escape" && onCancel()}
        className="flex w-full max-w-md flex-col gap-3 rounded-md bg-[var(--background)] p-5 shadow-lg"
      >
        {children}
      </div>
    </div>
  );
}

/** Criar (sem `group`) ou renomear. Nome repetido aparece no campo (T08). */
function GroupDialog({
  group,
  onCancel,
  onSaved,
}: {
  group?: GroupRow;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [error, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, setError, setFocus, formState } = useForm<
    GroupFormValues,
    unknown,
    GroupInput
  >({
    defaultValues: { name: group?.name ?? "", description: group?.description ?? "" },
    resolver: zodResolver(groupInputSchema) as unknown as Resolver<
      GroupFormValues,
      unknown,
      GroupInput
    >,
  });
  const { errors, isSubmitting } = formState;
  useEffect(() => setFocus("name"), [setFocus]);

  async function save(input: GroupInput) {
    setFormError(null);
    const response = await fetch(group ? `/api/v1/groups/${group.id}` : "/api/v1/groups", {
      method: group ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }).catch(() => null);
    if (response?.ok) return onSaved();
    const body = ((await response?.json().catch(() => null)) as ErrorBody | null)?.error;
    const details = body?.details ?? [];
    details.forEach((d, i) =>
      setError(
        d.path as FieldPath<GroupFormValues>,
        { type: "server", message: d.message },
        { shouldFocus: i === 0 },
      ),
    );
    if (!details.length) setFormError(body?.message ?? "Não foi possível salvar.");
  }

  return (
    <Modal labelledBy="group-dialog-title" onCancel={onCancel}>
      <h2 id="group-dialog-title" className="text-lg font-semibold">
        {group ? "Renomear grupo" : "Novo grupo"}
      </h2>
      <form
        onSubmit={(event) => void handleSubmit(save)(event)}
        noValidate
        className="flex flex-col gap-3"
      >
        <Field id="group-name" label="Nome" error={errors.name?.message}>
          {(props) => (
            <input {...props} {...register("name")} maxLength={80} className={inputClass} />
          )}
        </Field>
        <Field
          id="group-description"
          label="Descrição (opcional)"
          error={errors.description?.message}
        >
          {(props) => (
            <textarea
              {...props}
              {...register("description")}
              rows={3}
              maxLength={500}
              className={inputClass}
            />
          )}
        </Field>
        {error && (
          <p role="alert" className="text-sm text-red-700 dark:text-red-400">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <button type="submit" disabled={isSubmitting} className={primaryClass}>
            {isSubmitting ? "Salvando…" : group ? "Salvar" : "Criar grupo"}
          </button>
          <button type="button" onClick={onCancel} className={buttonClass}>
            Cancelar
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Confirmação avisando que as pesquisas ficam sem grupo (RN-21). */
function DeleteDialog({
  group,
  onCancel,
  onDeleted,
}: {
  group: GroupRow;
  onCancel: () => void;
  onDeleted: () => void;
}) {
  const cancel = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => cancel.current?.focus(), []);
  const surveys =
    group.surveyCount === 0
      ? "Ele não tem pesquisas."
      : `As ${formatNumber(group.surveyCount)} pesquisa(s) dele continuam existindo, só que sem grupo.`;

  async function confirm() {
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/v1/groups/${group.id}`, { method: "DELETE" }).catch(
      () => null,
    );
    setBusy(false);
    if (response?.ok) return onDeleted();
    setError("Não foi possível excluir. Tente de novo.");
  }

  return (
    <Modal
      role="alertdialog"
      labelledBy="delete-group-title"
      describedBy="delete-group-text"
      onCancel={onCancel}
    >
      <h2 id="delete-group-title" className="text-lg font-semibold break-words">
        Excluir o grupo “{group.name}”?
      </h2>
      <p id="delete-group-text" className="text-sm">
        {surveys} Não dá para desfazer.
      </p>
      {error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void confirm()}
          disabled={busy}
          className="rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {busy ? "Excluindo…" : "Excluir"}
        </button>
        <button ref={cancel} type="button" onClick={onCancel} className={buttonClass}>
          Cancelar
        </button>
      </div>
    </Modal>
  );
}
