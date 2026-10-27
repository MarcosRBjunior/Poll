"use client";

import { useAtom } from "jotai";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CopyLinkButton } from "@/components/ui/copy-link-button";
import { formatDateTime, formatNumber } from "@/lib/format";
import {
  emptySurveyFilters,
  filtersToQuery,
  surveyFiltersAtom,
  type SurveyFilters,
} from "@/state/survey-filters";

type Status = "DRAFT" | "PUBLISHED" | "CLOSED";

type Row = {
  id: string;
  title: string;
  slug: string;
  status: Status;
  groupName: string | null;
  responseCount: number;
  lastResponseAt: string | null;
  updatedAt: string;
};

type ListPage = { data: Row[]; page: number; pageSize: number; total: number };

type ErrorBody = { error?: { code?: string; message?: string; details?: { message: string }[] } };

type Loaded = { key: string; page?: ListPage; failed?: boolean };

type Notice = { kind: "error" | "info"; text: string; details?: string[]; editId?: string } | null;

const statusLabel: Record<Status, string> = {
  DRAFT: "Rascunho",
  PUBLISHED: "Publicada",
  CLOSED: "Encerrada",
};

const actionLabel = { publish: "Publicar", close: "Encerrar", reopen: "Reabrir" } as const;
type Action = keyof typeof actionLabel;
const nextStatus: Record<Action, Status> = {
  publish: "PUBLISHED",
  close: "CLOSED",
  reopen: "PUBLISHED",
};
const actionsFor: Record<Status, Action[]> = {
  DRAFT: ["publish"],
  PUBLISHED: ["close"],
  CLOSED: ["reopen"],
};

const inputClass =
  "rounded-md border border-zinc-300 bg-transparent px-2 py-1.5 text-sm dark:border-zinc-700";
const buttonClass =
  "rounded-md border border-zinc-300 px-2 py-1 text-sm disabled:opacity-40 dark:border-zinc-700";

/** Lista de pesquisas do administrador (T05, RF-08, RF-10, RF-11). */
export function SurveyList({ groups }: { groups: { id: string; name: string }[] }) {
  const [filters, setFilters] = useAtom(surveyFiltersAtom);
  const [search, setSearch] = useState(filters.q);
  const [reload, setReload] = useState(0);
  const [loaded, setLoaded] = useState<Loaded>({ key: "" });
  const [optimistic, setOptimistic] = useState<Record<string, Status>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [deleting, setDeleting] = useState<Row | null>(null);

  const key = `${filtersToQuery(filters)}#${reload}`;
  const loading = loaded.key !== key;

  // Busca por título 300 ms depois da última tecla.
  useEffect(() => {
    if (search === filters.q) return;
    const timer = setTimeout(() => setFilters((f) => ({ ...f, q: search, page: 1 })), 300);
    return () => clearTimeout(timer);
  }, [search, filters.q, setFilters]);

  useEffect(() => {
    let ignore = false;
    void (async () => {
      try {
        const response = await fetch(`/api/v1/surveys?${key.split("#")[0]}`);
        if (!response.ok) throw new Error(String(response.status));
        const page = (await response.json()) as ListPage;
        if (!ignore) {
          setLoaded({ key, page });
          setOptimistic({});
        }
      } catch {
        if (!ignore) setLoaded({ key, failed: true });
      }
    })();
    return () => {
      ignore = true;
    };
  }, [key]);

  const update = (patch: Partial<SurveyFilters>) =>
    setFilters((f) => ({ ...f, ...patch, page: 1 }));
  const hasFilters = filters.status !== "" || filters.groupId !== "" || filters.q.trim() !== "";

  async function run(row: Row, action: Action) {
    setBusy(row.id);
    setNotice(null);
    setOptimistic((o) => ({ ...o, [row.id]: nextStatus[action] })); // mudança otimista
    const response = await fetch(`/api/v1/surveys/${row.id}/${action}`, { method: "POST" }).catch(
      () => null,
    );
    setBusy(null);
    if (response?.ok) {
      setNotice({
        kind: "info",
        text: `“${row.title}”: ${statusLabel[nextStatus[action]].toLowerCase()}.`,
      });
      setReload((n) => n + 1);
      return;
    }
    // Erro: desfaz a mudança otimista e explica (T05).
    setOptimistic(({ [row.id]: _undo, ...rest }) => (void _undo, rest));
    const error = ((await response?.json().catch(() => null)) as ErrorBody | null)?.error;
    setNotice({
      kind: "error",
      text: error?.message ?? `Não foi possível ${actionLabel[action].toLowerCase()} agora.`,
      details: error?.details?.map((d) => d.message),
      editId: error?.code === "NOT_PUBLISHABLE" ? row.id : undefined,
    });
  }

  async function confirmDelete(row: Row) {
    setBusy(row.id);
    const response = await fetch(`/api/v1/surveys/${row.id}`, { method: "DELETE" }).catch(
      () => null,
    );
    setBusy(null);
    setDeleting(null);
    if (response?.status === 204) {
      setNotice({ kind: "info", text: `“${row.title}” foi excluída.` });
      setReload((n) => n + 1);
    } else {
      setNotice({ kind: "error", text: "Não foi possível excluir agora. Tente de novo." });
    }
  }

  const page = loaded.key === key ? loaded.page : undefined;
  const pages = page ? Math.max(1, Math.ceil(page.total / page.pageSize)) : 1;

  return (
    <div className="flex flex-col gap-4">
      <form
        role="search"
        onSubmit={(e) => e.preventDefault()}
        className="flex flex-wrap items-end gap-3"
      >
        <label className="flex flex-col gap-1 text-sm">
          Buscar pelo título
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Status
          <select
            value={filters.status}
            onChange={(e) => update({ status: e.target.value as SurveyFilters["status"] })}
            className={inputClass}
          >
            <option value="">Todos</option>
            {Object.entries(statusLabel).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {groups.length > 0 && (
          <label className="flex flex-col gap-1 text-sm">
            Grupo
            <select
              value={filters.groupId}
              onChange={(e) => update({ groupId: e.target.value })}
              className={inputClass}
            >
              <option value="">Todos</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {hasFilters && (
          <button
            type="button"
            className={buttonClass}
            onClick={() => {
              setSearch("");
              setFilters(emptySurveyFilters);
            }}
          >
            Limpar filtros
          </button>
        )}
      </form>

      {notice && (
        <div
          role={notice.kind === "error" ? "alert" : "status"}
          className={`rounded-md p-3 text-sm ${
            notice.kind === "error"
              ? "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200"
              : "bg-zinc-100 dark:bg-zinc-900"
          }`}
        >
          <p>{notice.text}</p>
          {notice.details && notice.details.length > 0 && (
            <ul className="mt-1 list-disc pl-5">
              {notice.details.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          )}
          {notice.editId && (
            <Link
              href={`/admin/surveys/${notice.editId}/edit`}
              className="mt-1 inline-block underline"
            >
              Corrigir no construtor
            </Link>
          )}
        </div>
      )}

      {loading && !loaded.failed ? (
        <ul aria-label="Carregando pesquisas" className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <li key={i} className="h-24 animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-900" />
          ))}
        </ul>
      ) : loaded.failed && loaded.key === key ? (
        <div role="alert" className="flex flex-col items-start gap-2">
          <p>Não foi possível carregar as pesquisas.</p>
          <button type="button" className={buttonClass} onClick={() => setReload((n) => n + 1)}>
            Tentar de novo
          </button>
        </div>
      ) : page && page.total === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-md border border-dashed border-zinc-300 p-6 dark:border-zinc-700">
          {hasFilters ? (
            <p>Nenhuma pesquisa com esses filtros.</p>
          ) : (
            <>
              <p>Você ainda não criou nenhuma pesquisa.</p>
              <Link
                href="/admin/surveys/new"
                className="rounded-md bg-zinc-900 px-4 py-2 font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
              >
                Criar a primeira pesquisa
              </Link>
            </>
          )}
        </div>
      ) : page ? (
        <>
          <ul className="flex flex-col gap-3">
            {page.data.map((row) => {
              const status = optimistic[row.id] ?? row.status;
              return (
                <li key={row.id}>
                  <article
                    aria-labelledby={`survey-${row.id}`}
                    className="flex flex-col gap-3 rounded-md border border-zinc-200 p-4 dark:border-zinc-800"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <h2 id={`survey-${row.id}`} className="font-medium break-words">
                        {row.title}
                      </h2>
                      <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs font-medium dark:bg-zinc-800">
                        {statusLabel[status]}
                      </span>
                    </div>
                    <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-zinc-600 dark:text-zinc-400">
                      <div className="flex gap-1">
                        <dt>Respostas:</dt>
                        <dd className="tabular-nums">{formatNumber(row.responseCount)}</dd>
                      </div>
                      <div className="flex gap-1">
                        <dt>Última resposta:</dt>
                        <dd>
                          {row.lastResponseAt ? formatDateTime(new Date(row.lastResponseAt)) : "—"}
                        </dd>
                      </div>
                      {row.groupName && (
                        <div className="flex gap-1">
                          <dt>Grupo:</dt>
                          <dd>{row.groupName}</dd>
                        </div>
                      )}
                    </dl>
                    <div
                      className="flex flex-wrap items-center gap-2"
                      aria-label={`Ações de ${row.title}`}
                      role="group"
                    >
                      <Link href={`/admin/surveys/${row.id}/edit`} className={buttonClass}>
                        Editar
                      </Link>
                      <Link href={`/admin/surveys/${row.id}/results`} className={buttonClass}>
                        Resultados
                      </Link>
                      {actionsFor[row.status].map((action) => (
                        <button
                          key={action}
                          type="button"
                          className={buttonClass}
                          disabled={busy === row.id}
                          onClick={() => void run(row, action)}
                        >
                          {actionLabel[action]}
                        </button>
                      ))}
                      <button
                        type="button"
                        className={buttonClass}
                        disabled={busy === row.id}
                        onClick={() => setDeleting(row)}
                      >
                        Excluir
                      </button>
                      {status !== "DRAFT" && (
                        <CopyLinkButton path={`/s/${row.slug}`} className={buttonClass} />
                      )}
                    </div>
                  </article>
                </li>
              );
            })}
          </ul>
          {pages > 1 && (
            <nav aria-label="Páginas" className="flex items-center gap-3 text-sm">
              <button
                type="button"
                className={buttonClass}
                disabled={filters.page <= 1}
                onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}
              >
                ← Anterior
              </button>
              <span>
                Página {filters.page} de {pages}
              </span>
              <button
                type="button"
                className={buttonClass}
                disabled={filters.page >= pages}
                onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}
              >
                Próxima →
              </button>
            </nav>
          )}
        </>
      ) : null}

      {deleting && (
        <DeleteDialog
          row={deleting}
          busy={busy === deleting.id}
          onCancel={() => setDeleting(null)}
          onConfirm={() => void confirmDelete(deleting)}
        />
      )}
    </div>
  );
}

/** Diálogo de exclusão com o número de respostas (RF-10, critério 1). */
function DeleteDialog({
  row,
  busy,
  onCancel,
  onConfirm,
}: {
  row: Row;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => cancel.current?.focus(), []);
  const responses =
    row.responseCount === 0
      ? "Ela ainda não tem respostas."
      : `As ${formatNumber(row.responseCount)} resposta(s) deixarão de aparecer, e o link público e os resultados públicos param de funcionar.`;

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 p-4">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-title"
        aria-describedby="delete-text"
        onKeyDown={(e) => e.key === "Escape" && onCancel()}
        className="flex max-w-md flex-col gap-3 rounded-md bg-[var(--background)] p-5 shadow-lg"
      >
        <h2 id="delete-title" className="text-lg font-semibold break-words">
          Excluir “{row.title}”?
        </h2>
        <p id="delete-text" className="text-sm">
          {responses} Não dá para desfazer.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {busy ? "Excluindo…" : "Excluir"}
          </button>
          <button ref={cancel} type="button" onClick={onCancel} className={buttonClass}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
