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

A medição feita daqui inclui o trajeto da rede: Brasil → borda da Vercel em São Paulo (`gru1`) → função em Washington (`iad1`), perto do banco. Esse trajeto soma uns 300 ms por requisição. O tempo dentro do servidor vem do campo `durationMs` dos logs (`vercel logs --json`).

| Data | Alvo | Conexões | Resultados (API) p95 | Página T10 p95 | Envio p95 |
| --- | --- | --- | --- | --- | --- |
| 12/11/2026 | Local (`next start` + Docker) | 10 | 388 ms | 1.419 ms | 186 ms |
| 13/11/2026 | Preview, conexão direta | 10 | 881 ms | 2.722 ms | 619 ms, com 40 erros 500 |
| 13/11/2026 | Preview, com pool | 10 | 887 ms (servidor: 591) | 2.854 ms | 812 ms (servidor: 505) |
| 13/11/2026 | Preview, com pool | 3 | 563 ms (servidor: 237) | 1.048 ms | 578 ms (servidor: 233) |
| 13/11/2026 | Preview, com pool | 1 | 525 ms | 738 ms | — |

### O que a carga mostrou

- **Conexão direta derruba o app.** Os 40 erros 500 eram `too many connections`. No plano grátis, o Prisma Postgres aceita poucas conexões diretas, e cada instância da função abre as suas. Mesmo depois da carga, as instâncias paradas ficaram minutos segurando 29 conexões ociosas, e o deploy seguinte falhou na migração. Correção: o app usa `DATABASE_URL_POOLED` (`pooled.db.prisma.io`) quando ela existe e devolve conexões ociosas depois de 5 s. Com o pool, não houve mais erro.
- **Banco não é o gargalo.** Com 10 mil respostas, as consultas levam dezenas de milissegundos.
- **Com 3 acessos simultâneos, as metas passam no servidor.** Dados: resultados p95 237 ms, envio 233 ms. A página T10 fica em 1.048 ms medida daqui.
- **Com 10 acessos simultâneos, a página T10 passa da meta.** A Vercel coloca vários acessos na mesma instância. A página faz umas 7 consultas, e cada instância tem 3 conexões, então as consultas fazem fila. Se a página precisar aguentar esse volume, as saídas são: cache dos resultados limpo a cada envio (CT-13 exige ver o resultado atualizado) ou juntar as consultas dos textos.
