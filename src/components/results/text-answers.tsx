"use client";

import { useState } from "react";
import { formatDateTime, formatNumber } from "@/lib/format";

export type TextItem = { text: string; submittedAt: string };
export type TextPage = { data: TextItem[]; total: number; pageSize: number };

type Props = { endpoint: string; initial: TextPage };

/** Lista paginada de respostas de texto (RF-12), com "Carregar mais" pela rota `texts`. */
export function TextAnswers({ endpoint, initial }: Props) {
  const [items, setItems] = useState(initial.data);
  const [total, setTotal] = useState(initial.total);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");

  async function loadMore() {
    setStatus("loading");
    const page = Math.floor(items.length / initial.pageSize) + 1;
    try {
      const response = await fetch(`${endpoint}?page=${page}&pageSize=${initial.pageSize}`);
      if (!response.ok) throw new Error(String(response.status));
      const body = (await response.json()) as TextPage;
      setItems((current) => [...current, ...body.data]);
      setTotal(body.total);
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-3">
        {items.map((item, index) => (
          <li
            key={`${item.submittedAt}-${index}`}
            className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800"
          >
            <p className="whitespace-pre-line break-words">{item.text}</p>
            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
              {formatDateTime(new Date(item.submittedAt))}
            </p>
          </li>
        ))}
      </ul>
      <p className="text-sm text-zinc-600 dark:text-zinc-400" aria-live="polite">
        Mostrando {formatNumber(items.length)} de {formatNumber(total)}.
      </p>
      {status === "error" && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          Não foi possível carregar mais respostas.
        </p>
      )}
      {items.length < total && (
        <button
          type="button"
          onClick={() => void loadMore()}
          disabled={status === "loading"}
          className="self-start rounded-md border border-zinc-300 px-3 py-1.5 text-sm disabled:opacity-60 dark:border-zinc-700"
        >
          {status === "loading"
            ? "Carregando…"
            : status === "error"
              ? "Tentar de novo"
              : "Carregar mais"}
        </button>
      )}
    </div>
  );
}
