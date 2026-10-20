import "dotenv/config";
import { defineConfig } from "prisma/config";

// Migrações usam a conexão direta (DIRECT_URL); o app usa DATABASE_URL com pool (src/lib/db.ts).
// process.env em vez de env(): `prisma generate` precisa rodar sem URL (CI, postinstall).
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.DIRECT_URL,
  },
});
