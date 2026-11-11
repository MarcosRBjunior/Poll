import { z } from "zod";
import { periodSchema } from "@/features/results/schemas";

export const trendBuckets = ["week", "month"] as const;
export type TrendBucket = (typeof trendBuckets)[number];

/**
 * `GET /api/v1/trends` (RF-17): grupo (ausente = todas as pesquisas, inclusive sem grupo),
 * período em dias AAAA-MM-DD no fuso do app (fim incluído) e granularidade.
 * Sem período, o serviço usa os últimos 3 meses (decisão da F8).
 */
export const trendsQuerySchema = z
  .object({
    groupId: z.preprocess((v) => v || undefined, z.string().min(1).max(64).optional()),
    bucket: z.enum(trendBuckets, { error: "Use week ou month." }).default("week"),
  })
  .and(periodSchema);

export type TrendsQuery = z.output<typeof trendsQuerySchema>;
