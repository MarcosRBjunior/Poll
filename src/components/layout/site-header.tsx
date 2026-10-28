import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { getCurrentUser } from "@/lib/auth";

const linkClass = "rounded px-2 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-900";

/** Cabeçalho comum (spec 7, Elementos comuns): links conforme o perfil. */
export function SiteHeader() {
  return (
    <header className="border-b border-zinc-200 dark:border-zinc-800">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-3">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          Poll
        </Link>
        <nav aria-label="Principal" className="flex flex-wrap items-center gap-1 text-sm">
          <Link href="/" className={linkClass}>
            Início
          </Link>
          {/* A sessão é por requisição: só esta parte espera por ela. */}
          <Suspense fallback={null}>
            <AccountLinks />
          </Suspense>
        </nav>
      </div>
    </header>
  );
}

async function AccountLinks() {
  await connection(); // sessão é por requisição: fora do prerender
  const user = await getCurrentUser();
  if (!user) {
    return (
      <Link href="/login" className={linkClass}>
        Entrar
      </Link>
    );
  }
  return (
    <>
      {user.role === "ADMIN" && (
        <>
          <Link href="/admin/surveys" className={linkClass}>
            Pesquisas
          </Link>
          <Link href="/admin/requests" className={linkClass}>
            Solicitações
          </Link>
          <Link href="/admin" className={linkClass}>
            Administração
          </Link>
        </>
      )}
      <Link href="/requests" className={linkClass}>
        Minhas solicitações
      </Link>
      <SignOutButton />
    </>
  );
}
