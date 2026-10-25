import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Administração — Poll" };

// Provisório: o painel de tendências (T09) chega na F8.
export default function AdminPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Administração</h1>
      <p className="text-zinc-700 dark:text-zinc-300">Você entrou como administrador.</p>
      <div className="flex flex-wrap gap-3">
        <Link
          href="/admin/surveys"
          className="rounded-md bg-zinc-900 px-4 py-2 font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          Pesquisas
        </Link>
        <Link
          href="/admin/surveys/new"
          className="rounded-md border border-zinc-300 px-4 py-2 font-medium dark:border-zinc-700"
        >
          Nova pesquisa
        </Link>
      </div>
    </main>
  );
}
