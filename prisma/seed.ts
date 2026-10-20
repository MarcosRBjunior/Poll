import "dotenv/config";
import { getDb } from "@/lib/db";
import { runSeed, SeedError } from "./seed/run";

async function main() {
  const db = getDb();
  try {
    const { created, skipped } = await runSeed(db, process.env.ADMIN_EMAIL);
    console.log(`Seed concluído. Criadas: ${created.length}. Já existiam: ${skipped.length}.`);
  } catch (error) {
    console.error(error instanceof SeedError ? `Seed interrompido: ${error.message}` : error);
    process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}

void main();
