import type { Instrumentation } from "next";
import { logger } from "@/lib/logger";

// Roda uma vez quando o servidor sobe: sem as variáveis obrigatórias, o app não inicia.
export async function register() {
  const { getEnv } = await import("@/lib/env");
  getEnv();
}

/**
 * Erro de página, Server Action ou proxy (as rotas da API já registram o seu em `withRoute`).
 * Sai em JSON com o `digest`, o mesmo código que a página de erro mostra (US-8.2).
 * Sem query string nem cabeçalhos: podem conter cookie, e-mail ou o código do login.
 */
export const onRequestError: Instrumentation.onRequestError = (error, request, context) => {
  const digest =
    typeof error === "object" && error !== null && "digest" in error
      ? String(error.digest)
      : undefined;
  logger.error("unhandled error", {
    digest,
    method: request.method,
    route: request.path.split("?")[0],
    routePath: context.routePath,
    routeType: context.routeType,
    error,
  });
};
