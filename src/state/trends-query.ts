import { atom } from "jotai";
import type { TrendBucket } from "@/features/trends/schemas";

// Filtros do painel de tendências (T09, US-7.3). Só estado de interface: os números vêm da API.

export type TrendsQuery = { groupId: string; from: string; to: string; bucket: TrendBucket };

/** `null` até o administrador mexer: vale o padrão (últimos 3 meses, por semana). */
export const trendsQueryAtom = atom<TrendsQuery | null>(null);

/** Query string de `GET /api/v1/trends`, sem o grupo quando são todas as pesquisas. */
export function trendsQueryString(query: TrendsQuery): string {
  const params = new URLSearchParams({ from: query.from, to: query.to, bucket: query.bucket });
  if (query.groupId) params.set("groupId", query.groupId);
  return params.toString();
}
