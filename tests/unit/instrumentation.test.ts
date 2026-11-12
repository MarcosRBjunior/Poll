import { afterEach, describe, expect, it, vi } from "vitest";
import { onRequestError } from "@/instrumentation";

describe("onRequestError (US-8.2)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("registra erro de página em JSON com o digest, sem query string nem cabeçalhos", async () => {
    const stderr = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = Object.assign(new Error("falha ao renderizar"), { digest: "123456" });

    await onRequestError(
      error,
      {
        path: "/login?next=/admin&email=fulana@exemplo.com",
        method: "GET",
        headers: { cookie: "sb-access-token=segredo", "x-forwarded-for": "203.0.113.9" },
      },
      {
        routerKind: "App Router",
        routePath: "/login",
        routeType: "render",
        renderSource: "server-rendering",
        revalidateReason: undefined,
      },
    );

    const line = stderr.mock.calls[0]![0] as string;
    expect(JSON.parse(line)).toMatchObject({
      level: "error",
      msg: "unhandled error",
      digest: "123456",
      method: "GET",
      route: "/login",
      routePath: "/login",
      routeType: "render",
      error: { message: "falha ao renderizar" },
    });
    expect(line).not.toMatch(/fulana|segredo|203\.0\.113/);
  });
});
