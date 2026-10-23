import { getDb } from "@/lib/db";

/**
 * Soma 1 ao contador da chave na janela atual e devolve o total da janela.
 * Uma única consulta: atômica sob concorrência e uma só operação no Prisma Postgres.
 * Aproveita para apagar janelas com mais de um dia (spec 6.9), sem agendador.
 */
export async function hitBucket(key: string, windowStart: Date): Promise<number> {
  const rows = await getDb().$queryRaw<{ count: number }[]>`
    WITH cleanup AS (
      DELETE FROM "RateLimitBucket" WHERE "windowStart" < ${windowStart}::timestamptz - interval '1 day'
    )
    INSERT INTO "RateLimitBucket" ("key", "windowStart", "count")
    VALUES (${key}, ${windowStart}::timestamptz, 1)
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE
        WHEN "RateLimitBucket"."windowStart" = EXCLUDED."windowStart" THEN "RateLimitBucket"."count" + 1
        ELSE 1
      END,
      "windowStart" = EXCLUDED."windowStart"
    RETURNING "count"`;
  return rows[0]?.count ?? 1;
}
