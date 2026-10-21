"use client";

import { createBrowserClient } from "@supabase/ssr";

// Só a URL e a chave publicável chegam ao navegador (nada secreto com NEXT_PUBLIC_).
// O servidor valida as duas em src/lib/env.ts; aqui o Next já as embutiu no build.
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
  );
}
