# Poll — Criador de Enquetes

O administrador cria pesquisas sem código, qualquer pessoa responde por link e os resultados viram gráficos, números e um painel de tendências.

Projeto 07 do Portfólio Boost Program. Especificação em [`docs/spec.md`](docs/spec.md).

> Em construção — fase atual: **2, Banco**. Produção: https://poll-chi-six.vercel.app

## Stack

Next.js (App Router) · React · TypeScript estrito · TailwindCSS · Zod · Prisma + Prisma Postgres · Supabase Auth · Chart.js · Vitest · Playwright · Vercel.

## Rodando localmente

Requer Node 24+ e Docker.

```bash
npm install
cp .env.example .env
npm run dev            # http://localhost:3000
```

## Comandos

| Comando                 | O que faz                                         |
| ----------------------- | ------------------------------------------------- |
| `npm run dev`           | Servidor de desenvolvimento                       |
| `npm run lint`          | ESLint                                            |
| `npm run format`        | Prettier                                          |
| `npm run typecheck`     | Checagem de tipos                                 |
| `npm test`              | Testes unitários, de integração e de API (Vitest) |
| `npm run test:coverage` | Testes com cobertura                              |
| `npm run test:e2e`      | Testes ponta a ponta (Playwright)                 |
| `npm run db:up`         | Postgres local via Docker Compose                 |
| `npm run db:migrate`    | Migrações (a partir da fase 2)                    |
| `npm run db:seed`       | Seed (a partir da fase 2)                         |

## Saúde

`GET /api/health` → `200 { "status": "ok" }`.
