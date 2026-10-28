import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { SurveyBuilder } from "@/components/builder/survey-builder";
import { getRequestForAdmin } from "@/features/requests/service";
import { requireAdmin } from "@/lib/auth";
import { AppError } from "@/lib/errors";

export const metadata: Metadata = { title: "Nova pesquisa — Poll" };

// T06 (criação). Com `?request=`, abre preenchido a partir da solicitação (RF-22).
export default function NewSurveyPage({ searchParams }: PageProps<"/admin/surveys/new">) {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-10">
      <Suspense fallback={<p className="text-zinc-600 dark:text-zinc-400">Carregando…</p>}>
        <NewSurvey searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

// Fora do prerender: o formulário gera ids aleatórios (useFieldArray) ao renderizar.
async function NewSurvey({ searchParams }: Pick<PageProps<"/admin/surveys/new">, "searchParams">) {
  await connection();
  await requireAdmin();
  const raw = (await searchParams).request;
  const requestId = Array.isArray(raw) ? raw[0] : raw;
  if (!requestId) return <SurveyBuilder />;

  const request = await getRequestForAdmin(requestId).catch((error: unknown) => {
    if (error instanceof AppError && error.code === "NOT_FOUND") return null; // abre em branco
    throw error;
  });
  if (!request) return <SurveyBuilder />;
  return (
    <SurveyBuilder
      fromRequest={{
        id: request.id,
        topic: request.topic,
        goal: request.goal,
        suggestedQuestions: request.suggestedQuestions,
        audience: request.audience,
      }}
    />
  );
}
