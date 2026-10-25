import type { Metadata } from "next";
import Link from "next/link";
import { SignOutButton } from "@/components/auth/sign-out-button";

export const metadata: Metadata = { title: "Administração — Poll" };

// Provisório: o painel de tendências (T09) chega na F8.
export default function AdminPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-16">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Administração</h1>
        <SignOutButton />
      </div>
      <p className="text-zinc-700 dark:text-zinc-300">Você entrou como administrador.</p>
      {/* Provisório até a lista de pesquisas (T05, F7). */}
      <Link
        href="/admin/surveys/new"
        className="self-start rounded-md bg-zinc-900 px-4 py-2 font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
      >
        Nova pesquisa
      </Link>
    </main>
  );
}
