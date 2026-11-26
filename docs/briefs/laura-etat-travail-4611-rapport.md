# #4611 — Laura lit l'état du travail lancé

Branche `claude/laura-etat-travail-4611` (base origin/main 38e9fc6e8a). Aucune PR.

**Fait**

- Outil de LECTURE `get_work_status` (apps/ia, en fin de `CHAT_TOOLS`, avant `push_profile`), carte `file_export`, libellé d'étape, droits (lecture seule).
- Pont `POST /internal/copilot/work/status` (`copilot-work-status.controller.ts`) : lots d'analyses (lancées, rendues, partielles, en erreur avec nom + raison, en cours, à confirmer, annulées, depuis quand), imports (`ImportOverviewForLauraService`, même source que l'écran), dernier run de chaque connecteur CRM. Rien d'inventé : endpoints/services existants réutilisés.
- Chaque chiffre est un compte par état (`summarizeAnalysisBatch`), jamais une soustraction. Une famille injoignable = `measured: false` + raison, jamais « 0 ».
- Cloisonnement : `portfolioScopeFor` ; espace restreint → seuls les lots/synchros lancés par la personne (filtre SQL `created_by`).
- Démo : les 4 tables lues sont déjà semées et classées « seedées » ; garde `demo-work-status-coverage.spec.ts`. Aucune entrée déplacée vers « vide à dessein ».

**Tests (rouge → vert)** : jest `copilot-work-status.controller.spec.ts` (8), `demo-work-status-coverage.spec.ts` (3), analysis-batches (vert) ; pytest `test_chat_get_work_status_tool.py` (8) + coverage/rights/cache-prefix/step-labels (vert).

**PAS fait**

- Enrichissements et rattrapages ciblés : aucune lecture à l'échelle de l'espace n'existe (enrichissement = par compte) ; ils sont NOMMÉS « non mesurés » dans `not_measured`, pas lus. Les lire demande un nouvel endpoint (hors « n'en invente pas »).
- Pas de routage forcé de l'intention « où en est… » vers l'outil (intent_router) : seule la description l'impose ; le garde-fou « aucun résultat d'outil » reste le filet.
- Signalement spontané : hors périmètre, non touché.
- « À quelle étape » : le lot n'expose que l'état par sous-job (en file / en cours…), pas la phase interne de chaque analyse.
- `tsc` API : seules erreurs = `@bellum/email` non construit (préexistant). `GA-65` (`account_crm_fusions`) échoue déjà sur main, non lié.
