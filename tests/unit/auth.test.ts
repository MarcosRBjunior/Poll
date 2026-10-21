import { describe, expect, it } from "vitest";
import { afterLoginPath } from "@/lib/auth";

describe("afterLoginPath", () => {
  it("volta à página de origem quando ela é interna", () => {
    expect(afterLoginPath("/admin/surveys?page=2", "USER")).toBe("/admin/surveys?page=2");
  });

  it("sem origem, manda o administrador para /admin e os demais para /", () => {
    expect(afterLoginPath(null, "ADMIN")).toBe("/admin");
    expect(afterLoginPath(undefined, "USER")).toBe("/");
  });

  it.each(["https://evil.example", "//evil.example", "/\\evil.example", "admin", ""])(
    "ignora destino externo ou inválido: %j",
    (next) => {
      expect(afterLoginPath(next, "ADMIN")).toBe("/admin");
    },
  );
});
