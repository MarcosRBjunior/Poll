import { hitBucket } from "@/features/rate-limit/repository";
import { AppError } from "@/lib/errors";

export type RateLimitRule = { limit: number; windowMs: number };

/** 10 envios por minuto por IP e pesquisa (spec 10.3). */
export const responseSubmitLimit: RateLimitRule = { limit: 10, windowMs: 60_000 };

/**
 * Janela fixa: conta a tentativa e, acima do limite, lança 429 com os segundos
 * até a próxima janela (o cabeçalho Retry-After sai em lib/http.ts).
 */
export async function enforceRateLimit(key: string, rule: RateLimitRule, now = new Date()) {
  const windowStart = new Date(Math.floor(now.getTime() / rule.windowMs) * rule.windowMs);
  const count = await hitBucket(key, windowStart);
  if (count > rule.limit) {
    const retryAfter = Math.max(
      1,
      Math.ceil((windowStart.getTime() + rule.windowMs - now.getTime()) / 1000),
    );
    throw new AppError(
      "RATE_LIMITED",
      "Muitos envios em pouco tempo. Tente de novo em instantes.",
      [],
      {
        retryAfter,
      },
    );
  }
}
