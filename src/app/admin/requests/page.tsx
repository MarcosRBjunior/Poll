import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { RequestActions } from "@/components/requests/request-actions";
import {
  requestStatuses,
  requestStatusLabel,
  type RequestStatus,
} from "@/features/requests/schemas";
import { listRequestQueue } from "@/features/requests/service";
import { requireAdmin } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Solicitações — Poll" };

// T13: fila de solicitações (RF-22). Abre nas pendentes, das mais antigas para as mais novas.
export default function RequestQueuePage({ searchParams }: PageProps<"/admin/requests">) {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Solicitações</h1>
      <Suspense fallback={<p className="text-zinc-600 dark:text-zinc-400">Carregando…</p>}>
        <Queue searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Queue({ searchParams }: Pick<PageProps<"/admin/requests">, "searchParams">) {
  await connection();
  await requireAdmin();
  const raw = (await searchParams).status;
  const value = Array.isArray(raw) ? raw[0] : raw;
  const status: RequestStatus | "" =
    value === "todas" ? "" : (requestStatuses.find((s) => s === value) ?? "PENDING");
  const { data, total } = await listRequestQueue({ status, pageSize: "100" });

  const filters: [string, string][] = [
    ...requestStatuses.map((s) => [s, requestStatusLabel[s]] as [string, string]),
    ["todas", "Todas"],
  ];

  return (
    <>
      <nav aria-label="Filtrar por status" className="flex flex-wrap gap-2 text-sm">
        {filters.map(([key, label]) => {
          const active = (status || "todas") === key;
          return (
            <Link
              key={key}
              href={key === "PENDING" ? "/admin/requests" : `/admin/requests?status=${key}`}
              aria-current={active ? "page" : undefined}
              className={`rounded-md border px-3 py-1 ${
                active
                  ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                  : "border-zinc-300 dark:border-zinc-700"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </nav>

      {total === 0 ? (
        <p className="rounded-md border border-dashed border-zinc-300 p-6 dark:border-zinc-700">
          {status === "PENDING"
            ? "Nenhuma solicitação pendente."
            : "Nenhuma solicitação neste filtro."}
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {data.map((r) => (
            <li key={r.id}>
              <article
                aria-labelledby={`request-${r.id}`}
                className="flex flex-col gap-3 rounded-md border border-zinc-200 p-4 dark:border-zinc-800"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h2 id={`request-${r.id}`} className="font-medium break-words">
                    {r.topic}
                  </h2>
                  <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs font-medium dark:bg-zinc-800">
                    {requestStatusLabel[r.status]}
                  </span>
                </div>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  {r.requester.name ?? r.requester.email} ({r.requester.email}) ·{" "}
                  {formatDateTime(r.createdAt)}
                </p>
                <dl className="flex flex-col gap-2 text-sm">
                  <div>
                    <dt className="font-medium">Objetivo</dt>
                    <dd className="whitespace-pre-line break-words">{r.goal}</dd>
                  </div>
                  {r.suggestedQuestions && (
                    <div>
                      <dt className="font-medium">Sugestões de perguntas</dt>
                      <dd className="whitespace-pre-line break-words">{r.suggestedQuestions}</dd>
                    </div>
                  )}
                  {r.audience && (
                    <div>
                      <dt className="font-medium">Público-alvo</dt>
                      <dd className="break-words">{r.audience}</dd>
                    </div>
                  )}
                  {r.surveyId && (
                    <div>
                      <dt className="font-medium">Pesquisa</dt>
                      <dd>
                        <Link href={`/admin/surveys/${r.surveyId}/edit`} className="underline">
                          Abrir no construtor
                        </Link>
                      </dd>
                    </div>
                  )}
                </dl>
                <RequestActions
                  key={`${r.status}-${r.adminNote ?? ""}`}
                  id={r.id}
                  status={r.status}
                  adminNote={r.adminNote}
                  hasSurvey={r.surveyId !== null}
                />
              </article>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
