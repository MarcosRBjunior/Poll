import type { TrendBucket } from "./schemas";

// Sem Prisma: o painel (cliente) e o serviço usam as mesmas contas de datas.
// Dias do calendário (AAAA-MM-DD), calculados em UTC para não depender do fuso.

const toDate = (iso: string) => new Date(`${iso}T00:00:00Z`);
const toIso = (date: Date) => date.toISOString().slice(0, 10);

/** Mesmo dia `months` meses antes; se o dia não existe no mês de destino, o último dia dele. */
export function subtractMonths(iso: string, months: number): string {
  const date = toDate(iso);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() - months);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return toIso(date);
}

/** Início do período que contém o dia: segunda-feira da semana ou dia 1 do mês. */
export function bucketStart(iso: string, bucket: TrendBucket): string {
  if (bucket === "month") return `${iso.slice(0, 7)}-01`;
  const date = toDate(iso);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return toIso(date);
}

/** Todos os períodos que tocam o intervalo, do primeiro ao último. */
export function listPeriods(
  { from, to }: { from: string; to: string },
  bucket: TrendBucket,
): string[] {
  const periods: string[] = [];
  const cursor = toDate(bucketStart(from, bucket));
  const last = bucketStart(to, bucket);
  while (toIso(cursor) <= last) {
    periods.push(toIso(cursor));
    if (bucket === "month") cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    else cursor.setUTCDate(cursor.getUTCDate() + 7);
  }
  return periods;
}

/** Janela padrão do painel: os últimos 3 meses até o dia dado (decisão da F8). */
export function defaultPeriod(today: string): { from: string; to: string } {
  return { from: subtractMonths(today, 3), to: today };
}
