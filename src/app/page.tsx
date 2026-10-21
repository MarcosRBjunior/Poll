import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-4 px-4 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Poll</h1>
      <p className="text-lg text-zinc-700 dark:text-zinc-300">
        Crie enquetes, responda por link e veja os resultados em gráficos.
      </p>
      <Link href="/login" className="self-start underline">
        Entrar
      </Link>
    </main>
  );
}
