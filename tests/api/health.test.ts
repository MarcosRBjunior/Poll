import { afterEach, describe, expect, it, vi } from "vitest";

async function loadGet() {
  vi.resetModules(); // descarta o cliente e o env em cache
  return (await import("@/app/api/health/route")).GET;
}

describe("GET /api/health", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("responde 200 { status: 'ok' } sem cache quando o banco responde", async () => {
    const GET = await loadGet();
    const response = await GET(new Request("http://localhost/api/health"), undefined);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-request-id")).toBeTruthy();
    expect(await response.json()).toEqual({ status: "ok" });
  });

  it("responde 503 quando o banco está fora", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://poll:poll@localhost:1/poll");
    const GET = await loadGet();
    const response = await GET(new Request("http://localhost/api/health"), undefined);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "unavailable" });
  });
});
