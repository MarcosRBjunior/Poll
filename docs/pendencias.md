# Pendências

Itens decididos de forma provisória, com a fase em que devem ser revistos.

| Item | Situação atual | Rever na | Origem |
| --- | --- | --- | --- |
| `DATABASE_URL` sem pool na Vercel | A integração do Prisma Postgres cria `DATABASE_URL` com a conexão direta (`db.prisma.io`) e não permite editá-la. O app usa essa URL com pool local de 3 conexões. Para usar `pooled.db.prisma.io`, reconectar os bancos com outro prefixo e criar `DATABASE_URL` à mão. | F9 (carga) | F2, 20/10/2026 |
