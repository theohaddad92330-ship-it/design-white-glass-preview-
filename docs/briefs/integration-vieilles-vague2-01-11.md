# Intégration vieilles vague 2 (01/11) : L5-bis, L8, L13, L15

Branche `integration/vieilles-vague2-01-11`, depuis `origin/main`. Fusionne, dans l'ordre : `claude/vieilles-l5b-apercu-recherche` (contient L5), `claude/vieilles-l8-analyse-etapes`, `claude/vieilles-l13-routines`, `claude/vieilles-l15-missions`. Issues : #2152 #2157 #2164 #2843 #2408. L'intégration n'ajoute aucune fonctionnalité et ne répond à aucune question des rapports de lots.

Périmètre : `apps/api/src/modules/{analysis,delivery,routines,demo,pipeline-detections,target-lists}/**`, `apps/api/src/{migrations,database/entities,architecture}`, `apps/web/src/features/{accounts,automations,contacts,discover,missions,routines,target-lists}/**`, `apps/web/src/i18n/locales/**`, `apps/web/src/test`, `packages/contracts/src/schemas/**`, `e2e/tests/web`, `agent_docs`, `changes`, `docs/briefs`.

## Droits

- Aperçu d'une recherche enregistrée et création de liste de cibles depuis elle (L5-bis, #2157.57) : `records:write` (test de métadonnée).
- Routines (L13, #2843) : `POST /routines/:key/run-now` et bouton « Lancer maintenant » ; refus nommés demo / blocked / already_running ; `duration_ms` lu en back-office seul (`internal/admin/routines/runs`), jamais renvoyé au client.
- Analyse (L8, #2164.17) : la question d'identité d'entité (`GET /analysis/:id/entity-question`, `POST /analysis/:id/entity-answer`) est ouverte à qui lance l'analyse, par NOM seulement ; sans réponse en 5 min, reprise sur l'hypothèse. Aucune valeur neuve en base.
- Missions (L15, #2408) : marge, revenu et coût = `finance:read` / `canReadFinance` ; sans lui, ni tuile de facturation, ni colonne Marge, ni vue financière ; owner et périmètre portefeuille inchangés.

## Je ne fais pas

- Les étapes d'analyse 2164.4 / .5 / .6 et la sélection transmise à Laura (2164.57) : non faits dans L8, non repris ici.
- Aucune réponse aux questions des rapports de lots (Q1-Q4 de L8, questions L5-bis, L13, L15).
- Rien de Laura V8 (#5032-#5048), rien de #4962-#5029, rien de #4945, rien de ManagerDashboardPage.
- Pas de vue « revenu menacé » ni de tuiles renouvellement/dispo/marge (décision « loi 4 » de L15).

## Je défais

- Rien. Conflits : `Discover.tsx` (imports, dialogue de L5-bis gardé, hook de main sans appelant retiré, panneau territoire déjà retiré sur main) ; `agent_docs/database_schema.md` (sections de L13 et L15 gardées avec celle de main).
