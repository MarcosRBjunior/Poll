# Poll — Criador de Enquetes (Projeto 07, Portfólio Boost Program)

App web full-stack: o administrador cria pesquisas sem código, qualquer pessoa responde por link e os resultados viram gráficos, números e um painel de tendências por grupo de pesquisas. Tema inicial: ferramentas JavaScript favoritas e entretenimento.

- Especificação completa: `docs/spec.md`. Os IDs citados aqui (RF, RN, US, D) estão definidos lá.
- Fase atual: **7 — Gerenciamento, vitrine e solicitações**. Fase 6 concluída em 25/10/2026 (produção: https://poll-chi-six.vercel.app).

## Como trabalhar aqui

- Leia este arquivo e a seção correspondente de `docs/spec.md` antes de codar.
- Trabalhe uma fase por vez, na ordem de "Fases". Não adiante funcionalidade de fase futura.
- Entregue em fatias verticais: banco + serviço + API + tela + testes da mesma funcionalidade juntos.
- Para mudança que toque mais de 3 arquivos ou altere o schema, apresente o plano antes de editar.
- Não invente regra de negócio. Se a spec não cobrir o caso, pergunte.
- Antes de dizer que terminou: `npm run lint`, `npm run typecheck` e `npm test` passando.
- Não adicione dependência fora da stack sem dizer por quê e pedir confirmação.
- Commits em Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`), um assunto por commit.
- Atualize a linha "Fase atual" acima ao concluir uma fase.

## Stack (fixa)

- Next.js (App Router) + React + TypeScript estrito + TailwindCSS
- React Hook Form + Zod (schema único para cliente e servidor)
- Jotai (só estado de interface)
- Prisma ORM + Prisma Postgres
- Supabase Auth (só login; nenhum dado de domínio no Supabase)
- Chart.js via `react-chartjs-2`
- Vitest + Testing Library + Playwright + axe
- Deploy na Vercel; CI no GitHub Actions; npm como gerenciador

## Decisões tomadas (não reabrir sem pedido)

- **Login (D-01):** Supabase Auth com GitHub e link por e-mail. O `User` local espelha o usuário do Supabase (mesmo id) e é criado no primeiro login.
- **Administrador (D-13):** só o e-mail em `ADMIN_EMAIL` tem papel `ADMIN`. Só ele cria e gerencia pesquisas e grupos. Usuários com conta apenas solicitam pesquisas (RF-21, RF-22).
- **Respondente (D-02):** anônimo por padrão; login opcional. Com login, o envio grava `userId`.
- **Duplicidade (D-05):** um envio por pesquisa — por conta com login, por cookie sem login — mais limite por IP e chave de idempotência.
- **Banco (D-03):** Prisma Postgres. Cada consulta conta como operação: agregue em poucas queries.
- **Resultados públicos (D-10):** números, gráficos e comentários de pesquisa publicada ou encerrada são públicos. Tabela individual e CSV só para o administrador. Nunca expor quem respondeu.
- **Tipos de pergunta (D-04):** `SINGLE_CHOICE`, `MULTIPLE_CHOICE`, `SHORT_TEXT`, `LONG_TEXT`. Sim/não e escala são escolha única com valores numéricos.
- **Comentário do Nível 1 (D-14):** pergunta `LONG_TEXT` opcional no fim da pesquisa.
- **Edição com respostas (D-06):** modo restrito (RN-11).
- **Exclusão (D-08):** lógica (`deletedAt`), sem restaurar.
- **Abrir/fechar (D-09):** só manual.
- **Grupos (D-07):** 0 ou 1 grupo por pesquisa. Tendência = participação por período, opções mais escolhidas, evolução do percentual.
- **Download (D-11):** CSV com `;`, UTF-8 com BOM.
- **Privacidade (D-16):** formulário avisa que comentários ficam públicos e pede para não escrever dados pessoais.

## Arquitetura e camadas

Monólito Next.js. Fluxo de dependência obrigatório:

`app/` (rota ou página) → `features/*/service.ts` (regras) → `features/*/repository.ts` (Prisma) → banco

- `app/` lê parâmetros, chama serviço, monta resposta. Sem regra de negócio, sem Prisma.
- `service.ts` aplica as RN, abre transações, lança erros de domínio. Não conhece HTTP.
- `repository.ts` é o único lugar com Prisma. Consultas de gestão sempre filtram pelo dono.
- `components/` recebe dados por props. Não busca no banco.
- `features/*/schemas.ts` (Zod) é importado pelo formulário e pelo serviço. A regra é escrita uma vez.
- Jotai nunca é fonte de verdade. Respostas são gravadas no banco, não no Jotai.
- Server Component por padrão; `"use client"` só com interação, formulário ou gráfico.

## Estrutura

```text
prisma/            schema.prisma, migrations/, seed.ts
prisma.config.ts   URL do banco e caminho do schema (Prisma 7)
src/app/           páginas e api/ (v1/, auth/callback/, health/)
src/components/    ui/, questions/, builder/, results/, trends/
src/features/      surveys/, responses/, results/, groups/, trends/, requests/
src/lib/           db, supabase/ (client, server, proxy), auth, env, errors, http, logger, rate-limit, slug
src/state/         átomos Jotai
src/proxy.ts       renovação de sessão e guarda de rotas
tests/             unit/, integration/, api/, e2e/, fixtures/
docs/              spec.md, adr/, diagrams/
```

## Regras de negócio que o código precisa garantir

- Só pesquisa `PUBLISHED` aceita respostas. `CLOSED` → 409. Rascunho ou excluída → 404 (RN-04).
- Validação do envio sempre no servidor, contra a estrutura atual da pesquisa: pergunta pertence à pesquisa, opção pertence à pergunta, ambas ativas (RN-05 a RN-08).
- Envio gravado numa única transação. Falha no meio não deixa nada (RF-04).
- Resposta enviada é imutável. Não existe rota de edição (RN-09).
- Pesquisa com respostas: corrigir texto, adicionar e reordenar pode; remover vira `archivedAt`; trocar tipo ou valor numérico → 422 (RN-11).
- Salvar com `version` desatualizada → 409 (RN-17).
- Status: `DRAFT` → `PUBLISHED` ↔ `CLOSED`; com respostas nunca volta a `DRAFT` (RN-15).
- Slug fica fixo depois da primeira publicação (RN-20).
- Percentual = escolhas da opção ÷ quem respondeu a pergunta. Média e mediana só se todas as opções têm valor (RN-16).
- Solicitação: `PENDING` → `IN_REVIEW` → `ACCEPTED` → `DONE`, ou `REJECTED`; só o administrador muda (RN-22).

## API

- REST em `/api/v1`. JSON em camelCase, datas ISO 8601 em UTC.
- Rotas sem login: `/api/v1/public/*`, `/api/health`, `/api/auth/callback`. Todas as outras exigem sessão.
- Rota de gestão sem sessão → 401. Usuário sem papel `ADMIN` → 404 (nunca 403).
- Erro sempre neste formato, montado em um único ponto (`lib/http.ts`):
  `{ "error": { "code", "message", "details": [{ "path", "message" }], "requestId" } }`
- Códigos: 400 malformado · 404 inexistente ou sem acesso · 409 conflito de estado · 422 viola regra · 429 limite.
- Paginação `?page&pageSize` (máximo 100) → `{ data, page, pageSize, total }`.

## Segurança (não negociável)

- Papel `ADMIN` conferido no servidor em toda rota e Server Action de gestão — não confiar só no `proxy.ts`.
- No servidor, proteger com `supabase.auth.getClaims()`; nunca confiar em `getSession()`.
- Nunca usar `dangerouslySetInnerHTML` com conteúdo de usuário.
- CSV neutraliza células que começam com `=`, `+`, `-`, `@` (RN-18).
- Limites: corpo do envio 64 KB; 50 perguntas por pesquisa; 30 opções por pergunta; 10 envios/min por IP e pesquisa; 3 solicitações/dia por usuário.
- IP e token de respondente só em hash com `RESPONDENT_KEY_SECRET`. Logs nunca contêm respostas nem dados pessoais.
- Rotas que escrevem conferem o cabeçalho `Origin`.
- Nenhuma chave de serviço do Supabase no app. Nada secreto com prefixo `NEXT_PUBLIC_`.

## Testes

- Integração com Postgres real (Docker local, serviço no CI). Não mockar o Prisma.
- Toda rota de gestão tem teste de permissão: sem sessão (401) e usuário comum (404).
- Os casos obrigatórios estão em `docs/spec.md`, seção 16 (19 casos). Implemente os da fase em andamento.
- Meta: 80% das linhas em `features/*/service.ts` e `lib/`.

## Comandos (criar na fase 1)

```bash
npm run dev          # desenvolvimento
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
npm test             # Vitest (unit + integration + api)
npm run test:e2e     # Playwright
npm run db:up        # Postgres local via docker compose
npm run db:migrate   # prisma migrate dev
npm run db:seed      # prisma/seed.ts (o administrador precisa ter entrado uma vez)
npm run vercel-build # prisma generate && prisma migrate deploy && next build
```

## Variáveis de ambiente

Validadas com Zod em `src/lib/env.ts`; o app não sobe se faltar alguma obrigatória. Documentar todas em `.env.example`, sem valores.

`DATABASE_URL` (pool, app) · `DIRECT_URL` (migrações) · `NEXT_PUBLIC_SUPABASE_URL` · `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` · `ADMIN_EMAIL` · `RESPONDENT_KEY_SECRET` · opcionais: `SENTRY_DSN`, `RATE_LIMIT_REDIS_URL`

## Armadilhas de versão

- **Next.js 16+:** o arquivo é `proxy.ts` com `export function proxy`; `middleware.ts` está depreciado. Use `matcher` excluindo `_next/static`, `_next/image` e assets.
- **Prisma 7:** a URL do banco fica em `prisma.config.ts` (`datasource.url`), que não carrega `.env` sozinho — importar `dotenv/config`. Migrações usam `DIRECT_URL`; o app usa `DATABASE_URL` com driver adapter. Confira a documentação da versão instalada antes de configurar.
- **Supabase:** pacotes `@supabase/supabase-js` e `@supabase/ssr`; clientes separados em `lib/supabase/client.ts` (navegador) e `lib/supabase/server.ts` (servidor).
- **Chart.js:** carregar só no navegador (`dynamic(..., { ssr: false })`), apenas nas telas de resultado.
- **create-next-app** recusa pasta com arquivos: gere numa pasta temporária e mova para a raiz, preservando `CLAUDE.md` e `docs/`.

## Fases

| Fase | Entrega                                                              | Histórias               | Release  |
| ---- | -------------------------------------------------------------------- | ----------------------- | -------- |
| 1    | Fundação: projeto, lint, `lib/` base, `/api/health`, CI, Vercel      | US-0.1 a US-0.3         |          |
| 2    | Banco: schema, migrações, SQL complementar, seed                     | US-1.1, US-1.2          |          |
| 3    | Login Supabase, papel `ADMIN`, `proxy.ts`, testes de permissão       | US-4.1, US-4.2          |          |
| 4    | Responder pesquisa: componentes, envio, idempotência, rascunho Jotai | US-2.1 a US-2.4         |          |
| 5    | Resultados: serviço, T07, T10 pública, CSV                           | US-3.1 a US-3.5         | `v0.1.0` |
| 6    | Construtor de pesquisas e edição restrita                            | US-5.1 a US-5.4         |          |
| 7    | Gerenciamento, vitrine, login do respondente, solicitações           | US-6.1 a US-6.6, US-4.3 | `v0.2.0` |
| 8    | Grupos e painel de tendências                                        | US-7.1 a US-7.3         |          |
| 9    | Endurecimento: cabeçalhos, CSP, carga, acessibilidade                | US-8.1, US-8.2, US-8.4  |          |
| 10   | README, ADRs, checklist de produção                                  | US-8.3, US-9.1, US-9.2  | `v0.3.0` |

## Não fazer

- Guardar respostas, pesquisas ou resultados no Jotai ou no `localStorage` como fonte de verdade.
- Chamar Prisma fora de `repository.ts`.
- Apagar fisicamente pergunta ou opção que já tem respostas.
- Expor no painel público id, e-mail, cookie ou qualquer dado de quem respondeu.
- Usar o Supabase como banco do domínio.
- Implementar fora do escopo sem pedido: lógica condicional, upload de arquivos, e-mails, multi-idioma, pagamentos.
