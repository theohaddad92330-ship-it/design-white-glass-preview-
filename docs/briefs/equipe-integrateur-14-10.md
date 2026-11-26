# Intégrateur — chantier MODE ÉQUIPE (14/10/2026), passe 1

Épopée #4158. Tracker : `agent_docs/mode-equipe-2026-10-14.md` sur `origin/chantier/mode-equipe-14-10`. Lis `docs/briefs/equipe-commun-14-10.md` (mêmes interdits, même doctrine).
Ta branche : `integration/equipe-14-10`. Plafond : 300 tours. À 240 : commit, push, commentaire, STOP.

## Non négociable

- AUCUN sous-agent. N'édite rien sous `.claude/`. Jamais de push sur `main`, jamais `--force`, jamais `--no-verify`. Pousse après chaque fusion verte : `git push -u origin HEAD:refs/heads/integration/equipe-14-10`.
- N'ouvre PAS de PR (le fil principal le fera quand les 7 lots seront dedans).
- Un conflit se résout en GARDANT LES DEUX CÔTÉS. Jamais `-X ours/theirs` à l'aveugle.

## Étapes

1. `git fetch origin && git checkout -B integration/equipe-14-10 origin/main`, puis setup comme le brief commun.
2. Fusionne dans cet ordre, `git merge --no-ff` : `origin/claude/equipe-l1-14-10`, `origin/claude/equipe-l2-14-10`, `origin/claude/equipe-l6-14-10`. Après CHAQUE fusion : `npx tsc --noEmit -p .` des paquets touchés (0 erreur) et les tests ciblés des fichiers en conflit.
3. Points connus :
   - **Migrations** : horodatages uniques et strictement croissants, tous > max(main). Renomme un doublon (fichier ET classe) si deux lots ont pris le même.
   - **Changelog** (`packages/contracts/src/changelog`) : garde toutes les entrées, newest-first, `itemCount` exact, parité FR/EN.
   - **demo-dataset.ts / demo-coverage.ts** : L2 est la SOURCE des collègues fictifs (`DEMO_COLLEAGUES`). Tout autre lot aligne ses identifiants dessus.
   - **action-plan-items.service.ts** : L1 (lecture par espace, libération au retrait) et L3 (notif délégation) y touchent. Garde les deux comportements.
4. Compléments à coder (TDD), car les rapports de lots les ont laissés en « reste » :
   - **#4158.34** L6 a posé `is_private` + filtre, mais AUCUN geste ne marque un objet privé. Ajoute l'écriture (API PATCH sur projet/besoin/mission, permission : porteur ou `team:manage`) et un interrupteur « Privé » sur la fiche de l'objet. Défaut inchangé (partagé).
   - **Jumeau L1 (b)** : le retrait d'un membre depuis le back-office (`apps/api/src/modules/admin/admin.service.ts` ~l.539, `members.delete` seul) doit libérer le portefeuille ET les actions comme `removeMember` (réutilise la même fonction).
   - **L2 reste** : `/onboarding` tapé à la main par un membre en attente ne doit pas proposer l'accueil « reprise » des questions entreprise.
5. Fin de passe 1 : SUITES COMPLÈTES des paquets touchés (`cd apps/api && npx jest`, `cd apps/web && npx vitest run`, `cd packages/contracts && npx vitest run`, dashboard-manager s'il est touché), logs dans des fichiers. Un rouge préexistant sur main se nomme avec la preuve (même test rouge sur `origin/main`), il ne se masque pas.
6. Commentaire sur #4158 : « Intégration passe 1 — integration/equipe-14-10 @ <sha> » : lots fusionnés, conflits résolus (fichier → décision), compléments livrés, résultat des suites (chiffres), rouges préexistants prouvés. Rapport ≤ 15 lignes. STOP.
