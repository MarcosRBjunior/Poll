"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  requestStatusLabel,
  requestTransitions,
  type RequestStatus,
} from "@/features/requests/schemas";

type Props = { id: string; status: RequestStatus; adminNote: string | null; hasSurvey: boolean };

type ErrorBody = { error?: { message?: string; details?: { message: string }[] } };

const buttonClass =
  "rounded-md border border-zinc-300 px-3 py-1.5 text-sm disabled:opacity-40 dark:border-zinc-700";

/** Ações do administrador numa solicitação (T13, RF-22): status, nota e criar pesquisa. */
export function RequestActions({ id, status, adminNote, hasSurvey }: Props) {
  const router = useRouter();
  const [next, setNext] = useState<RequestStatus | "">("");
  const [note, setNote] = useState(adminNote ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  // ACCEPTED e DONE vêm de criar e publicar a pesquisa (RN-22); à mão, só as demais.
  const manual = requestTransitions[status].filter((s) => s !== "ACCEPTED" || hasSurvey);
  const canCreate = !hasSurvey && (status === "PENDING" || status === "IN_REVIEW");
  const final = status === "DONE" || status === "REJECTED";

  async function save() {
    setSaving(true);
    setMessage(null);
    const response = await fetch(`/api/v1/survey-requests/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...(next && { status: next }), adminNote: note }),
    }).catch(() => null);
    setSaving(false);
    if (response?.ok) {
      setMessage({ error: false, text: "Solicitação atualizada." });
      setNext("");
      router.refresh();
      return;
    }
    const error = ((await response?.json().catch(() => null)) as ErrorBody | null)?.error;
    setMessage({
      error: true,
      text: error?.details?.[0]?.message ?? error?.message ?? "Não foi possível salvar.",
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {canCreate && (
        <Link
          href={`/admin/surveys/new?request=${id}`}
          className="self-start rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          Criar pesquisa a partir desta
        </Link>
      )}
      {!final && (
        <>
          <label className="flex flex-col gap-1 text-sm">
            Nota para o solicitante (opcional; obrigatória para recusar)
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={1000}
              className="rounded-md border border-zinc-300 bg-transparent px-3 py-2 dark:border-zinc-700"
            />
          </label>
          <div className="flex flex-wrap items-end gap-2">
            {manual.length > 0 && (
              <label className="flex flex-col gap-1 text-sm">
                Mudar status
                <select
                  value={next}
                  onChange={(e) => setNext(e.target.value as RequestStatus | "")}
                  className="rounded-md border border-zinc-300 bg-transparent px-2 py-1.5 dark:border-zinc-700"
                >
                  <option value="">Manter ({requestStatusLabel[status].toLowerCase()})</option>
                  {manual.map((s) => (
                    <option key={s} value={s}>
                      {requestStatusLabel[s]}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className={buttonClass}
            >
              {saving ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </>
      )}
      {message && (
        <p
          role={message.error ? "alert" : "status"}
          className={`text-sm ${message.error ? "text-red-700 dark:text-red-400" : ""}`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
