"use client";

import { useAtom } from "jotai";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { ChartFigure } from "@/components/results/chart-figure";
import { OptionsBarChart, TrendLineChart } from "@/components/results/lazy-charts";
import { defaultPeriod } from "@/features/trends/periods";
import type { TrendBucket } from "@/features/trends/schemas";
import type { QuestionRanking, Trends } from "@/features/trends/service";
import { formatDay, formatNumber, formatPercent } from "@/lib/format";
import { trendsQueryAtom, trendsQueryString, type TrendsQuery } from "@/state/trends-query";

type Props = { groups: { id: string; name: string }[]; today: string };

type ErrorBody = { error?: { message?: string; details?: { message: string }[] } };
type Loaded = { key: string; data?: Trends; error?: string };
type Tracked = { questionId: string; optionId: string };

const inputClass =
  "rounded-md border border-zinc-300 bg-transparent px-2 py-1.5 text-sm dark:border-zinc-700";
const cardClass = "rounded-lg border border-zinc-200 p-4 dark:border-zinc-800";

const bucketNoun: Record<TrendBucket, string> = { week: "semana", month: "mês" };

/** "2026-10-05" → "05/10" (semana) ou "10/2026" (mês). */
function shortLabel(period: string, bucket: TrendBucket) {
  if (bucket === "month") return `${period.slice(5, 7)}/${period.slice(0, 4)}`;
  return formatDay(period, false);
}

/** "Semana de 05/10/2026" ou "Mês 10/2026". */
function longLabel(period: string, bucket: TrendBucket) {
  if (bucket === "month") return `Mês ${shortLabel(period, bucket)}`;
  return `Semana de ${formatDay(period)}`;
}

const responses = (n: number) => `${formatNumber(n)} ${n === 1 ? "resposta" : "respostas"}`;

/** Painel de tendências (T09, RF-17): um pedido à API alimenta todos os blocos. */
export function TrendsPanel({ groups, today }: Props) {
  const [stored, setQuery] = useAtom(trendsQueryAtom);
  const query: TrendsQuery = stored ?? { groupId: "", bucket: "week", ...defaultPeriod(today) };
  const [reload, setReload] = useState(0);
  const [loaded, setLoaded] = useState<Loaded>({ key: "" });
  const [tracked, setTracked] = useState<Tracked | null>(null);

  const search = trendsQueryString(query);
  const key = `${search}#${reload}`;
  const loading = loaded.key !== key;

  useEffect(() => {
    let ignore = false;
    void (async () => {
      let result: Loaded;
      try {
        const response = await fetch(`/api/v1/trends?${search}`);
        if (response.ok) {
          result = { key, data: (await response.json()) as Trends };
        } else {
          const body = (await response.json().catch(() => null)) as ErrorBody | null;
          result = {
            key,
            error: body?.error?.details?.[0]?.message ?? "Não foi possível carregar o painel.",
          };
        }
      } catch {
        result = { key, error: "Não foi possível carregar o painel." };
      }
      if (!ignore) setLoaded(result);
    })();
    return () => {
      ignore = true;
    };
  }, [key, search]);

  const update = (patch: Partial<TrendsQuery>) => setQuery({ ...query, ...patch });
  const data = loading ? undefined : loaded.data;

  return (
    <div className="flex flex-col gap-6">
      <form
        aria-label="Filtros do painel"
        onSubmit={(e) => e.preventDefault()}
        className="flex flex-wrap items-end gap-3"
      >
        <label className="flex flex-col gap-1 text-sm">
          Grupo
          <select
            value={query.groupId}
            onChange={(e) => update({ groupId: e.target.value })}
            className={inputClass}
          >
            <option value="">Todas as pesquisas</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          De
          <input
            type="date"
            value={query.from}
            // Campo apagado não muda o filtro: sem data, a API voltaria ao padrão sem avisar.
            onChange={(e) => e.target.value && update({ from: e.target.value })}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Até
          <input
            type="date"
            value={query.to}
            onChange={(e) => e.target.value && update({ to: e.target.value })}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Agrupar por
          <select
            value={query.bucket}
            onChange={(e) => update({ bucket: e.target.value as TrendBucket })}
            className={inputClass}
          >
            <option value="week">Semana</option>
            <option value="month">Mês</option>
          </select>
        </label>
        <p className="w-full text-xs text-zinc-600 dark:text-zinc-400">
          Dias no horário de Brasília; a semana começa na segunda-feira. Entram as pesquisas
          publicadas e encerradas.
        </p>
      </form>

      {loading ? (
        <PanelSkeleton />
      ) : loaded.error ? (
        <div role="alert" className={`${cardClass} flex flex-col items-start gap-3`}>
          <p>{loaded.error}</p>
          <button
            type="button"
            onClick={() => setReload((n) => n + 1)}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700"
          >
            Tentar de novo
          </button>
        </div>
      ) : data && data.summary.responses === 0 ? (
        <div className={`${cardClass} text-center`}>
          <p className="font-medium">Sem respostas neste período</p>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Escolha outro grupo ou aumente o período.
          </p>
        </div>
      ) : data ? (
        <Blocks data={data} tracked={tracked} onTrack={setTracked} />
      ) : null}
    </div>
  );
}

function Blocks({
  data,
  tracked,
  onTrack,
}: {
  data: Trends;
  tracked: Tracked | null;
  onTrack: (t: Tracked) => void;
}) {
  const { bucket } = data.query;
  const noun = bucketNoun[bucket];
  const busiest = data.summary.busiestPeriod;
  const totals = data.periods.map((_, i) =>
    data.participation.reduce((sum, s) => sum + s.points[i]!.count, 0),
  );

  return (
    <>
      <dl className="grid gap-3 sm:grid-cols-3">
        <Stat label="Respostas no período" value={formatNumber(data.summary.responses)} />
        <Stat
          label="Pesquisas com respostas"
          value={formatNumber(data.summary.surveysWithResponses)}
        />
        <Stat
          label={bucket === "week" ? "Semana mais movimentada" : "Mês mais movimentado"}
          value={busiest ? longLabel(busiest.period, bucket) : "—"}
          hint={busiest ? responses(busiest.count) : undefined}
        />
      </dl>

      <Section
        title="Participação"
        explanation={`Quantas respostas as pesquisas receberam em cada ${noun}. Cada envio conta uma vez, na data em que foi feito.`}
      >
        <ChartFigure
          label="respostas por período"
          chart={
            <TrendLineChart
              kind="count"
              labels={data.periods.map((p) => shortLabel(p, bucket))}
              titles={data.periods.map((p) => longLabel(p, bucket))}
              values={totals}
            />
          }
          table={
            <table className="w-full text-sm">
              <caption className="sr-only">Respostas por período</caption>
              <thead>
                <tr>
                  <th scope="col" className="text-left">
                    Período
                  </th>
                  <th scope="col" className="text-right">
                    Respostas
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.periods.map((p, i) => (
                  <tr key={p}>
                    <th scope="row" className="text-left font-normal">
                      {longLabel(p, bucket)}
                    </th>
                    <td className="text-right">{formatNumber(totals[i]!)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          }
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="mb-2 text-left font-medium">Respostas por pesquisa</caption>
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-800">
                <th scope="col" className="py-1 pr-3 text-left">
                  Pesquisa
                </th>
                {data.periods.map((p) => (
                  <th
                    key={p}
                    scope="col"
                    className="px-2 py-1 text-right font-normal whitespace-nowrap"
                  >
                    <abbr title={longLabel(p, bucket)} className="no-underline">
                      {shortLabel(p, bucket)}
                    </abbr>
                  </th>
                ))}
                <th scope="col" className="py-1 pl-2 text-right">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {data.participation.map((s) => (
                <tr key={s.surveyId} className="border-b border-zinc-100 dark:border-zinc-900">
                  <th scope="row" className="py-1 pr-3 text-left font-normal">
                    <Link href={`/admin/surveys/${s.surveyId}/results`} className="underline">
                      {s.title}
                    </Link>
                  </th>
                  {s.points.map((point) => (
                    <td key={point.period} className="px-2 py-1 text-right tabular-nums">
                      {formatNumber(point.count)}
                    </td>
                  ))}
                  <td className="py-1 pl-2 text-right font-medium tabular-nums">
                    {formatNumber(s.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        title="Opções mais escolhidas"
        explanation="Em cada pergunta de escolha, quantas vezes cada opção foi marcada no período. Percentual = escolhas da opção ÷ pessoas que responderam a pergunta; em múltipla escolha a soma pode passar de 100%. Opções removidas não aparecem."
      >
        <ul className="flex flex-col gap-4">
          {data.topOptions.map((q) => (
            <li key={q.questionId} className={cardClass}>
              <Ranking question={q} />
            </li>
          ))}
        </ul>
      </Section>

      <Evolution data={data} tracked={tracked} onTrack={onTrack} noun={noun} />
    </>
  );
}

function Ranking({ question }: { question: QuestionRanking }) {
  const title = `${question.surveyTitle} — ${question.title}`;
  return (
    <div className="flex flex-col gap-2">
      <h3 className="font-medium">{title}</h3>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {responses(question.answeredCount)}
        {question.type === "MULTIPLE_CHOICE" ? " · múltipla escolha" : ""}
      </p>
      <ChartFigure
        label={title}
        chart={
          <OptionsBarChart
            options={question.options.map((o) => ({
              id: o.optionId,
              label: o.label,
              archived: false,
              count: o.count,
              percent: o.percent,
            }))}
          />
        }
        table={
          <table className="w-full text-sm">
            <caption className="sr-only">{title}</caption>
            <thead>
              <tr>
                <th scope="col" className="text-left">
                  Opção
                </th>
                <th scope="col" className="text-right">
                  Escolhas
                </th>
                <th scope="col" className="text-right">
                  Percentual
                </th>
              </tr>
            </thead>
            <tbody>
              {question.options.map((o) => (
                <tr key={o.optionId}>
                  <th scope="row" className="text-left font-normal">
                    {o.label}
                  </th>
                  <td className="text-right">{formatNumber(o.count)}</td>
                  <td className="text-right">{formatPercent(o.percent)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        }
      />
    </div>
  );
}

/** Evolução do percentual de uma opção; padrão: 1ª opção da 1ª pergunta de escolha. */
function Evolution({
  data,
  tracked,
  onTrack,
  noun,
}: {
  data: Trends;
  tracked: Tracked | null;
  onTrack: (t: Tracked) => void;
  noun: string;
}) {
  const { bucket } = data.query;
  const first = data.optionTrends[0];
  const isTracked = data.optionTrends.some(
    (o) => o.questionId === tracked?.questionId && o.optionId === tracked.optionId,
  );
  // A opção escolhida pode sumir ao trocar o filtro: volta ao padrão.
  const current = isTracked
    ? tracked
    : first && { questionId: first.questionId, optionId: first.optionId };
  if (!current) return null;

  const question = data.topOptions.find((q) => q.questionId === current.questionId)!;
  const label = (optionId: string) => question.options.find((o) => o.optionId === optionId)!.label;
  const optionsOf = data.optionTrends.filter((o) => o.questionId === current.questionId);
  const trend = optionsOf.find((o) => o.optionId === current.optionId)!;
  const title = `${label(current.optionId)} em “${question.title}”`;

  return (
    <Section
      title="Evolução de uma opção"
      explanation={`Percentual da opção em cada ${noun}: escolhas da opção ÷ pessoas que responderam a pergunta naquele período. Período em que ninguém respondeu a pergunta fica sem ponto.`}
    >
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex max-w-full min-w-0 flex-col gap-1 text-sm">
          Pergunta
          <select
            value={current.questionId}
            onChange={(e) => {
              const next = data.optionTrends.find((o) => o.questionId === e.target.value)!;
              onTrack({ questionId: next.questionId, optionId: next.optionId });
            }}
            className={`${inputClass} max-w-full`}
          >
            {data.topOptions.map((q) => (
              <option key={q.questionId} value={q.questionId}>
                {q.surveyTitle} — {q.title}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Opção acompanhada
          <select
            value={current.optionId}
            onChange={(e) => onTrack({ questionId: current.questionId, optionId: e.target.value })}
            className={inputClass}
          >
            {optionsOf.map((o) => (
              <option key={o.optionId} value={o.optionId}>
                {label(o.optionId)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <ChartFigure
        label={`evolução de ${title}`}
        chart={
          <TrendLineChart
            kind="percent"
            labels={trend.points.map((p) => shortLabel(p.period, bucket))}
            titles={trend.points.map((p) => longLabel(p.period, bucket))}
            values={trend.points.map((p) => p.percent)}
            describe={(i) => pointText(trend.points[i]!)}
          />
        }
        table={
          <table className="w-full text-sm">
            <caption className="sr-only">Evolução de {title}</caption>
            <thead>
              <tr>
                <th scope="col" className="text-left">
                  Período
                </th>
                <th scope="col" className="text-right">
                  Percentual
                </th>
                <th scope="col" className="text-right">
                  Escolhas / respostas
                </th>
              </tr>
            </thead>
            <tbody>
              {trend.points.map((p) => (
                <tr key={p.period}>
                  <th scope="row" className="text-left font-normal">
                    {longLabel(p.period, bucket)}
                  </th>
                  <td className="text-right">
                    {p.percent === null ? "—" : formatPercent(p.percent)}
                  </td>
                  <td className="text-right">
                    {formatNumber(p.count)} / {formatNumber(p.answeredCount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        }
      />
    </Section>
  );
}

function pointText(p: Trends["optionTrends"][number]["points"][number]) {
  if (p.percent === null) return "Sem respostas à pergunta";
  return `${formatPercent(p.percent)} (${formatNumber(p.count)} de ${responses(p.answeredCount)})`;
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className={cardClass}>
      <dt className="text-sm text-zinc-600 dark:text-zinc-400">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tabular-nums">{value}</dd>
      {hint && <dd className="text-sm text-zinc-600 dark:text-zinc-400">{hint}</dd>}
    </div>
  );
}

function Section({
  title,
  explanation,
  children,
}: {
  title: string;
  explanation: string;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        <span className="font-medium">Como é calculado:</span> {explanation}
      </p>
      {children}
    </section>
  );
}

function PanelSkeleton() {
  return (
    <div aria-busy="true" aria-label="Carregando o painel" className="flex flex-col gap-6">
      <div className="grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-900" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-900" />
      <div className="h-48 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-900" />
    </div>
  );
}
