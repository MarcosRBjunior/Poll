import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Obrigado — Poll" };

// T03. O link para os resultados públicos (T10) entra na F5.
export default function ThanksPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-4 px-4 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Obrigado!</h1>
      <p className="text-zinc-700 dark:text-zinc-300">Suas respostas foram registradas.</p>
      <Link href="/" className="self-start underline">
        Voltar para o início
      </Link>
    </main>
  );
}
