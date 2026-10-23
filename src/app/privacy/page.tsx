import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Privacidade — Poll" };

const ISSUES_URL = "https://github.com/MarcosRBjunior/Poll/issues";

// T14 (D-16): o que é coletado e o que fica público, em texto simples.
export default function PrivacyPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10 leading-relaxed">
      <h1 className="text-2xl font-semibold tracking-tight">Privacidade</h1>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">O que coletamos</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>As respostas que você envia em cada pesquisa.</li>
          <li>
            Um cookie de respondente, para evitar que o mesmo navegador responda duas vezes. No
            banco guardamos só uma versão cifrada (hash) dele.
          </li>
          <li>
            Seu endereço IP, apenas em hash e só para limitar envios em excesso. O IP em si nunca é
            guardado.
          </li>
          <li>Se você entrar com sua conta, o vínculo da resposta com ela.</li>
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">O que fica público</h2>
        <p>
          Os números, os gráficos e os comentários de uma pesquisa publicada ou encerrada ficam
          públicos. Eles nunca mostram quem respondeu: nem nome, nem e-mail, nem cookie.
        </p>
        <p>
          Por isso, <strong>não escreva dados pessoais nos comentários</strong>, seus ou de outras
          pessoas.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Contato</h2>
        <p>
          Dúvidas ou pedidos sobre seus dados:{" "}
          <a href={ISSUES_URL} className="underline" rel="noopener noreferrer">
            abra uma issue no repositório do projeto
          </a>
          .
        </p>
      </section>

      <Link href="/" className="self-start underline">
        Voltar para o início
      </Link>
    </main>
  );
}
