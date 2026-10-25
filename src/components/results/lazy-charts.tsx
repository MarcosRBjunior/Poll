"use client";

import dynamic from "next/dynamic";

// Chart.js só no navegador e só nas telas de resultado (CLAUDE.md, Armadilhas de versão).

function ChartSkeleton() {
  return <div className="h-40 animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-900" />;
}

export const OptionsBarChart = dynamic(() => import("./charts").then((m) => m.OptionsBarChart), {
  ssr: false,
  loading: ChartSkeleton,
});

export const PerDayLineChart = dynamic(() => import("./charts").then((m) => m.PerDayLineChart), {
  ssr: false,
  loading: ChartSkeleton,
});
