# Pendências

Itens decididos de forma provisória, com a fase em que devem ser revistos.

| Item | Situação atual | Rever na | Origem |
| --- | --- | --- | --- |
| `DATABASE_URL` sem pool na Vercel | Resolvido em 13/11/2026: o app usa `DATABASE_URL_POOLED` (`pooled.db.prisma.io`) quando ela existe. A variável foi criada no Preview e na Production (veja `docs/carga.md`). Conferir na produção depois do deploy da F9C. | F9 (carga) | F2, 20/10/2026 |
| Login por link de e-mail falha com o e-mail institucional | Resolvido na F9D (13/11/2026): login por código de 6 dígitos. Os modelos "Magic Link" e "Confirm signup" dos projetos Supabase mostram só `{{ .Token }}`, sem link, porque link e código usam o mesmo token. | F9 | F3, 23/10/2026 |
| Projetos Supabase pausam por inatividade | No plano grátis, o Supabase pausa o projeto parado e o host deixa de responder: sem login em produção e sem os E2E com sessão. Em 07/11/2026 os dois projetos (produção e teste) estavam pausados e precisaram ser restaurados no painel. | F10 (checklist de produção) | F7, 07/11/2026 |
