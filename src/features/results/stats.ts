// Estatísticas sobre contagens já agregadas no banco: nada aqui recebe respostas individuais.

/** Um valor numérico de opção (RF-07) e quantas vezes ele foi escolhido. */
export type ValueCount = { value: number; count: number };

const round = (n: number, digits: number) => {
  const factor = 10 ** digits;
  return Math.round(n * factor) / factor;
};

/** Percentual de 0 a 100 com uma casa decimal (RN-16). Sem base, 0. */
export function percent(part: number, whole: number): number {
  return whole === 0 ? 0 : round((part / whole) * 100, 1);
}

/** Média ponderada pelas contagens, com duas casas. Sem escolhas, `null`. */
export function weightedMean(items: ValueCount[]): number | null {
  const total = items.reduce((sum, i) => sum + i.count, 0);
  if (total === 0) return null;
  return round(items.reduce((sum, i) => sum + i.value * i.count, 0) / total, 2);
}

/**
 * Mediana das escolhas expandidas pelas contagens, com duas casas. Com total par,
 * é a média dos dois valores do meio. Sem escolhas, `null`.
 */
export function weightedMedian(items: ValueCount[]): number | null {
  const sorted = items.filter((i) => i.count > 0).sort((a, b) => a.value - b.value);
  const total = sorted.reduce((sum, i) => sum + i.count, 0);
  if (total === 0) return null;

  // Posições (base 0) dos elementos do meio na lista expandida.
  const lower = Math.floor((total - 1) / 2);
  const upper = Math.floor(total / 2);
  let seen = 0;
  let lowerValue: number | undefined;
  for (const item of sorted) {
    const last = seen + item.count - 1;
    if (lowerValue === undefined && lower <= last) lowerValue = item.value;
    if (upper <= last) return round((lowerValue! + item.value) / 2, 2);
    seen += item.count;
  }
  return null; // inalcançável: upper < total
}
