import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { PeriodFilter } from "@/components/results/period-filter";
import { ResponsesTable } from "@/components/results/responses-table";
import { ResultsSummary } from "@/components/results/results-summary";
import { firstTextPages } from "@/components/results/text-pages";
import { periodSchema } from "@/features/results/schemas";
import { getAdminResults, getAdminTexts, getResponsesTable } from "@/features/results/service";
import { requireAdmin } from "@/lib/auth";
import { AppError } from "@/lib/errors";

export const metadata: Metadata = { title: "Resultados — Poll" };

const statusLabel = { DRAFT: "Rascunho", PUBLISHED: "Publicada", CLOSED: "Encerrada" } as const;

type Search = Record<string, string | string[] | undefined>;
const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

// T07: resultados completos (RF-12 a RF-15). A guarda de /admin já exigiu o papel ADMIN.
export default function AdminResultsPage(props: PageProps<"/admin/surveys/[id]/results">) {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-10">
      <Suspense
        fallback={<p className="text-zinc-600 dark:text-zinc-400">Carregando resultados…</p>}
      >
        <AdminResults {...props} />
      </Suspense>
    </main>
  );
}

async function AdminResults({ params, searchParams }: PageProps<"/admin/surveys/[id]/results">) {
  await connection(); // dados por requisição (sessão, "agora" da tabela): nada entra no prerender
  const [{ id }, search] = await Promise.all([params, searchParams as Promise<Search>]);
  const admin = await requireAdmin();
  const tab = one(search.tab) === "respostas" ? "respostas" : "resumo";

  const period = periodSchema.safeParse({
    from: one(search.from) || undefined,
    to: one(search.to) || undefined,
  });
  const query = period.success ? period.data : {};

  let results;
  try {
    results = await getAdminResults(admin.id, id, query);
  } catch (error) {
    if (error instanceof AppError && error.code === "NOT_FOUND") notFound();
    throw error;
  }

  const base = `/admin/surveys/${id}/results`;
  const publicPath = `/s/${results.survey.slug}`;
  const isPublic = results.survey.status !== "DRAFT";

  return (
    <>
      <header className="flex flex-col gap-2">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          <Link href="/admin" className="underline">
            Administração
          </Link>{" "}
          · {statusLabel[results.survey.status]}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight break-words">
          {results.survey.title}
        </h1>
        <div className="flex flex-wrap gap-4 text-sm">
          {isPublic && (
            <>
              <Link href={publicPath} className="underline">
                Abrir a pesquisa
              </Link>
              <Link href={`${publicPath}/results`} className="underline">
                Resultados públicos
              </Link>
            </>
          )}
          <Link href={`/admin/surveys/${id}/edit`} className="underline">
            Editar
          </Link>
          <a
            href={`/api/v1/surveys/${id}/export?format=csv`}
            download
            className="font-medium underline"
          >
            Baixar CSV
          </a>
        </div>
      </header>

      <nav
        aria-label="Vistas dos resultados"
        className="flex gap-4 border-b border-zinc-200 dark:border-zinc-800"
      >
        {(
          [
            ["resumo", "Resumo", base],
            ["respostas", "Respostas individuais", `${base}?tab=respostas`],
          ] as const
        ).map(([key, label, href]) => (
          <Link
            key={key}
            href={href}
            aria-current={tab === key ? "page" : undefined}
            className={`-mb-px border-b-2 px-1 pb-2 text-sm ${
              tab === key
                ? "border-zinc-900 font-medium dark:border-zinc-100"
                : "border-transparent"
            }`}
          >
            {label}
          </Link>
        ))}
      </nav>

      {tab === "resumo" ? (
        <>
          <PeriodFilter
            from={one(search.from)}
            to={one(search.to)}
            error={period.success ? undefined : period.error.issues[0]?.message}
          />
          <ResultsSummary
            results={results}
            texts={await firstTextPages(results, (questionId, q) =>
              getAdminTexts(admin.id, id, questionId, q),
            )}
            textsEndpoint={(questionId) => `/api/v1/surveys/${id}/questions/${questionId}/texts`}
            empty={
              query.from || query.to ? (
                <p>Nenhuma resposta neste período.</p>
              ) : (
                <p>
                  Ainda sem respostas.{" "}
                  {isPublic ? (
                    <>
                      Compartilhe o link da pesquisa:{" "}
                      <Link href={publicPath} className="underline break-all">
                        {publicPath}
                      </Link>
                    </>
                  ) : (
                    "Publique a pesquisa para receber respostas."
                  )}
                </p>
              )
            }
          />
        </>
      ) : (
        <ResponsesTab adminId={admin.id} surveyId={id} search={search} base={base} />
      )}
    </>
  );
}

async function ResponsesTab({
  adminId,
  surveyId,
  search,
  base,
}: {
  adminId: string;
  surveyId: string;
  search: Search;
  base: string;
}) {
  let table;
  try {
    table = await getResponsesTable(adminId, surveyId, {
      page: one(search.page),
      asOf: one(search.asOf),
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    // Página ou asOf inválidos na URL: volta para a primeira página.
    table = await getResponsesTable(adminId, surveyId, {});
  }
  if (table.total === 0) {
    return <p role="status">Ainda sem respostas.</p>;
  }
  const asOf = table.asOf.toISOString();
  return (
    <ResponsesTable
      table={table}
      pageHref={(page) => `${base}?tab=respostas&page=${page}&asOf=${encodeURIComponent(asOf)}`}
    />
  );
}
