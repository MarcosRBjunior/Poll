import { getDb } from "@/lib/db";

export async function pingDatabase(): Promise<void> {
  await getDb().$queryRaw`SELECT 1`;
}
