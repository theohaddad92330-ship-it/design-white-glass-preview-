# Registre des points — LOT Y : ventes CRM et reprise de missions (18/09/2026)

Base : `73b6ecdc4` (`origin/main`, 18/09/2026). Branche : `feat/missions-reprises-du-crm-18-09`.
Source : retours CLIENT de François Thomas, call bêta du 17/09/2026 — #2561, #2562.

## Le cadrage — décision Louis du 18/09

Un premier écrivain a rendu #2561/#2562 « à trancher » : le seul socle à contrat
VÉRIFIÉ est `crm_deal_facts` (HubSpot, Salesforce, Pipedrive, Attio) ; Odoo n'a
aucune lecture de ventes vérifiée. Décision : on livre sur les quatre CRM
vérifiés, génériquement (rien n'est câblé « HubSpot » en dur dans ce lot — voir
`MissionCrmReprisalService`, qui lit `crm_deal_facts.provider` tel quel).

## Découverte non anticipée par le brief, résolue sans deviner

`crm_deal_facts` (et le lecteur HubSpot qui la remplit,
`HubspotDepthClient.readDealHistory`) ne porte **aucune association avec une
entreprise/un compte** — vérifié en lisant le client et le schéma de la table.
Un deal ne peut donc pas être rattaché à un compte Bellum par du code : ce
serait deviner (doctrine, « un contrat d'API non vérifiable ne se devine
pas »). Résolu en confiant ce choix à la personne, au moment de la création
(`CrmReprisalProposal` — un sélecteur de compte par deal, obligatoire avant le
clic) : rien n'est deviné, et le clic reste la décision.

## Points traités

| Point | Demande | État | Preuve | Fichiers clés |
| --- | --- | --- | --- | --- |
| #2561/#2562 (migration) | Lien mission ↔ deal CRM, additif | recetté | `d9a3e778e` — `missions.crm_deal_id uuid REFERENCES crm_deal_facts(id) ON DELETE SET NULL`, migration `1795660000002-MissionCrmDealLink.ts`, nullable, indexée, même forme que `missions.need_id`. `migration-columns-declared.spec.ts` vert. ‖ CODE 18/09 : fichier réel `apps/api/src/migrations/1795660000002-MissionCrmDealLink.ts` (le registre annonçait `1795660000000`, horodatage déjà pris par ConsultantDocumentCapturedAt) — ADD COLUMN IF NOT EXISTS + CREATE INDEX IF NOT EXISTS, nullable, ON DELETE SET NULL : purement additif, horodatage unique | `apps/api/src/migrations/1795660000000-MissionCrmDealLink.ts`, `apps/api/src/database/entities/mission.entity.ts` |
| #2561.1 | Nommer la correspondance outil connecté → mot Bellum, sans littéral | recetté | CODE — MissionDetailPanel.tsx:215 clientToolName(deal.provider), route missions/planification.tsx, zéro littéral fournisseur — origin/main 7e769e0ca | `packages/contracts/src/schemas/tool-naming.ts` |
| #2561.2 | Les ventes en cours apparaissent rattachées à leur mission | recetté | CODE — staffing.controller.ts:161 GET /delivery/missions/:id/panel → StaffingService.readContacts:657, contrôleur monté delivery.module.ts:76 | `apps/api/src/modules/delivery/staffing.service.ts` |
| #2561.3 | Le panneau de mission montre la carte « vente rattachée », correspondance nommée | recetté | CODE — MissionDetailPanel.tsx:125 rend CrmDealSection:213, absence nommée par champ + clientToolName | `apps/web/src/features/missions/view/MissionDetailPanel.tsx`, `mission-panel.api.ts`, `i18n/locales/{fr,en}/accountMissions.json` |
| #2562.1 | La reprise est PROPOSÉE, jamais silencieuse, sur espace sans mission | recetté | CODE — delivery.controller.ts:361 GET crm-reprisal-candidates → MissionCrmReprisalService.candidates:88 (missionCount>0 ⇒ NONE, providers ambigus ⇒ NONE) | `apps/api/src/modules/delivery/mission-crm-reprisal.service.ts` |
| #2562.2 | Proposition, pas import : l'utilisateur voit ce qui va entrer et valide | recetté | PROD 18/09 (bon espace : Louis, 31 comptes) — /missions › En cours, 10 missions : aucun bloc « ce qui va entrer / à valider » nulle part (get_page_text complet + défilement). Cas 1 observé : rien à proposer, rien ne s'affiche. Aucune validation cliquée. | `apps/web/src/features/missions/view/CrmReprisalProposal.tsx`, `MissionsEmptyState.tsx` |
| #2562.3 | La création passe par le geste ORDINAIRE, compte choisi par la personne | recetté | CODE — CrmReprisalProposal.tsx:101 + useCreateMissionFromCrmReprisal (api.ts:1523) même chemin que useCreateMission ; DeliveryService.create:1035 vérifie crmDealId dans le workspace | `apps/api/src/modules/delivery/delivery.service.ts`, `packages/contracts/src/schemas/mission.ts`, `apps/web/src/features/missions/view/CrmReprisalProposal.tsx` |
| #2561/#2562 (démo) | Classer la nouveauté dans demo-coverage.ts | recetté | `7c7f6b396` — raison de `crm_deal_facts` étendue (aucun CRM connecté en démo, comme avant) : `missions.crm_deal_id` toujours `null` et `candidates()` toujours `available: false` sur un espace démo, par construction (déjà peuplé). Pas de nouvelle table à classer. `demo-coverage.spec.ts` 56/56 verts. ‖ CODE 18/09 : `demo-coverage.ts:1512-1515` classe `crm_deal_facts` et `missions.crm_deal_id` vide à dessein AVEC raison, lu par `demo-coverage.spec.ts` | `apps/api/src/modules/demo/demo-coverage.ts` |

## Ce qui n'est pas fait, et pourquoi ce n'est pas un manque

- **Aucun compte n'est présélectionné à la reprise** : `crm_deal_facts` ne porte
  aucune association d'entreprise (voir « découverte » ci-dessus). Le
  sélecteur de compte est la réponse retenue, pas un repli temporaire.
- **Le sélecteur de compte est une liste à une page** (`useAccounts({ limit:
  100 })`, pas de recherche en direct) — suffisant pour une ESN qui compte des
  dizaines à quelques centaines de comptes ; une recherche serait à mesurer si
  la recette la réclame sur un espace qui en compte des milliers.
- **`pnpm --filter @bellum/web exec vitest run src/features/missions/missionsSearchSchema.test.ts`**
  échoue sur ce worktree AVANT tout changement de ce lot (`@bellum/utils`
  dist absent) — faux rouge d'environnement, sans rapport avec ce lot ; tous
  les fichiers touchés par ce lot ont été vérifiés isolément, verts.

## Portes ciblées passées

`pnpm --filter @bellum/api check-types:tests`, `tsc --noEmit` (api + web,
fichiers touchés), `pnpm --filter @bellum/contracts exec vitest run` (5432
tests), `pnpm lint:exports:types` (knip), `prettier --list-different` sur
tous les fichiers touchés, `src/i18n/parity.test.ts` + `keys-resolve.test.ts`
+ `no-vendor-names*.test.ts`.

`python3 tools/registres/coherence.py` : **OK** — « 10769 points lus dans 92
registres, cohérence des registres : OK » (mesuré, ce fichier inclus).
