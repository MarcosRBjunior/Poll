# Teste de carga (US-8.4)

Metas (spec, seção 10.1): envio de respostas com p95 abaixo de 500 ms; painel de resultados com p95 abaixo de 1,5 s com até 10 mil respostas.

## Como rodar

1. **Banco só para a carga.** O gerador recusa um banco que tenha pesquisas de outros donos, então ele nunca roda na produção.
2. **Migrar e popular:**
   ```bash
   export LOAD_DATABASE_URL=...   # conexão direta do banco de carga
   DATABASE_URL=$LOAD_DATABASE_URL DIRECT_URL=$LOAD_DATABASE_URL npx prisma migrate deploy
   npm run load:seed              # 10 mil respostas + 40 pesquisas vazias para o envio
   ```
   O gerador cria a pesquisa `carga-resultados` com os quatro tipos de pergunta e 10 mil respostas espalhadas por 90 dias. Também cria as pesquisas `carga-envio-01` a `carga-envio-40`. Cada lote de mil respostas custa 3 operações no Prisma Postgres. Rodar de novo apaga e recria só as pesquisas de carga.
3. **Medir:**
   ```bash
   npm run load:run -- https://endereco-do-deploy
   ```
   Se o preview estiver protegido, exporte antes `VERCEL_AUTOMATION_BYPASS_SECRET`, que fica em Deployment Protection → Protection Bypass for Automation. O script envia o valor no cabeçalho `x-vercel-protection-bypass` e não o imprime.

## O que o teste mede

O teste roda três cenários, com 10 conexões simultâneas:

| Cenário | Requisições | Meta do p95 |
| --- | --- | --- |
| `GET /api/v1/public/surveys/carga-resultados/results` | 300 | < 1.500 ms |
| Página T10 `/s/carga-resultados/results`, que também carrega os textos | 300 | < 1.500 ms |
| `POST .../responses` | 400 | < 500 ms |

- **Envios dentro do limite:** o limite é de 10 envios por minuto por IP e pesquisa. O teste distribui os 400 envios em rodízio pelas 40 pesquisas, 10 em cada, então nenhum recebe 429 e nenhuma proteção é desligada.
- **Cada envio é um navegador novo:** cookie e chave de idempotência próprios.
- **Falha:** qualquer status diferente do esperado (200 nas leituras, 201 nos envios) reprova o cenário, e o script sai com código 1.

## Resultados

| Data | Alvo | Resultados (API) p95 | Página T10 p95 | Envio p95 |
| --- | --- | --- | --- | --- |
| 12/11/2026 | Local: `next start` + Postgres no Docker | 388 ms | 1.419 ms | 186 ms |

Sobre a medição local:

- **Página T10 perto do limite.** Com 10 conexões, ela fica perto da meta porque tudo divide um processo Node e um pool de 3 conexões com o banco.
- **Sem concorrência.** Com uma conexão só, a página leva p95 194 ms e a API, 101 ms.
- **Banco não é o gargalo.** Com 10 mil respostas, a consulta mais pesada (contagem por opção) leva 86 ms. As varreduras sequenciais são esperadas, porque a pesquisa ocupa quase a tabela inteira. Não foi preciso criar índices.
