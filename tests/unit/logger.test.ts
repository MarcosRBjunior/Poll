import { afterEach, describe, expect, it, vi } from "vitest";
import { logger, REDACTED } from "@/lib/logger";

describe("logger", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("escreve JSON com nível, mensagem e campos", () => {
    vi.stubEnv("NODE_ENV", "production");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    logger.info("request", { status: 200 });
    expect(JSON.parse(log.mock.calls[0]![0] as string)).toMatchObject({
      level: "info",
      msg: "request",
      status: 200,
    });
  });

  it("serializa Error no stderr", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    logger.error("falhou", { error: new Error("boom") });
    const entry = JSON.parse(error.mock.calls[0]![0] as string);
    expect(entry.error).toMatchObject({ name: "Error", message: "boom" });
  });

  it("descarta níveis abaixo do mínimo", () => {
    vi.stubEnv("NODE_ENV", "production");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    logger.debug("detalhe");
    expect(log).not.toHaveBeenCalled();
  });
});

describe("logger: campos sensíveis (US-8.2)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("troca e-mail, IP, cookie e conteúdo de respostas por [removido], em qualquer nível", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    logger.error("falhou", {
      requestId: "r1",
      email: "fulana@exemplo.com",
      headers: { "x-forwarded-for": "203.0.113.9", Cookie: "poll_rid=abc" },
      payload: { answers: [{ text: "meu CPF" }], respondent_key: "hash" },
    });
    const entry = JSON.parse(error.mock.calls[0]![0] as string);
    expect(entry).toMatchObject({
      requestId: "r1",
      email: REDACTED,
      headers: { "x-forwarded-for": REDACTED, Cookie: REDACTED },
      payload: { answers: REDACTED, respondent_key: REDACTED },
    });
    expect(JSON.stringify(entry)).not.toMatch(/fulana|203\.0\.113|abc|CPF/);
  });
});
