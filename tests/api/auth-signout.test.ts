import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/auth/signout/route";
import { createUser, resetDatabase } from "../fixtures/db";
import { fakeAuth, sessionAs } from "../fixtures/supabase-mock";

vi.mock(
  "@/lib/supabase/server",
  async () => (await import("../fixtures/supabase-mock")).supabaseServerMock,
);

function signout(origin?: string) {
  const headers = origin ? { origin } : undefined;
  return POST(
    new Request("http://localhost/api/auth/signout", { method: "POST", headers }),
    undefined,
  );
}

beforeEach(async () => {
  await resetDatabase();
  vi.clearAllMocks();
});

describe("POST /api/auth/signout", () => {
  it("encerra a sessão e responde 204", async () => {
    sessionAs((await createUser()).id);
    const response = await signout("http://localhost");
    expect(response.status).toBe(204);
    expect(fakeAuth.signOut).toHaveBeenCalledOnce();
  });

  it("sem sessão responde 401", async () => {
    sessionAs(null);
    expect((await signout("http://localhost")).status).toBe(401);
  });

  it.each([["https://evil.example"], [undefined]])("Origin %s recebe 403", async (origin) => {
    sessionAs((await createUser()).id);
    const response = await signout(origin);
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("FORBIDDEN_ORIGIN");
    expect(fakeAuth.signOut).not.toHaveBeenCalled();
  });
});
