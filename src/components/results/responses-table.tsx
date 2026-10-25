import Link from "next/link";
import type { ResponsesTable as Table } from "@/features/results/service";
import { formatDateTime, formatNumber } from "@/lib/format";

const TRUNCATE_AT = 80;

type Props = { table: Table; pageHref: (page: number) => string };

/** Tabela de respostas individuais (RF-13). Só em T07: nunca na versão pública (RN-23). */
export function ResponsesTable({ table, pageHref }: Props) {
  const pages = Math.max(1, Math.ceil(table.total / table.pageSize));
  const cell = "border-b border-zinc-200 px-2 py-2 align-top dark:border-zinc-800";

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <caption className="sr-only">
            Respostas individuais, da mais recente para a mais antiga
          </caption>
          <thead>
            <tr>
              <th scope="col" className={`${cell} whitespace-nowrap`}>
                Enviada em
              </th>
              {table.columns.map((c) => (
                <th key={c.questionId} scope="col" className={`${cell} min-w-40`}>
                  {c.title}
                  {c.archived && " (removida)"}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.data.map((row) => (
              <tr key={row.id}>
                <th scope="row" className={`${cell} font-normal whitespace-nowrap tabular-nums`}>
                  {formatDateTime(row.submittedAt)}
                </th>
                {table.columns.map((c) => (
                  <td key={c.questionId} className={`${cell} break-words`}>
                    <CellText text={row.cells[c.questionId] ?? ""} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <nav aria-label="Páginas da tabela" className="flex items-center gap-4 text-sm">
        {table.page > 1 ? <Link href={pageHref(table.page - 1)}>← Anterior</Link> : null}
        <span>
          Página {table.page} de {pages} · {formatNumber(table.total)} respostas
        </span>
        {table.page < pages ? <Link href={pageHref(table.page + 1)}>Próxima →</Link> : null}
      </nav>
    </div>
  );
}

/** Texto longo aparece truncado, com opção de expandir (RF-13, critério 3). */
function CellText({ text }: { text: string }) {
  if (text.length <= TRUNCATE_AT) return <span className="whitespace-pre-line">{text}</span>;
  return (
    <details>
      <summary className="cursor-pointer">
        {text.slice(0, TRUNCATE_AT).trimEnd()}… <span className="underline">ver tudo</span>
      </summary>
      <p className="mt-1 whitespace-pre-line">{text}</p>
    </details>
  );
}
