import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db, resetDatabase } from "../fixtures/db";

// ADMIN_EMAIL de teste: admin@example.com (vitest.config.mts), salvo quando há projeto de teste.
const adminEmail = process.env.ADMIN_EMAIL ?? "";

async function loadService() {
  vi.resetModules(); // descarta o env em cache
  return import("@/features/users/service");
}

beforeEach(resetDatabase);
afterEach(() => vi.unstubAllEnvs());

describe("syncUser", () => {
  it("cria o User no primeiro login com o mesmo id do Supabase e papel USER", async () => {
    const { syncUser } = await loadService();
    const id = randomUUID();
    const user = await syncUser({ id, email: "Pessoa@Example.com", name: "Pessoa" });
    expect(user).toEqual({ id, email: "pessoa@example.com", role: "USER" });
    expect(await db.user.findUnique({ where: { id } })).toMatchObject({ name: "Pessoa" });
  });

  it("dá ADMIN só ao e-mail do ADMIN_EMAIL, sem diferença de caixa", async () => {
    const { syncUser } = await loadService();
    const user = await syncUser({ id: randomUUID(), email: ` ${adminEmail.toUpperCase()} ` });
    expect(user.role).toBe("ADMIN");
  });

  it("reavalia o papel a cada login, para a troca do ADMIN_EMAIL ter efeito", async () => {
    const id = randomUUID();
    await (await loadService()).syncUser({ id, email: adminEmail });

    vi.stubEnv("ADMIN_EMAIL", "outra@example.com");
    const again = await (await loadService()).syncUser({ id, email: adminEmail });

    expect(again.role).toBe("USER");
    expect(await db.user.count()).toBe(1);
  });
});
