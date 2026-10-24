import { createHmac } from "node:crypto";
import { getEnv } from "@/lib/env";

// Identidade do respondente sem login (spec 6.5): token aleatório em cookie; no banco e
// nas chaves de limite só entra o HMAC, nunca o token nem o IP em claro.

export const RESPONDENT_COOKIE = "poll_rid";

export const respondentCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
  maxAge: 365 * 24 * 60 * 60,
} as const;

const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Só aceita o formato que o próprio app gera; qualquer outro valor é descartado. */
export function isRespondentToken(value: string | undefined): value is string {
  return value !== undefined && uuidV4.test(value);
}

export function newRespondentToken(): string {
  return crypto.randomUUID();
}

/** HMAC-SHA256 em hexadecimal (64 caracteres) com RESPONDENT_KEY_SECRET. */
export function keyedHash(value: string): string {
  return createHmac("sha256", getEnv().RESPONDENT_KEY_SECRET).update(value).digest("hex");
}

/** IP do cliente: primeiro valor de x-forwarded-for, preenchido pela Vercel. */
export function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}
