import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-4 px-4 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Página não encontrada</h1>
      <p className="text-zinc-700 dark:text-zinc-300">
        O endereço não existe ou não está disponível.
      </p>
      <Link href="/" className="underline">
        Voltar para o início
      </Link>
    </main>
  );
}
