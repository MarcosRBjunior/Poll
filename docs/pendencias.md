# Pendências

Itens decididos de forma provisória, com a fase em que devem ser revistos.

| Item | Situação atual | Rever na | Origem |
| --- | --- | --- | --- |
| `DATABASE_URL` sem pool na Vercel | Resolvido no Preview em 13/11/2026: o app usa `DATABASE_URL_POOLED` (`pooled.db.prisma.io`) quando ela existe (veja `docs/carga.md`). **Falta criar `DATABASE_URL_POOLED` na Production.** | F9 (carga) | F2, 20/10/2026 |
| Login por link de e-mail falha com o e-mail institucional | O Supabase volta com `otp_expired` ("missing code"). Causa provável: o filtro de segurança do e-mail abre o link antes da pessoa, e o link só vale uma vez. O GitHub funciona e o administrador entra por ele. Saídas possíveis: código de 6 dígitos (OTP) no lugar do link, ou testar com outro provedor de e-mail. | F9 | F3, 23/10/2026 |
| Projetos Supabase pausam por inatividade | No plano grátis, o Supabase pausa o projeto parado e o host deixa de responder: sem login em produção e sem os E2E com sessão. Em 07/11/2026 os dois projetos (produção e teste) estavam pausados e precisaram ser restaurados no painel. | F10 (checklist de produção) | F7, 07/11/2026 |
