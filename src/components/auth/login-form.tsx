"use client";

import { useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { loginEmailSchema } from "@/features/users/schemas";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Status =
  | { kind: "idle" }
  | { kind: "pending"; method: "github" | "email" }
  | { kind: "sent"; email: string }
  | { kind: "error"; message: string };

const unavailable = "Não foi possível falar com o serviço de login. Tente de novo em instantes.";

export function LoginForm() {
  const params = useSearchParams();
  const next = params.get("next");
  const [status, setStatus] = useState<Status>(
    params.get("error")
      ? { kind: "error", message: "Não foi possível entrar. Tente de novo." }
      : { kind: "idle" },
  );
  const [emailError, setEmailError] = useState<string>();

  function callbackUrl() {
    const url = new URL("/api/auth/callback", window.location.origin);
    if (next) url.searchParams.set("next", next);
    return url.href;
  }

  async function signInWithGitHub() {
    setStatus({ kind: "pending", method: "github" });
    try {
      const { error } = await createSupabaseBrowserClient().auth.signInWithOAuth({
        provider: "github",
        options: { redirectTo: callbackUrl() },
      });
      if (error) setStatus({ kind: "error", message: unavailable });
    } catch {
      setStatus({ kind: "error", message: unavailable });
    }
  }

  async function sendLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = loginEmailSchema.safeParse({
      email: new FormData(event.currentTarget).get("email"),
    });
    if (!parsed.success) {
      setEmailError(parsed.error.issues[0]?.message);
      return;
    }
    setEmailError(undefined);
    setStatus({ kind: "pending", method: "email" });
    try {
      const { error } = await createSupabaseBrowserClient().auth.signInWithOtp({
        email: parsed.data.email,
        options: { emailRedirectTo: callbackUrl() },
      });
      setStatus(
        error
          ? { kind: "error", message: unavailable }
          : { kind: "sent", email: parsed.data.email },
      );
    } catch {
      setStatus({ kind: "error", message: unavailable });
    }
  }

  const pending = status.kind === "pending";

  return (
    <div className="flex flex-col gap-6">
      {status.kind === "error" && (
        <p
          role="alert"
          className="rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200"
        >
          {status.message}
        </p>
      )}

      <button
        type="button"
        onClick={signInWithGitHub}
        disabled={pending}
        className="rounded-md bg-zinc-900 px-4 py-2 font-medium text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {pending && status.method === "github" ? "Redirecionando…" : "Entrar com GitHub"}
      </button>

      <form onSubmit={sendLink} noValidate className="flex flex-col gap-2">
        <label htmlFor="email" className="text-sm font-medium">
          E-mail
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          aria-invalid={emailError ? true : undefined}
          aria-describedby={emailError ? "email-error" : undefined}
          className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
        />
        {emailError && (
          <p id="email-error" className="text-sm text-red-700 dark:text-red-300">
            {emailError}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="rounded-md border border-zinc-300 px-4 py-2 font-medium disabled:opacity-60 dark:border-zinc-700"
        >
          {pending && status.method === "email" ? "Enviando…" : "Receber link por e-mail"}
        </button>
      </form>

      {status.kind === "sent" && (
        <p role="status" className="text-sm text-zinc-700 dark:text-zinc-300">
          Enviamos um link para {status.email}. Abra-o neste navegador para entrar.
        </p>
      )}
    </div>
  );
}
