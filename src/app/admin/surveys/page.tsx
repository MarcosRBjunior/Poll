import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { SurveyList } from "@/components/surveys/survey-list";
import { listOwnGroups } from "@/features/surveys/service";
import { requireAdmin } from "@/lib/auth";

export const metadata: Metadata = { title: "Pesquisas — Poll" };

// T05: pesquisas do administrador (RF-08, RF-10, RF-11). A lista vem da API com os filtros.
export default function SurveysPage() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Pesquisas</h1>
        <Link
          href="/admin/surveys/new"
          className="rounded-md bg-zinc-900 px-4 py-2 font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          Nova pesquisa
        </Link>
      </div>
      <Suspense fallback={<p className="text-zinc-600 dark:text-zinc-400">Carregando…</p>}>
        <Surveys />
      </Suspense>
    </main>
  );
}

async function Surveys() {
  await connection();
  const admin = await requireAdmin();
  return <SurveyList groups={await listOwnGroups(admin.id)} />;
}
