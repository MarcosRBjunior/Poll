"use client";

import { useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { loginCodeSchema, loginEmailSchema } from "@/features/users/schemas";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Status =
  | { kind: "idle" }
  | { kind: "pending"; method: "github" | "email" | "code" }
  | { kind: "error"; message: string };

const unavailable = "Não foi possível falar com o serviço de login. Tente de novo em instantes.";
const invalidCode = "Código inválido ou expirado. Confira o e-mail ou peça um novo código.";

const field = "rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900";
const secondaryButton =
  "rounded-md border border-zinc-300 px-4 py-2 font-medium disabled:opacity-60 dark:border-zinc-700";

/**
 * T04: GitHub ou código de 6 dígitos por e-mail (D-01). O código é conferido pelo navegador
 * direto no Supabase (o limite de tentativas vale por pessoa); depois o servidor confirma a
 * sessão e espelha o User em `POST /api/auth/complete`.
 */
export function LoginForm() {
  const params = useSearchParams();
  const next = params.get("next");
  const [status, setStatus] = useState<Status>(
    params.get("error")
      ? { kind: "error", message: "Não foi possível entrar. Tente de novo." }
      : { kind: "idle" },
  );
  // E-mail para o qual o código foi enviado: com ele, a tela pede o código.
  const [sentTo, setSentTo] = useState<string>();
  const [fieldError, setFieldError] = useState<string>();

  async function signInWithGitHub() {
    setStatus({ kind: "pending", method: "github" });
    const url = new URL("/api/auth/callback", window.location.origin);
    if (next) url.searchParams.set("next", next);
    try {
      const { error } = await createSupabaseBrowserClient().auth.signInWithOAuth({
        provider: "github",
        options: { redirectTo: url.href },
      });
      if (error) setStatus({ kind: "error", message: unavailable });
    } catch {
      setStatus({ kind: "error", message: unavailable });
    }
  }

  async function sendCode(email: string) {
    setStatus({ kind: "pending", method: "email" });
    try {
      const { error } = await createSupabaseBrowserClient().auth.signInWithOtp({ email });
      if (error) {
        setStatus({ kind: "error", message: unavailable });
        return;
      }
      setSentTo(email);
      setStatus({ kind: "idle" });
    } catch {
      setStatus({ kind: "error", message: unavailable });
    }
  }

  async function onEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = loginEmailSchema.safeParse({
      email: new FormData(event.currentTarget).get("email"),
    });
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message);
      return;
    }
    setFieldError(undefined);
    await sendCode(parsed.data.email);
  }

  async function onCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sentTo) return;
    const parsed = loginCodeSchema.safeParse({
      code: new FormData(event.currentTarget).get("code"),
    });
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message);
      return;
    }
    setFieldError(undefined);
    setStatus({ kind: "pending", method: "code" });
    try {
      const { error } = await createSupabaseBrowserClient().auth.verifyOtp({
        email: sentTo,
        token: parsed.data.code,
        type: "email",
      });
      if (error) {
        setStatus({ kind: "error", message: error.status === 0 ? unavailable : invalidCode });
        return;
      }
      const response = await fetch("/api/auth/complete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ next }),
      });
      if (!response.ok) {
        setStatus({ kind: "error", message: "Não foi possível entrar. Tente de novo." });
        return;
      }
      const { redirectTo } = (await response.json()) as { redirectTo: string };
      window.location.assign(redirectTo);
    } catch {
      setStatus({ kind: "error", message: unavailable });
    }
  }

  function changeEmail() {
    setSentTo(undefined);
    setFieldError(undefined);
    setStatus({ kind: "idle" });
  }

  const pending = status.kind === "pending";
  const describedBy = fieldError ? "login-field-error" : undefined;

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

      {sentTo === undefined ? (
        <form onSubmit={onEmail} noValidate className="flex flex-col gap-2">
          <label htmlFor="email" className="text-sm font-medium">
            E-mail
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            aria-invalid={fieldError ? true : undefined}
            aria-describedby={describedBy}
            className={field}
          />
          {fieldError && (
            <p id="login-field-error" className="text-sm text-red-700 dark:text-red-300">
              {fieldError}
            </p>
          )}
          <button type="submit" disabled={pending} className={secondaryButton}>
            {pending && status.method === "email" ? "Enviando…" : "Receber código por e-mail"}
          </button>
        </form>
      ) : (
        <form onSubmit={onCode} noValidate className="flex flex-col gap-2">
          <p role="status" className="text-sm text-zinc-700 dark:text-zinc-300">
            Enviamos um código de 6 números para {sentTo}. Ele vale por alguns minutos.
          </p>
          <label htmlFor="code" className="text-sm font-medium">
            Código
          </label>
          <input
            id="code"
            name="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            aria-invalid={fieldError ? true : undefined}
            aria-describedby={describedBy}
            className={`${field} tracking-[0.3em]`}
          />
          {fieldError && (
            <p id="login-field-error" className="text-sm text-red-700 dark:text-red-300">
              {fieldError}
            </p>
          )}
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-zinc-900 px-4 py-2 font-medium text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {pending && status.method === "code" ? "Entrando…" : "Entrar"}
          </button>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <button
              type="button"
              disabled={pending}
              onClick={() => void sendCode(sentTo)}
              className="underline disabled:opacity-60"
            >
              {pending && status.method === "email" ? "Enviando…" : "Enviar outro código"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={changeEmail}
              className="underline disabled:opacity-60"
            >
              Usar outro e-mail
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
