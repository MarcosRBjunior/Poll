import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { TrendsPanel } from "@/components/trends/trends-panel";
import { listGroups } from "@/features/groups/service";
import { requireAdmin } from "@/lib/auth";
import { todayIso } from "@/lib/format";

export const metadata: Metadata = { title: "Painel de tendências — Poll" };

// T09: painel de tendências por grupo de pesquisas (RF-17, US-7.3).
export default function AdminPage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Painel de tendências</h1>
        <Link
          href="/admin/surveys/new"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          Nova pesquisa
        </Link>
      </div>
      <Suspense
        fallback={
          <div
            aria-busy="true"
            aria-label="Carregando o painel"
            className="h-64 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-900"
          />
        }
      >
        <Panel />
      </Suspense>
    </main>
  );
}

async function Panel() {
  await connection();
  const admin = await requireAdmin();
  const groups = await listGroups(admin.id);
  return (
    <TrendsPanel groups={groups.map((g) => ({ id: g.id, name: g.name }))} today={todayIso()} />
  );
}
