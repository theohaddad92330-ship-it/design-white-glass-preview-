# Rapport N5 — claude/coque-droits-28-10

Branche `claude/coque-droits-28-10` (SHA : voir le dernier commit poussé). Base origin/main 719dd9d9. Pas de PR.

**Constat d'antériorité : #4630, #4648, #4654 sont DÉJÀ sur main** (186da648, 0a58e8de+b5524993+4d86b6e3, ad4a15d4) — je ne les ai pas recodés. Relancés verts : 4 specs web (33 tests : garde `un-role-perime-ne-decide-pas`, `useTeam.stale-role`, `CustomerPageContent.guide-slot`, `NotificationBell`) + 2 specs API notifications (78 tests) + `MyDataTabs.test.tsx` (refus membre).

- **#4630 (droits)** : appelant `useSettledTeam.ts` ← `useTeam` / `lib/permissions.ts` ← `MyDataTabs.tsx`, `SectionTabs`, `SettingsNavbarBody`. Refus gardé par `MyDataTabs.test.tsx` (membre, rôle inconnu, ?tab=imports) et `useTeam.stale-role.test.tsx`. Aucune règle serveur touchée.
- **#4648** : suppression scopée `user_id`, cron et bouton sur le même `removeWhere`. Non lu par moi : le test « 6 jours reste » (couvert par la spec service, passée).
- **#4654** : livré par ad4a15d4 ; la mesure ~44 px avant/après en navigateur n'a PAS été refaite ici.
- **#4669.1 (livré ici)** : `billing-view-model.ts` `seatsOverBy` → `PlanCard.tsx` ; tests `billing-view-model.test.ts` (rouge → vert) et `PlanCard.test.tsx`.
- **#4669.2 (jumeau, livré)** : `TeamView.tsx` badge « N / M sièges » avait le même défaut ; test `TeamView.test.tsx`.

**Jumeau NON corrigé** : `TeamAdminView.tsx:163,197` (`members.seats` / `members.summary`) affiche aussi `used`/`total` — à traiter si cet écran est atteignable.

**Portes** : `turbo build --filter ./packages/*` 0 · `tsc --noEmit apps/web` 0 erreur (exit 0) · vitest ciblé 47 tests verts (exit 0) · jest notifications 78 verts · prettier appliqué. `pnpm lint:exports:types` non lancé (aucun type exporté ajouté).

**Mesures demandées non faites** : délai (ms) du rôle périmé avant/après et nombre de notifications purgées sur le jeu de démo — il faut un navigateur / la base de démo.

**Questions** : (1) la cause de « 2 / 1 » est-elle un vrai siège non payé ou un `seats_total` faux ? L'écran dit désormais le fait sans trancher ; `credits.service.ts:1322` calcule `planConfig.seats + extra_seats`. (2) Les points ouverts de #4648 (épargner `urgent`/`critical`, heure du cron) sont restés tels que main les a laissés.
