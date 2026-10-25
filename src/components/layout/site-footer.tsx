import Link from "next/link";

/** Rodapé comum, com o caminho para a página de privacidade (T14). */
export function SiteFooter() {
  return (
    <footer className="border-t border-zinc-200 dark:border-zinc-800">
      <div className="mx-auto flex w-full max-w-6xl justify-between gap-4 px-4 py-4 text-sm text-zinc-600 dark:text-zinc-400">
        <span>Poll</span>
        <Link href="/privacy" className="underline">
          Privacidade
        </Link>
      </div>
    </footer>
  );
}
