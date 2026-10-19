import { z } from "zod";
import { AppError, type ErrorCode, type ErrorDetail } from "@/lib/errors";
import { logger } from "@/lib/logger";

// Único ponto que transforma erro em resposta HTTP (spec, seção 8.2).

const statusByCode: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN_ORIGIN: 403,
  NOT_FOUND: 404,
  SURVEY_CLOSED: 409,
  ALREADY_RESPONDED: 409,
  VERSION_CONFLICT: 409,
  INVALID_TRANSITION: 409,
  NAME_TAKEN: 409,
  PAYLOAD_TOO_LARGE: 413,
  VALIDATION_ERROR: 422,
  UNKNOWN_QUESTION: 422,
  UNKNOWN_OPTION: 422,
  REQUIRED_MISSING: 422,
  SELECTION_OUT_OF_RANGE: 422,
  TEXT_TOO_LONG: 422,
  EDIT_NOT_ALLOWED: 422,
  NOT_PUBLISHABLE: 422,
  UNSUPPORTED_FORMAT: 422,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
};

export type ErrorBody = {
  error: { code: ErrorCode; message: string; details: ErrorDetail[]; requestId: string };
};

export function json<T>(data: T, init?: ResponseInit): Response {
  return Response.json(data, init);
}

function body(code: ErrorCode, message: string, details: ErrorDetail[], requestId: string) {
  return json<ErrorBody>(
    { error: { code, message, details, requestId } },
    { status: statusByCode[code] },
  );
}

export function errorResponse(error: unknown, requestId: string): Response {
  if (error instanceof AppError) {
    return body(error.code, error.message, error.details, requestId);
  }
  if (error instanceof z.ZodError) {
    const details = error.issues.map((issue) => ({
      path: issue.path.map(String).join("."),
      message: issue.message,
    }));
    return body("VALIDATION_ERROR", "Há campos inválidos.", details, requestId);
  }
  return body("INTERNAL_ERROR", "Erro inesperado.", [], requestId);
}

export type RouteMeta = { requestId: string };

type Handler<C> = (request: Request, context: C, meta: RouteMeta) => Response | Promise<Response>;

/**
 * Envolve um Route Handler: gera o `requestId`, converte erros no formato padrão,
 * devolve o cabeçalho `x-request-id` e registra a requisição.
 */
export function withRoute<C = unknown>(handler: Handler<C>) {
  return async (request: Request, context: C): Promise<Response> => {
    const requestId = crypto.randomUUID();
    const startedAt = performance.now();
    let response: Response;

    try {
      response = await handler(request, context, { requestId });
    } catch (error) {
      if (!(error instanceof AppError) && !(error instanceof z.ZodError)) {
        logger.error("unhandled error", { requestId, error });
      }
      response = errorResponse(error, requestId);
    }

    response.headers.set("x-request-id", requestId);
    logger.info("request", {
      requestId,
      method: request.method,
      route: new URL(request.url).pathname,
      status: response.status,
      durationMs: Math.round(performance.now() - startedAt),
    });
    return response;
  };
}
