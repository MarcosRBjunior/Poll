import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { RequestForm } from "@/components/requests/request-form";
import { requireUserOrLogin } from "@/lib/auth";

export const metadata: Metadata = { title: "Solicitar pesquisa — Poll" };

// T11: solicitar pesquisa (RF-21). Sem sessão, vai para o login e volta para cá.
export default function NewRequestPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Solicitar pesquisa</h1>
        <p className="text-zinc-700 dark:text-zinc-300">
          Só o administrador cria pesquisas. Conte o que você quer descobrir; você acompanha o
          pedido em Minhas solicitações.
        </p>
      </header>
      <Suspense fallback={<p className="text-zinc-600 dark:text-zinc-400">Carregando…</p>}>
        <Guarded />
      </Suspense>
    </main>
  );
}

async function Guarded() {
  await connection();
  await requireUserOrLogin("/requests/new");
  return <RequestForm />;
}
