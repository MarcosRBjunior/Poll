import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth";

// Guarda de toda a área /admin (RF-18). Sem sessão vai para /login; sem papel ADMIN, 404.
// O proxy já redireciona quem não tem cookie; aqui vale a sessão validada e o papel do banco.
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <Suspense
      fallback={
        <p className="px-4 py-16 text-center text-zinc-600 dark:text-zinc-400">Carregando…</p>
      }
    >
      <AdminGuard>{children}</AdminGuard>
    </Suspense>
  );
}

async function AdminGuard({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/admin");
  if (user.role !== "ADMIN") notFound();
  return children;
}
