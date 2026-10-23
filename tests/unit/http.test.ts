import { describe, expect, it } from "vitest";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { type ErrorBody, json, withRoute, assertSameOrigin } from "@/lib/http";

const request = () => new Request("http://localhost/api/v1/test");

async function call(handler: () => Response | Promise<Response>) {
  const response = await withRoute(handler)(request(), undefined);
  return { response, requestId: response.headers.get("x-request-id") };
}

describe("withRoute", () => {
  it("devolve a resposta do handler com x-request-id", async () => {
    const { response, requestId } = await call(() => json({ ok: true }));
    expect(response.status).toBe(200);
    expect(requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(await response.json()).toEqual({ ok: true });
  });

  it("converte AppError no formato padrão com o mesmo requestId", async () => {
    const { response, requestId } = await call(() => {
      throw new AppError("NOT_FOUND", "Pesquisa não encontrada.");
    });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: { code: "NOT_FOUND", message: "Pesquisa não encontrada.", details: [], requestId },
    });
  });

  it.each([
    ["BAD_REQUEST", 400],
    ["UNAUTHENTICATED", 401],
    ["SURVEY_CLOSED", 409],
    ["EDIT_NOT_ALLOWED", 422],
    ["RATE_LIMITED", 429],
  ] as const)("mapeia %s para %i", async (code, status) => {
    const { response } = await call(() => {
      throw new AppError(code, "x");
    });
    expect(response.status).toBe(status);
  });

  it("converte ZodError em VALIDATION_ERROR com details", async () => {
    const schema = z.object({ answers: z.array(z.object({ text: z.string().min(1) })) });
    const { response } = await call(() => {
      schema.parse({ answers: [{ text: "" }] });
      return json({});
    });
    const body = (await response.json()) as ErrorBody;
    expect(response.status).toBe(422);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details).toEqual([{ path: "answers.0.text", message: expect.any(String) }]);
  });

  it("esconde detalhes de erro inesperado", async () => {
    const { response, requestId } = await call(() => {
      throw new Error("senha do banco: segredo");
    });
    const text = await response.text();
    expect(response.status).toBe(500);
    expect(text).not.toContain("segredo");
    expect(JSON.parse(text)).toEqual({
      error: { code: "INTERNAL_ERROR", message: "Erro inesperado.", details: [], requestId },
    });
  });
});

describe("assertSameOrigin", () => {
  const post = (headers: Record<string, string>) =>
    new Request("https://poll.example/api/auth/signout", { method: "POST", headers });

  it("aceita a própria origem", () => {
    expect(() => assertSameOrigin(post({ origin: "https://poll.example" }))).not.toThrow();
  });

  it.each([
    ["outra origem", { origin: "https://evil.example" }],
    ["subdomínio", { origin: "https://evil.poll.example" }],
    ["sem Origin", {}],
  ])("recusa %s com FORBIDDEN_ORIGIN", (_, headers) => {
    expect(() => assertSameOrigin(post(headers))).toThrow(
      expect.objectContaining({ code: "FORBIDDEN_ORIGIN" }),
    );
  });
});

describe("Retry-After", () => {
  it("vira cabeçalho no 429", async () => {
    const response = await withRoute(() => {
      throw new AppError("RATE_LIMITED", "x", [], { retryAfter: 42 });
    })(new Request("http://localhost/x"), undefined);
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("42");
  });
});
