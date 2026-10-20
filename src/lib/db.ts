import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { getEnv } from "@/lib/env";

// Importado só por repository.ts, pelo seed e pelos testes (regra de lint em eslint.config.mjs).

const globalForDb = globalThis as unknown as { db?: PrismaClient };
let client: PrismaClient | undefined;

function createClient() {
  const adapter = new PrismaPg({
    connectionString: getEnv().DATABASE_URL,
    // Plano gratuito do Prisma Postgres: 10 conexões no total [PROPOSTA].
    max: 5,
    connectionTimeoutMillis: 5_000,
  });
  return new PrismaClient({ adapter });
}

/** Instância única, criada no primeiro uso para o build não exigir DATABASE_URL. */
export function getDb(): PrismaClient {
  if (process.env.NODE_ENV === "development") {
    globalForDb.db ??= createClient(); // sobrevive ao hot reload
    return globalForDb.db;
  }
  client ??= createClient();
  return client;
}
