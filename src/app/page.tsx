import Link from "next/link";
import { Suspense } from "react";
import { listPublicSurveys } from "@/features/surveys/service";
import { formatNumber } from "@/lib/format";

// T01: página inicial com as pesquisas abertas da vitrine (RF-20).
export default function Home({ searchParams }: PageProps<"/">) {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-4 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Pesquisas abertas</h1>
        <p className="text-zinc-700 dark:text-zinc-300">
          Responda por link e veja os resultados em gráficos.
        </p>
      </header>
      <Suspense fallback={<ShowcaseSkeleton />}>
        <Showcase searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

function ShowcaseSkeleton() {
  return (
    <ul aria-label="Carregando pesquisas" className="grid gap-4 sm:grid-cols-2">
      {[0, 1, 2, 3].map((i) => (
        <li key={i} className="h-40 animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-900" />
      ))}
    </ul>
  );
}

async function Showcase({ searchParams }: Pick<PageProps<"/">, "searchParams">) {
  const raw = (await searchParams).page;
  const requested = Number(Array.isArray(raw) ? raw[0] : raw);
  const page = Number.isInteger(requested) && requested > 1 ? requested : 1;
  const result = await listPublicSurveys({ page: String(page) });
  const pages = Math.max(1, Math.ceil(result.total / result.pageSize));

  if (result.total === 0) {
    return (
      <p className="rounded-md border border-dashed border-zinc-300 p-6 text-zinc-700 dark:border-zinc-700 dark:text-zinc-300">
        Nenhuma pesquisa aberta agora.
      </p>
    );
  }

  return (
    <>
      <ul className="grid gap-4 sm:grid-cols-2">
        {result.data.map((survey) => (
          <li key={survey.slug}>
            <article
              aria-labelledby={`survey-${survey.slug}`}
              className="flex h-full flex-col gap-3 rounded-md border border-zinc-200 p-4 dark:border-zinc-800"
            >
              <h2 id={`survey-${survey.slug}`} className="text-lg font-medium break-words">
                {survey.title}
              </h2>
              {survey.description && (
                <p className="line-clamp-3 text-sm whitespace-pre-line text-zinc-700 dark:text-zinc-300">
                  {survey.description}
                </p>
              )}
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                {formatNumber(survey.questionCount)}{" "}
                {survey.questionCount === 1 ? "pergunta" : "perguntas"}
              </p>
              <div className="mt-auto flex flex-wrap gap-3">
                <Link
                  href={`/s/${survey.slug}`}
                  className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
                >
                  Responder<span className="sr-only">: {survey.title}</span>
                </Link>
                <Link
                  href={`/s/${survey.slug}/results`}
                  className="rounded-md border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700"
                >
                  Ver resultados<span className="sr-only">: {survey.title}</span>
                </Link>
              </div>
            </article>
          </li>
        ))}
      </ul>
      {pages > 1 && (
        <nav aria-label="Páginas" className="flex items-center gap-4 text-sm">
          {page > 1 && <Link href={page === 2 ? "/" : `/?page=${page - 1}`}>← Anterior</Link>}
          <span>
            Página {page} de {pages}
          </span>
          {page < pages && <Link href={`/?page=${page + 1}`}>Próxima →</Link>}
        </nav>
      )}
    </>
  );
}
