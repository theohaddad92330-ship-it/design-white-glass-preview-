# Brief commun — chantier MODE ÉQUIPE, écrivains CLOUD (14/10/2026)

Épopée #4158. Tracker : `agent_docs/mode-equipe-2026-10-14.md` sur `origin/chantier/mode-equipe-14-10`. Lis ses §1 (décisions) et §2 (audit, avec des preuves `fichier:ligne` À RE-VÉRIFIER) avant de coder. Ton lot = les lignes du §4 qui portent ton numéro de lot.
Plafond : 300 tours. À 240 : commit de ce qui est vert, push, commentaire, STOP.

## Non négociable

- AUCUN sous-agent. Seul, en séquence.
- N'ÉDITE JAMAIS rien sous `.claude/`.
- Aucun envoi sortant réel. Un e-mail interne (notification à un collègue) passe par le mailer existant, est désactivé par défaut et n'est JAMAIS testé contre un vrai serveur.
- Les décisions sont TRANCHÉES (§1 du tracker) : ne t'arrête jamais sur « décision produit requise ». Un cas non couvert : prends le choix le plus conservateur compatible avec `CLAUDE.md` et `agent_docs/doctrine.md`, puis écris « tranché sans Louis : <choix> » dans ton commentaire. Un point qui HEURTE une doctrine : ne le code pas, nomme la règle.
- Droits et cloisonnement : tout ce que tu touches filtre par le `workspace_id` de l'espace ACTIF de l'appelant ET vérifie la permission. Chaque lecture ou écriture nouvelle a un test qui prouve qu'un utilisateur d'un AUTRE espace reçoit 404/403.
- Jamais de PR, jamais de push sur `main`, jamais `--force`, jamais `--no-verify`. Pousse APRÈS CHAQUE COMMIT : `git push -u origin HEAD:refs/heads/<TA BRANCHE>`.
- Base de données : ajout seulement. Migration : horodatage RÉEL en millisecondes, supérieur au max de `apps/api/src/migrations/` sur main, jamais un nombre rond. Valeur par défaut ou NULL accepté. Contrainte CHECK élargie AVANT le code qui écrit la nouvelle valeur.

## Setup

`git fetch origin && git checkout -B <TA BRANCHE> origin/main` ; `pnpm install --frozen-lockfile && pnpm --filter "./packages/**" build` puis `git checkout -- packages/figma-sync/generated`. Lis `CLAUDE.md`, `agent_docs/chantiers-livres.md`, `agent_docs/multi-user-workspaces.md` s'il existe. Lis ton brief et le tracker par `git show origin/chantier/mode-equipe-14-10:<chemin>`.

## Méthode

1. Pour chaque ligne de ton lot : `git grep` d'abord. Si c'est DÉJÀ LÀ (preuve `fichier:ligne` à l'APPELANT), ne le recode pas et note « déjà là ».
2. Le reste en TDD : test rouge d'abord, un test qui sait dire NON. Cherche les jumeaux (même défaut ailleurs).
3. Avant chaque push : tests CIBLÉS des fichiers touchés, `npx tsc --noEmit -p .` du paquet (0 erreur, compte-les), `npx prettier --check` des fichiers touchés, `pnpm lint:exports:types`. En fin de lot : suites complètes des seuls paquets touchés (`cd apps/web && npx vitest run`, `cd apps/api && npx jest`, `cd packages/contracts && npx vitest run`).
4. Compagnons : FR/EN, tutoiement (jamais vous/votre/vos, `lexicon.test.ts`) ; UNE entrée changelog FR/EN par lot (`packages/contracts/src/changelog`, id `2026-10-14-equipe-<lot>`, newest-first, `itemCount` exact) ; démo semée ou classée dans `apps/api/src/modules/demo/demo-coverage.ts` pour tout écran user-facing (craft rule n°9) ; fiche `agent_docs/*` mise à jour si un fichier de ses `sources:` change (job CI « La doc suit le code ») ; gardes de design (`apps/web/src/architecture/`) respectées (cibles ≥ 44 px, icône nommée, pas de hex dans le JSX, absence ≠ « 0 »).
5. Doctrine : aucune donnée fictive hors démo, aucun fournisseur nommé à l'écran, une absence ne fait AUCUNE ligne, aucune probabilité, aucun classement nominatif, e-mails/téléphones/noms toujours en clair, une correction humaine gagne.
6. Trace `// #4158.<n> — …` à l'endroit du comportement (n = numéro de ligne du tracker §4).

## Fin

Un commentaire sur #4158 : « Lot <Lx> cloud (14/10) — branche <br> @ <sha> », puis quatre listes : livré (#4158.n + SHA) · déjà là (fichier:ligne) · tranché sans Louis · reste (raison). Ajoute une ligne « Recette : <route> → <ce qu'on doit voir> » par point visible. N'édite PAS le tracker (l'intégrateur le fait). Rapport ≤ 15 lignes. STOP.
