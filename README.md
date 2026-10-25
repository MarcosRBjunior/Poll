# Poll — Criador de Enquetes

O administrador cria pesquisas sem código, qualquer pessoa responde por link e os resultados viram gráficos, números e um painel de tendências.

Projeto 07 do Portfólio Boost Program. Especificação em [`docs/spec.md`](docs/spec.md).

> Em construção — fase atual: **6, Construtor de pesquisas** (`v0.1.0` no ar). Produção: https://poll-chi-six.vercel.app

## Stack

Next.js (App Router) · React · TypeScript estrito · TailwindCSS · Zod · Prisma + Prisma Postgres · Supabase Auth · Chart.js · Vitest · Playwright · Vercel.

## Rodando localmente

Requer Node 24+ e Docker.

```bash
npm install
cp .env.example .env   # preencha DATABASE_URL e DIRECT_URL (veja abaixo)
npm run db:up          # Postgres em localhost:5440, com os bancos poll e poll_test
npm run db:migrate
npm run dev            # http://localhost:3000
```

Para o banco local, use `postgresql://poll:poll@localhost:5440/poll` nas duas variáveis. Os testes usam o banco `poll_test` (ou `TEST_DATABASE_URL`) e precisam do Postgres de pé.

O login usa o Supabase Auth (GitHub e link por e-mail). Preencha `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` e `ADMIN_EMAIL` no `.env`; o Supabase precisa ter `http://localhost:3000/api/auth/callback` entre as URLs de retorno. Só o e-mail em `ADMIN_EMAIL` vira administrador.

Os testes de sessão real usam um projeto Supabase separado, só de teste: copie as variáveis `TEST_*` do `.env.example` para `.env.test.local`. Sem elas, esses testes são pulados localmente; no CI, faltar alguma é erro.

## Comandos

| Comando                 | O que faz                                          |
| ----------------------- | -------------------------------------------------- |
| `npm run dev`           | Servidor de desenvolvimento                        |
| `npm run lint`          | ESLint                                             |
| `npm run format`        | Prettier                                           |
| `npm run typecheck`     | Checagem de tipos                                  |
| `npm test`              | Testes unitários, de integração e de API (Vitest)  |
| `npm run test:coverage` | Testes com cobertura                               |
| `npm run test:e2e`      | Testes ponta a ponta (Playwright)                  |
| `npm run db:up`         | Postgres local via Docker Compose                  |
| `npm run db:migrate`    | Migrações (prisma migrate dev)                     |
| `npm run db:seed`       | Seed (o administrador precisa ter entrado uma vez) |

## Saúde

`GET /api/health` → `200 { "status": "ok" }`, ou `503 { "status": "unavailable" }` se o banco não responder.
