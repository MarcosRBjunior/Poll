import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

export const metadata: Metadata = { title: "Obrigado — Poll" };

// T03: agradecimento, com o caminho para os resultados públicos (T10).
export default function ThanksPage({ params }: PageProps<"/s/[slug]/thanks">) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-4 px-4 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Obrigado!</h1>
      <p className="text-zinc-700 dark:text-zinc-300">Suas respostas foram registradas.</p>
      <div className="flex flex-wrap gap-4">
        <Suspense>
          <ResultsLink params={params} />
        </Suspense>
        <Link href="/" className="underline">
          Voltar para o início
        </Link>
      </div>
    </main>
  );
}

// O slug vem da URL: só este link espera por ele, o resto da página é estático.
async function ResultsLink({ params }: Pick<PageProps<"/s/[slug]/thanks">, "params">) {
  const { slug } = await params;
  return (
    <Link href={`/s/${slug}/results`} className="font-medium underline">
      Ver resultados
    </Link>
  );
}
