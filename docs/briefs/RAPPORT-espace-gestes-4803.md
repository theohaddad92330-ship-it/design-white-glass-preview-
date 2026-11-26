# Rapport #4803 — les 7 barrières `{id, user_id}` hors contacts.service.ts

Branche `claude/espace-gestes-4803` (base `origin/claude/n-demo-equipe-doctrine`). Sites AVANT → APRÈS (tous `contactGestureWhere(workspaceId, userId, id)` = OU espace / ancienne ligne du propriétaire) :

1. contact-enrichment.service.ts:97 `{id, user_id, deleted_at}` → clé de geste ; `workspaceContext` injecté (4e param.) ; forme `{contact_id, ok, code}` inchangée.
2. crm.service.ts:1348 (`adoptCrmValue`) `{id, user_id}` → clé de geste (+ `deleted_at` désormais filtré).
3. lemlist.service.ts:102 (`pushContact`) `{id, user_id, deleted_at}` → clé de geste.
4. lemlist.service.ts:163 (`leadsForContact`) idem → clé de geste (workspace de la clé Lemlist).
5. linkedin.service.ts:82 (`record`) `{id, user_id}` → clé de geste.
6. linkedin.service.ts:111 (`listForContact`) interactions `{user_id, contact_id}` → `{...workspaceScopeWhere, contact_id}` (la table porte `workspace_id` NOT NULL).
7. linkedin.service.ts:126+131 (`followUps`) interactions `{user_id}` → `workspaceScopeWhere` ; jointure `rows.map({id, user_id})` → `contactGestureWhere(…, ids dédoublonnés)`.
   Clé de geste : `apps/api/src/modules/contacts/contact-gesture-scope.ts` (fonction pure). `contacts.service.ts` l'importe (wrapper privé renommé `contactGestureTarget`). `git grep "export function contactGestureWhere"` = 1 définition ; la spec le garde aussi.
   Tests (jest ciblé, depuis apps/api, zod 3.25 présent) : `@bellum/contracts` ne démarre pas tel quel (`.guid`) → j'ai lancé avec une config TEMPORAIRE hors dépôt qui shimme `guid/prefault/partialRecord` (aucun fichier du dépôt touché). Résultat : 21 suites, Tests: 310 passed, 0 failed (specs neuves + enrichment ×5, lemlist, linkedin ×4, crm.service, demo-coverage/demo-team, module-boundaries). Sans shim : « Tests: 13 passed » + suites en échec sur `.guid` = environnement, pas mon code.
   Rouge→vert : `contact-gesture-scope.spec.ts` (37 tests : 7 gestes × collègue passe / autre espace refusé / ancienne ligne propriétaire passe / tiers refusé ; garde d'archi + extrait fabriqué + négatif légitime ; un dépôt NEUF par appel). Sur les 3 services restaurés à la base : Tests: 11 failed, 26 passed.
   Architecture : 7 gardes préexistantes rouges sur la base aussi (CHECK migrations, ci-status, cache-pnpm, ga-413, app-module-boots…) — sans lien. GA-07 (module-boundaries) montait de +1/+1 (WorkspaceContextService importé dans contact-enrichment.service) : plafonds relevés 354→355 / 175→176 avec note datée — décision à valider (alternative : exposer la résolution via ContactsService).
   Démo : classée `vide_a_dessein` avec raison (`DEMO_TEAM_COLLEAGUES_COVERAGE.contactCollecteParCollegue`) : semer un contact `user_id` = collègue touche reset/effacement par propriétaire, non vérifiable sans base ici. Question : accepter ce semis (UPDATE contacts.user_id dans la boucle des comptes portés) après lecture de demo-reset ?
   Non vérifié : tsc (rc 0 mais ~5 500 erreurs de typage dues à zod 3.25, aucune sur mes lignes après correction d'une dans ma spec), knip, CI complète. Aucune migration.
