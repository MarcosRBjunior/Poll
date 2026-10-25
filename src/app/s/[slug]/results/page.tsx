import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache, Suspense } from "react";
import { ResultsSummary } from "@/components/results/results-summary";
import { firstTextPages } from "@/components/results/text-pages";
import { getPublicResults, getPublicTexts } from "@/features/results/service";
import { AppError } from "@/lib/errors";

// Uma busca por requisição, dividida entre o título da aba e a página.
const loadResults = cache(async (slug: string) => {
  try {
    return await getPublicResults(slug, {});
  } catch (error) {
    if (error instanceof AppError && error.code === "NOT_FOUND") return null;
    throw error;
  }
});

export async function generateMetadata({
  params,
}: PageProps<"/s/[slug]/results">): Promise<Metadata> {
  const results = await loadResults((await params).slug);
  return {
    title: results
      ? `Resultados: ${results.survey.title} — Poll`
      : "Pesquisa não encontrada — Poll",
  };
}

// T10: resultados públicos (RF-12, RF-14, RN-23). Sem tabela individual nem download.
export default function PublicResultsPage({ params }: PageProps<"/s/[slug]/results">) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-10">
      <Suspense
        fallback={<p className="text-zinc-600 dark:text-zinc-400">Carregando resultados…</p>}
      >
        <PublicResults params={params} />
      </Suspense>
    </main>
  );
}

async function PublicResults({ params }: Pick<PageProps<"/s/[slug]/results">, "params">) {
  const { slug } = await params;
  const results = await loadResults(slug);
  if (!results) notFound();
  const open = results.survey.status === "PUBLISHED";

  return (
    <>
      <header className="flex flex-col gap-2">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Resultados{open ? "" : " · pesquisa encerrada"}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight break-words">
          {results.survey.title}
        </h1>
        {open && (
          <Link href={`/s/${slug}`} className="self-start text-sm font-medium underline">
            Responder
          </Link>
        )}
      </header>
      <ResultsSummary
        results={results}
        texts={await firstTextPages(results, (questionId, q) =>
          getPublicTexts(slug, questionId, q),
        )}
        textsEndpoint={(questionId) =>
          `/api/v1/public/surveys/${encodeURIComponent(slug)}/questions/${questionId}/texts`
        }
        empty={<p>Ainda sem respostas.</p>}
      />
    </>
  );
}
