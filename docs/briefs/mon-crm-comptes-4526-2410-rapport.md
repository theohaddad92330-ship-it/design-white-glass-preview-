# Rapport — MON-CRM-COMPTES (#4526.1/.2/.3/.5/.6/.7), 24/10

Branche `claude/mon-crm-comptes-2410`, sans PR.

1. **#4526.2 API — fait.** `CRM_LINKED_ACCOUNT_PREDICATE` (`account-crm-linked.ts`), filtre `crm=only` dans le contrat et
   `findAccountsByWorkspace`. Tests : `account-crm-linked.spec.ts` (origin crm/import inclus, origin NULL + affaire/activité/contact
   CRM inclus, discover exclu, `workspace_id` borné), `accounts.crm-filter.spec.ts`. `origin` jamais écrit (garde `account.entity.ts`).
2. **#4526.5 compteur — fait.** `counters.crm`, même prédicat ; zéro ⇒ puce masquée. `accounts.headline-counters.spec.ts` ajusté (+1 compteur).
3. **#4526.1/.3 web — fait.** `AccountsCrmChip.tsx`, `crm=only` dans l'URL (`accountsSearch.ts`, `api.ts`), combinable avec Suivis/Favoris.
   Tests : `AccountsCrmChip.test.tsx`, `accounts.filter-serialisation.test.ts` (la garde a rougi, SAMPLES complété).
4. **#4526.6 libellé — fait (partiel).** Nom lu via `clientToolName` du registre (GA-44 interdit tout littéral) ; seul le CRM de
   `useCrmStatus` (HubSpot aujourd'hui) est connu du front. Autres CRM : « Mon CRM ». FR + EN. Test : `crmName.test.ts`.
5. **#4526.7 démo — fait.** `origin='crm'` sur ENGIE et BNP Paribas (`crmOrigin` dans `briefDossier`), `DEMO_PORTFOLIO_COUNTERS.crm` seedé.
   Tests : `demo-mon-crm-coverage.spec.ts`, `demo-portfolio-counters-coverage.spec.ts`, `demo-coverage.spec.ts`.
6. **Changelog — fait.** `2026-10-24-mon-crm-comptes`, FR + EN (`changelog` vitest vert).

Vérifs : web `src/architecture` 242 fichiers, 1 rouge (GA-44, corrigé puis vert) ; `tsc` api = 3 erreurs `@bellum/email` non
construit (environnement, hors lot) ; `tsc` web = 0 error TS.

## À trancher

- La puce reste visible si active même à 0 (sinon impossible de la relâcher) ; brief : zéro ⇒ masquée.
- Contacts : lien CRM borné par `account_id` seulement (`contacts.workspace_id` est nullable).
- Le test contrat `crm` a été écrit avec le code, pas avant (les autres : rouge d'abord).
- Test existant modifié : `demo-discover-origin-verdict-coverage.spec.ts` (autorise `crm` en plus de null ; garde #3914 gardée).
