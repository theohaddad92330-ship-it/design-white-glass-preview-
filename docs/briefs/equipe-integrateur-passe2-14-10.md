# Intégrateur — chantier MODE ÉQUIPE (14/10/2026), passe 2

Épopée #4158. Applique `docs/briefs/equipe-commun-14-10.md` et les règles « Non négociable » de `docs/briefs/equipe-integrateur-14-10.md` (même branche). Ta branche : `integration/equipe-14-10` (la passe 1 y a déjà fusionné L1, L2, L6 + compléments : lis son commentaire sur #4158).
Plafond : 300 tours. À 240 : commit, push, commentaire, STOP.

## Étapes

1. `git fetch origin && git checkout -B integration/equipe-14-10 origin/integration/equipe-14-10`, puis setup.
2. Fusionne `--no-ff`, dans cet ordre : `origin/claude/equipe-l3-14-10`, `origin/claude/equipe-l4-14-10`, `origin/claude/equipe-l5-14-10`, `origin/claude/equipe-l7-14-10`. Après CHAQUE fusion : `tsc` des paquets touchés (0 erreur) + tests ciblés des fichiers en conflit. Conflit = on garde les deux côtés.
3. Alignements connus :
   - **Collègues démo** : `DEMO_COLLEAGUES` (L2) est la seule source des ids. L3 (notifications), L4 (garde-fous), L5 (`demo-team-continuity.ts`) ont posé leurs propres ids : remplace-les par ceux de L2. Un test prouve qu'aucun id de collègue démo n'existe hors de `DEMO_COLLEAGUES`.
   - **Préférences e-mail** : L3 a créé les interrupteurs, L5 lit `manager_digest` sur `notification_preferences`. UNE seule table, UNE seule clé, défaut désactivé.
   - **Notifications** : L5 dépose `manager_digest` dans la boîte. Utilise le service de L3, pas un second chemin.
   - **`action-plan-items.service.ts`** : L1 (lecture par espace, libération au retrait), L3 (notif de délégation), L5 (note obligatoire). Les trois comportements restent.
   - **Migrations** : horodatages uniques, strictement croissants, tous > max(main). Renomme les doublons (fichier ET classe).
   - **Changelog** : toutes les entrées, newest-first, `itemCount` exact, parité FR/EN.
   - **Gels GA-07 et autres gardes à compteur** : recalcule APRÈS fusion (chaque lot a relevé le sien depuis main).
4. Complément à coder (TDD), trouvé par L5 : **`GET /manager/team-stats`** (`manager.service.ts`, refondu par L7) ne porte AUCUN périmètre BU. `unassignedAccounts`, `duplicateCoverage`, `sharedActions`, `recentActivity` et les nouveaux blocs de L7 doivent appliquer le même périmètre BU que `accounts.controller.ts`. Un test prouve qu'un `team:manage` cloisonné à une BU ne voit aucun compte d'une autre BU.
5. **Les défauts d'intégration se trouvent AVANT la PR (Louis 14/10)** : sur le diff `origin/main...HEAD`, lance `npx vitest related <fichiers>` (web, contracts) et `npx jest --findRelatedTests <fichiers>` (api). Puis `git grep` les attendus figés que les lots ont pu casser : `toEqual({` sur les payloads touchés (team-stats, notifications, esn-profile, workspace, accounts), fixtures nommées, specs `e2e/` « golden journey » ou contrat qui nomment ces routes. Corrige-les dans ce passage, pas en CI.
6. SUITES COMPLÈTES : `cd apps/api && npx jest`, `cd apps/web && npx vitest run`, `cd packages/contracts && npx vitest run`, dashboard-manager s'il est touché. Logs dans des fichiers. Un rouge préexistant se prouve rouge sur `origin/main` aussi, sinon il est à toi.
7. Commentaire sur #4158 : « Intégration passe 2 — integration/equipe-14-10 @ <sha> » : lots fusionnés, conflits (fichier → décision), alignements, complément BU, défauts trouvés en amont (liste), suites (chiffres), rouges préexistants prouvés. Rapport ≤ 15 lignes. STOP. N'ouvre PAS la PR.
