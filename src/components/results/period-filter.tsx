type Props = { from?: string; to?: string; error?: string; hidden?: Record<string, string> };

/** Filtro de período (RF-12): formulário GET, funciona sem JavaScript. */
export function PeriodFilter({ from, to, error, hidden = {} }: Props) {
  const inputClass =
    "rounded-md border border-zinc-300 bg-transparent px-2 py-1 text-sm dark:border-zinc-700";
  return (
    <form method="get" className="flex flex-wrap items-end gap-3" aria-describedby="period-help">
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <label className="flex flex-col gap-1 text-sm">
        De
        <input type="date" name="from" defaultValue={from} className={inputClass} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Até
        <input type="date" name="to" defaultValue={to} className={inputClass} />
      </label>
      <button
        type="submit"
        className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
      >
        Filtrar
      </button>
      <p id="period-help" className="w-full text-xs text-zinc-600 dark:text-zinc-400">
        Dias no horário de Brasília.
      </p>
      {error && (
        <p role="alert" className="w-full text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
    </form>
  );
}
