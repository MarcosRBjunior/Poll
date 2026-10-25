"use client";

import { useState, type ReactNode } from "react";

type Props = { label: string; chart: ReactNode; table: ReactNode };

/**
 * Gráfico com a tabela equivalente (RF-14, critério 3). No modo gráfico a tabela continua
 * no DOM para leitores de tela e o canvas fica oculto para eles; o botão alterna a vista.
 */
export function ChartFigure({ label, chart, table }: Props) {
  const [view, setView] = useState<"chart" | "table">("chart");
  const showChart = view === "chart";

  return (
    <figure className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setView(showChart ? "table" : "chart")}
        className="self-end text-sm underline"
      >
        {showChart ? "Ver tabela" : "Ver gráfico"}
        <span className="sr-only">: {label}</span>
      </button>
      {showChart && <div aria-hidden="true">{chart}</div>}
      <div className={showChart ? "sr-only" : undefined}>{table}</div>
    </figure>
  );
}
