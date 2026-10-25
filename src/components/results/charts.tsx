"use client";

import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
  type ChartOptions,
} from "chart.js";
import { useSyncExternalStore } from "react";
import { Bar, Line } from "react-chartjs-2";
import type { OptionResult, SurveyResults } from "@/features/results/service";
import { formatDay, formatNumber, formatPercent } from "@/lib/format";

// Carregado só no navegador, via lazy-charts.tsx (RF-14, critério 1).
ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Tooltip);

const darkQuery = "(prefers-color-scheme: dark)";

function subscribeToScheme(onChange: () => void) {
  const media = window.matchMedia(darkQuery);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function readColors(scheme: "dark" | "light") {
  const style = getComputedStyle(document.documentElement);
  const read = (name: string) => style.getPropertyValue(name).trim();
  return {
    scheme,
    series: read("--chart-series"),
    grid: read("--chart-grid"),
    text: read("--chart-text"),
  };
}

/** Cores dos tokens --chart-* de globals.css, relidas quando o tema do sistema muda. */
function useChartColors() {
  const scheme = useSyncExternalStore(
    subscribeToScheme,
    () => (window.matchMedia(darkQuery).matches ? "dark" : "light"),
    () => "light" as const,
  );
  return readColors(scheme); // depende do tema: o React Compiler recalcula quando ele muda
}

const answers = (n: number) => `${formatNumber(n)} ${n === 1 ? "resposta" : "respostas"}`;

const shorten = (text: string, max = 28) =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;

/** Barras horizontais por opção, com contagem e percentual no rótulo e no tooltip. */
export function OptionsBarChart({ options }: { options: OptionResult[] }) {
  const colors = useChartColors();
  const fullLabel = (o: OptionResult) => (o.archived ? `${o.label} (removida)` : o.label);

  const chartOptions: ChartOptions<"bar"> = {
    indexAxis: "y",
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          title: (items) => fullLabel(options[items[0]!.dataIndex]!),
          label: (item) => {
            const o = options[item.dataIndex]!;
            return `${answers(o.count)} (${formatPercent(o.percent)})`;
          },
        },
      },
    },
    scales: {
      x: {
        beginAtZero: true,
        ticks: { precision: 0, color: colors.text },
        grid: { color: colors.grid },
        border: { display: false },
      },
      y: { ticks: { color: colors.text }, grid: { display: false } },
    },
  };

  return (
    <div style={{ height: options.length * 36 + 36 }}>
      <Bar
        options={chartOptions}
        data={{
          labels: options.map(
            (o) =>
              `${shorten(fullLabel(o))} · ${formatNumber(o.count)} (${formatPercent(o.percent)})`,
          ),
          datasets: [
            {
              data: options.map((o) => o.count),
              backgroundColor: colors.series,
              borderRadius: 4,
              borderSkipped: "start",
              maxBarThickness: 20,
            },
          ],
        }}
      />
    </div>
  );
}

/** Linha de respostas por dia, com tooltip pelo dia mais próximo do cursor. */
export function PerDayLineChart({ perDay }: { perDay: SurveyResults["perDay"] }) {
  const colors = useChartColors();

  const chartOptions: ChartOptions<"line"> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          title: (items) => formatDay(perDay[items[0]!.dataIndex]!.date),
          label: (item) => answers(perDay[item.dataIndex]!.count),
        },
      },
    },
    scales: {
      x: {
        ticks: { color: colors.text, maxRotation: 0, autoSkip: true },
        grid: { display: false },
      },
      y: {
        beginAtZero: true,
        ticks: { precision: 0, color: colors.text },
        grid: { color: colors.grid },
        border: { display: false },
      },
    },
  };

  return (
    <div className="h-56">
      <Line
        options={chartOptions}
        data={{
          labels: perDay.map((d) => formatDay(d.date, false)),
          datasets: [
            {
              data: perDay.map((d) => d.count),
              borderColor: colors.series,
              backgroundColor: colors.series,
              borderWidth: 2,
              pointRadius: perDay.length <= 31 ? 4 : 0,
              pointHoverRadius: 6,
            },
          ],
        }}
      />
    </div>
  );
}
