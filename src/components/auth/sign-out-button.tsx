"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function signOut() {
    setPending(true);
    setFailed(false);
    const response = await fetch("/api/auth/signout", { method: "POST" }).catch(() => null);
    // 401 também serve: a sessão já tinha acabado.
    if (response && (response.ok || response.status === 401)) {
      router.replace("/");
      router.refresh();
      return;
    }
    setPending(false);
    setFailed(true);
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={signOut}
        disabled={pending}
        className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium disabled:opacity-60 dark:border-zinc-700"
      >
        {pending ? "Saindo…" : "Sair"}
      </button>
      {failed && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          Não foi possível sair. Tente de novo.
        </p>
      )}
    </div>
  );
}
