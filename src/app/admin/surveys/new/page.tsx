import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { SurveyBuilder } from "@/components/builder/survey-builder";

export const metadata: Metadata = { title: "Nova pesquisa — Poll" };

// T06 (criação). A guarda de /admin já exigiu o papel ADMIN; a API confere de novo ao salvar.
export default function NewSurveyPage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-10">
      <Suspense fallback={<p className="text-zinc-600 dark:text-zinc-400">Carregando…</p>}>
        <NewSurvey />
      </Suspense>
    </main>
  );
}

// Fora do prerender: o formulário gera ids aleatórios (useFieldArray) ao renderizar.
async function NewSurvey() {
  await connection();
  return <SurveyBuilder />;
}
