// Erros de domínio. Não conhecem HTTP: o status de cada código é decidido em lib/http.ts.

export const errorCodes = [
  "BAD_REQUEST",
  "UNAUTHENTICATED",
  "FORBIDDEN_ORIGIN",
  "NOT_FOUND",
  "SURVEY_CLOSED",
  "ALREADY_RESPONDED",
  "VERSION_CONFLICT",
  "INVALID_TRANSITION",
  "NAME_TAKEN",
  "PAYLOAD_TOO_LARGE",
  "VALIDATION_ERROR",
  "UNKNOWN_QUESTION",
  "UNKNOWN_OPTION",
  "REQUIRED_MISSING",
  "SELECTION_OUT_OF_RANGE",
  "TEXT_TOO_LONG",
  "EDIT_NOT_ALLOWED",
  "NOT_PUBLISHABLE",
  "UNSUPPORTED_FORMAT",
  "RATE_LIMITED",
  "INTERNAL_ERROR",
] as const;

export type ErrorCode = (typeof errorCodes)[number];

export type ErrorDetail = { path: string; message: string };

/** Dados extras que viram cabeçalho HTTP (ex.: Retry-After do 429). */
export type ErrorMeta = { retryAfter?: number };

export class AppError extends Error {
  override readonly name = "AppError";

  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details: ErrorDetail[] = [],
    readonly meta: ErrorMeta = {},
  ) {
    super(message);
  }
}
