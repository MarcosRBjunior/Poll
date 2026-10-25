import type { BrowserContext } from "@playwright/test";
import { signInCookies, testSupabase } from "../fixtures/supabase-test-project";
import { withDb } from "./survey-data";

/**
 * Login real no projeto Supabase de teste. O callback cria o User no login de verdade;
 * aqui o login é por senha, então o User é espelhado direto no banco, com o mesmo papel
 * que o callback daria. Devolve o id do usuário.
 */
export async function loginAs(
  context: BrowserContext,
  account: { email?: string; password?: string },
): Promise<string> {
  const session = await signInCookies(account);
  const role = session.email === testSupabase.admin.email?.toLowerCase() ? "ADMIN" : "USER";
  await withDb((db) =>
    db.query(
      `INSERT INTO "User" (id, email, role) VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET email = $2, role = $3`,
      [session.userId, session.email, role],
    ),
  );
  await context.addCookies(
    session.cookies.map((c) => ({ ...c, domain: "localhost", path: "/", sameSite: "Lax" })),
  );
  return session.userId;
}
