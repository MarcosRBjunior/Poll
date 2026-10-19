import { afterEach, describe, expect, it, vi } from "vitest";
import { logger } from "@/lib/logger";

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
