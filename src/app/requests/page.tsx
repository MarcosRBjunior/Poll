import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { requestStatusLabel } from "@/features/requests/schemas";
import { listMyRequests } from "@/features/requests/service";
import { requireUserOrLogin } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Minhas solicitações — Poll" };

const newRequestClass =
  "self-start rounded-md bg-zinc-900 px-4 py-2 font-medium text-white dark:bg-zinc-100 dark:text-zinc-900";

// T12: minhas solicitações (RF-21), só as próprias.
export default function MyRequestsPage({ searchParams }: PageProps<"/requests">) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Minhas solicitações</h1>
      <Suspense fallback={<p className="text-zinc-600 dark:text-zinc-400">Carregando…</p>}>
        <MyRequests searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function MyRequests({ searchParams }: Pick<PageProps<"/requests">, "searchParams">) {
  await connection();
  const user = await requireUserOrLogin("/requests");
  const sent = (await searchParams).enviada === "1";
  const { data, total } = await listMyRequests(user.id, { pageSize: "100" });

  return (
    <>
      {sent && (
        <p role="status" className="rounded-md bg-zinc-100 p-3 text-sm dark:bg-zinc-900">
          Solicitação enviada. O administrador vai analisar o pedido.
        </p>
      )}
      {total === 0 ? (
        <div className="flex flex-col gap-3 rounded-md border border-dashed border-zinc-300 p-6 dark:border-zinc-700">
          <p>Você ainda não pediu nenhuma pesquisa.</p>
          <Link href="/requests/new" className={newRequestClass}>
            Pedir uma pesquisa
          </Link>
        </div>
      ) : (
        <>
          <Link href="/requests/new" className={newRequestClass}>
            Pedir outra pesquisa
          </Link>
          <ul className="flex flex-col gap-3">
            {data.map((r) => (
              <li key={r.id}>
                <article
                  aria-labelledby={`request-${r.id}`}
                  className="flex flex-col gap-2 rounded-md border border-zinc-200 p-4 dark:border-zinc-800"
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
                    Enviada em {formatDateTime(r.createdAt)}
                  </p>
                  {r.adminNote && (
                    <p className="text-sm whitespace-pre-line break-words">
                      <strong>Nota do administrador:</strong> {r.adminNote}
                    </p>
                  )}
                  {r.surveyPath && (
                    <Link href={r.surveyPath} className="self-start text-sm font-medium underline">
                      Abrir a pesquisa
                    </Link>
                  )}
                </article>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
