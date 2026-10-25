import { z } from "zod";
import { APP_TIME_ZONE } from "@/lib/format";
import { pageQuerySchema } from "@/lib/pagination";

/** Fuso em que o dia vira: respostas por dia e filtro de período (decisão da F5). */
export const RESULTS_TIME_ZONE = APP_TIME_ZONE;

/** Período opcional do painel (RF-12): datas AAAA-MM-DD no fuso acima, fim incluído. */
export const periodSchema = z
  .object({
    from: z.iso.date({ error: "Use uma data no formato AAAA-MM-DD." }).optional(),
    to: z.iso.date({ error: "Use uma data no formato AAAA-MM-DD." }).optional(),
  })
  .refine((p) => !p.from || !p.to || p.from <= p.to, {
    path: ["to"],
    error: "A data final precisa ser igual ou posterior à inicial.",
  });

export type Period = z.output<typeof periodSchema>;

export const textsQuerySchema = pageQuerySchema(20);

/**
 * Tabela de respostas (RF-13). `asOf` congela o conjunto na primeira página:
 * uma resposta nova não empurra linhas para a página seguinte (RF-13, critério 1).
 */
export const responsesQuerySchema = pageQuerySchema(20).extend({
  asOf: z.iso.datetime({ offset: true }).optional(),
});

export const exportQuerySchema = z.object({ format: z.string().default("csv") });
