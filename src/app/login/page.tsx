import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = { title: "Entrar — Poll" };

// T04: depois do login, volta para `next`; sem ele, o callback decide pelo papel.
export default function LoginPage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Entrar</h1>
      <Suspense fallback={<p className="text-zinc-600 dark:text-zinc-400">Carregando…</p>}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
