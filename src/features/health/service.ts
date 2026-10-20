import { logger } from "@/lib/logger";
import { pingDatabase } from "./repository";

export type HealthStatus = "ok" | "unavailable";

export async function checkHealth(): Promise<HealthStatus> {
  try {
    await pingDatabase();
    return "ok";
  } catch (error) {
    logger.warn("database unavailable", { error });
    return "unavailable";
  }
}
