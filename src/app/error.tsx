"use client";

// Erro inesperado ao carregar uma página (spec 7): oferece "Tentar de novo".
export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-4 px-4 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Algo deu errado</h1>
      <p className="text-zinc-700 dark:text-zinc-300">
        Não foi possível carregar esta página agora.
      </p>
      <button
        type="button"
        onClick={reset}
        className="self-start rounded-md bg-zinc-900 px-4 py-2 font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
      >
        Tentar de novo
      </button>
    </main>
  );
}
