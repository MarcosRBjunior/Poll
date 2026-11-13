import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { getEnv } from "@/lib/env";

// Importado só por repository.ts, pelo seed e pelos testes (regra de lint em eslint.config.mjs).

const globalForDb = globalThis as unknown as { db?: PrismaClient };
let client: PrismaClient | undefined;

function createClient() {
  const env = getEnv();
  const adapter = new PrismaPg({
    // Com pool do Prisma Postgres quando houver (spec 10.1): a conexão direta do plano
    // gratuito aceita poucas, e cada instância da função abre as suas.
    connectionString: env.DATABASE_URL_POOLED ?? env.DATABASE_URL,
    max: 3,
    // Instância parada não segura conexão: devolve as ociosas depois de 5 s.
    idleTimeoutMillis: 5_000,
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
