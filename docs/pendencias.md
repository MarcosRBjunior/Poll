# Pendências

Itens decididos de forma provisória, com a fase em que devem ser revistos.

| Item | Situação atual | Rever na | Origem |
| --- | --- | --- | --- |
| `DATABASE_URL` sem pool na Vercel | A integração do Prisma Postgres cria `DATABASE_URL` com a conexão direta (`db.prisma.io`) e não permite editá-la. O app usa essa URL com pool local de 3 conexões. Para usar `pooled.db.prisma.io`, reconectar os bancos com outro prefixo e criar `DATABASE_URL` à mão. | F9 (carga) | F2, 20/10/2026 |
| Login por link de e-mail falha com o e-mail institucional | O Supabase volta com `otp_expired` ("missing code"). Causa provável: o filtro de segurança do e-mail abre o link antes da pessoa, e o link só vale uma vez. O GitHub funciona e o administrador entra por ele. Saídas possíveis: código de 6 dígitos (OTP) no lugar do link, ou testar com outro provedor de e-mail. | F9 | F3, 23/10/2026 |
| Projetos Supabase pausam por inatividade | No plano grátis, o Supabase pausa o projeto parado e o host deixa de responder: sem login em produção e sem os E2E com sessão. Em 07/11/2026 os dois projetos (produção e teste) estavam pausados e precisaram ser restaurados no painel. | F10 (checklist de produção) | F7, 07/11/2026 |
