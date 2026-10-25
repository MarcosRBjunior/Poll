import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { SurveyBuilder } from "@/components/builder/survey-builder";
import { getSurveyDetail } from "@/features/surveys/service";
import { requireAdmin } from "@/lib/auth";
import { AppError } from "@/lib/errors";

export const metadata: Metadata = { title: "Editar pesquisa — Poll" };

// T06 (edição, RF-09).
export default function EditSurveyPage({ params }: PageProps<"/admin/surveys/[id]/edit">) {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-10">
      <Suspense fallback={<p className="text-zinc-600 dark:text-zinc-400">Carregando pesquisa…</p>}>
        <Editor params={params} />
      </Suspense>
    </main>
  );
}

async function Editor({ params }: Pick<PageProps<"/admin/surveys/[id]/edit">, "params">) {
  await connection(); // sempre a versão atual do banco (RN-17)
  const { id } = await params;
  const admin = await requireAdmin();
  let detail;
  try {
    detail = await getSurveyDetail(admin.id, id);
  } catch (error) {
    if (error instanceof AppError && error.code === "NOT_FOUND") notFound();
    throw error;
  }
  return <SurveyBuilder detail={detail} />;
}
