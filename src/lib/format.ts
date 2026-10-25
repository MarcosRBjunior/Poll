// Formatação de números e datas para as telas e o CSV, sempre em pt-BR.

/** Fuso em que o dia vira nos resultados e nas datas mostradas (decisão da F5). */
export const APP_TIME_ZONE = "America/Sao_Paulo";

const numberFormat = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
const percentFormat = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});
const dateTimeFormat = new Intl.DateTimeFormat("pt-BR", {
  timeZone: APP_TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const isoDayFormat = new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIME_ZONE });

export const formatNumber = (n: number) => numberFormat.format(n);

/** 62.5 → "62,5%". */
export const formatPercent = (n: number) => `${percentFormat.format(n)}%`;

/** "24/10/2026 19:22", no fuso do app. */
export const formatDateTime = (date: Date) => dateTimeFormat.format(date).replace(", ", " ");

/** "2026-10-20" → "20/10/2026", sem passar por fuso (já é um dia do calendário). */
export function formatDay(isoDay: string, withYear = true) {
  const [year, month, day] = isoDay.split("-");
  return withYear ? `${day}/${month}/${year}` : `${day}/${month}`;
}

/** Dia de hoje (AAAA-MM-DD) no fuso do app. */
export const todayIso = (now = new Date()) => isoDayFormat.format(now);
