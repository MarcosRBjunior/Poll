import type { QuestionResult, SurveyResults } from "@/features/results/service";
import { formatDateTime, formatDay, formatNumber, formatPercent } from "@/lib/format";
import { ChartFigure } from "./chart-figure";
import { OptionsBarChart, PerDayLineChart } from "./lazy-charts";
import { TextAnswers, type TextPage } from "./text-answers";

type Props = {
  results: SurveyResults;
  /** Primeira página dos textos de cada pergunta de texto com respostas. */
  texts: Record<string, TextPage>;
  /** Rota `texts` de cada pergunta (pública ou do administrador). */
  textsEndpoint: (questionId: string) => string;
  /** Estado vazio: o que mostrar quando não há respostas (RF-12, critério 3). */
  empty: React.ReactNode;
};

const tableClass = "w-full text-left text-sm";
const cellClass = "border-b border-zinc-200 py-1.5 pr-3 dark:border-zinc-800";

/** Cartões gerais e um bloco por pergunta. Usado em T07 e T10; não mostra quem respondeu. */
export function ResultsSummary({ results, texts, textsEndpoint, empty }: Props) {
  const { totals, perDay, questions } = results;

  return (
    <div className="flex flex-col gap-8">
      <dl className="grid gap-3 sm:grid-cols-3">
        <Stat label="Respostas" value={formatNumber(totals.responses)} />
        <Stat
          label="Primeira resposta"
          value={totals.firstAt ? formatDateTime(totals.firstAt) : "—"}
        />
        <Stat label="Última resposta" value={totals.lastAt ? formatDateTime(totals.lastAt) : "—"} />
      </dl>

      {totals.responses === 0 ? (
        <div role="status" className="rounded-md border border-zinc-300 p-4 dark:border-zinc-700">
          {empty}
        </div>
      ) : (
        <>
          <section className="flex flex-col gap-3" aria-labelledby="per-day">
            <h2 id="per-day" className="text-lg font-semibold">
              Respostas por dia
            </h2>
            <ChartFigure
              label="Respostas por dia"
              chart={<PerDayLineChart perDay={perDay} />}
              table={
                <table className={tableClass}>
                  <caption className="sr-only">Respostas por dia</caption>
                  <thead>
                    <tr>
                      <th className={cellClass}>Dia</th>
                      <th className={cellClass}>Respostas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {perDay.map((d) => (
                      <tr key={d.date}>
                        <td className={cellClass}>{formatDay(d.date)}</td>
                        <td className={cellClass}>{formatNumber(d.count)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              }
            />
          </section>

          <section className="flex flex-col gap-4" aria-labelledby="questions">
            <h2 id="questions" className="text-lg font-semibold">
              Perguntas
            </h2>
            {questions.map((q) => (
              <QuestionCard
                key={q.id}
                question={q}
                texts={texts[q.id]}
                textsEndpoint={textsEndpoint(q.id)}
              />
            ))}
          </section>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-zinc-200 p-4 dark:border-zinc-800">
      <dt className="text-sm text-zinc-600 dark:text-zinc-400">{label}</dt>
      <dd className="mt-1 text-xl font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function QuestionCard({
  question: q,
  texts,
  textsEndpoint,
}: {
  question: QuestionResult;
  texts: TextPage | undefined;
  textsEndpoint: string;
}) {
  const answered = `${formatNumber(q.answeredCount)} ${q.answeredCount === 1 ? "pessoa respondeu" : "pessoas responderam"}`;

  return (
    <article className="flex flex-col gap-3 rounded-md border border-zinc-200 p-4 dark:border-zinc-800">
      <header className="flex flex-col gap-1">
        <h3 className="font-medium break-words">
          {q.title}
          {q.archived && (
            <span className="ml-2 rounded bg-zinc-200 px-1.5 py-0.5 text-xs font-normal text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              removida
            </span>
          )}
        </h3>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{answered}</p>
      </header>

      {q.textCount === null ? (
        <>
          {q.type === "MULTIPLE_CHOICE" && (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Cada pessoa pode marcar mais de uma opção, então os percentuais podem somar mais de
              100%.
            </p>
          )}
          {q.numeric && (
            <p className="text-sm">
              Média <strong className="tabular-nums">{formatNumber(q.numeric.mean)}</strong> ·
              Mediana <strong className="tabular-nums">{formatNumber(q.numeric.median)}</strong>
            </p>
          )}
          <ChartFigure
            label={q.title}
            chart={<OptionsBarChart options={q.options} />}
            table={
              <table className={tableClass}>
                <caption className="sr-only">{q.title}</caption>
                <thead>
                  <tr>
                    <th className={cellClass}>Opção</th>
                    <th className={cellClass}>Respostas</th>
                    <th className={cellClass}>Percentual</th>
                  </tr>
                </thead>
                <tbody>
                  {q.options.map((o) => (
                    <tr key={o.id}>
                      <td className={`${cellClass} break-words`}>
                        {o.label}
                        {o.archived && " (removida)"}
                      </td>
                      <td className={`${cellClass} tabular-nums`}>{formatNumber(o.count)}</td>
                      <td className={`${cellClass} tabular-nums`}>{formatPercent(o.percent)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            }
          />
        </>
      ) : texts && texts.total > 0 ? (
        <TextAnswers endpoint={textsEndpoint} initial={texts} />
      ) : (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Nenhuma resposta de texto.</p>
      )}
    </article>
  );
}
