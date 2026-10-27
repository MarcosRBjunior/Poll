"use client";

import { useState } from "react";

type Props = { path: string; className?: string };

/** Copia o link público completo (RF-11, critério 2). */
export function CopyLinkButton({ path, className }: Props) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(new URL(path, window.location.origin).toString());
      setState("copied");
    } catch {
      setState("failed");
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={() => void copy()}
        className={
          className ?? "rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700"
        }
      >
        Copiar link
      </button>
      <span aria-live="polite" className="text-sm text-zinc-600 dark:text-zinc-400">
        {state === "copied" && "Link copiado."}
        {state === "failed" && "Não foi possível copiar."}
      </span>
    </span>
  );
}
