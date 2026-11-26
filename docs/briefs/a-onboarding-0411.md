# Lot A — Onboarding : retrouver ses réponses, cadrage honnête (#4364, #4875)

Contrat validé par Louis le 04/11/2026 (QCM), décision du 31/10 MAINTENUE pour #4875.1.

## Compris

On ne retrouve pas facilement « Revoir mes réponses », et le cadrage se dit « complet » alors qu'une clé exigée vaut « Je ne sais pas encore ».

## Je fais (points)

- **#4364.2** — un lien direct et PERMANENT depuis la page d'accueil (Aujourd'hui) vers la reprise / relecture de l'onboarding (aujourd'hui seul le bandeau de reconfiguration existe, `apps/web/src/components/page/CustomerPageContent.tsx:159`, conditions `apps/web/src/features/onboarding/lib/onboarding-gate.ts:163-173`).
- **#4364.4** — « Revoir mes réponses » (`ReconfigureAnswersSection`, monté dans `apps/web/src/features/profile/view/ProfilePage.tsx` ~l.117) visible dans le PREMIER écran de Paramètres › Profil, pas enfoui en bas. Test de position (ordre des sections).
- **#4875.1** — « Je ne sais pas encore » sur une clé EXIGÉE reste ACCEPTÉ (décision Louis 31/10, `.claude/notes/arbitrages-louis-2026-10-31-qcm-numerotation.md:30`) : statut persisté, l'espace s'ouvre. Le cadrage le NOMME « à préciser ».
- **#4875.2** — le cadrage (`apps/web/src/features/onboarding/components/FramingValidationBlock.tsx` ~l.76) et la porte (`isAnswerFilled`, `packages/contracts/src/schemas/onboarding-answer-contract.ts`, `onboarding.ts` ~l.698) jugent la clé de la MÊME façon : un test commun dans `packages/contracts` qui les compare sur une clé exigée de type liste valant « Je ne sais pas encore ».
- **#4875.3** — le cadrage ne se dit JAMAIS « complet » si la relecture (`/onboarding/$id/review`) nomme un manque ou un « à préciser » ; test : 4 clés liste en « Je ne sais pas encore » ⇒ pas de « complet ».

## Je ne fais PAS

Aucune nouvelle question d'onboarding, aucune refonte du parcours, aucun blocage de l'ouverture de l'espace par « Je ne sais pas encore ».

## Droits

Inchangés (chaque utilisateur ne voit que ses propres réponses).

## Je défais

Rien. Garde #4875.1 (31/10), #2022 (ReconfigureAnswersSection), #4364.1 (bandeau).

Périmètre : apps/web/src/components/page/, apps/web/src/features/onboarding/, apps/web/src/features/profile/, packages/contracts/src/schemas/onboarding*.ts, apps/web/src/i18n/locales/, apps/web/src/features/changelog/, apps/api/src/modules/demo/

## Règles communes (toutes les routines de cette vague, 04/11/2026)

- **Plafond : 300 tours.** À 240 : commit de ce qui est vert, push, rapport, STOP.
- **Base** : ta branche `claude/a-onboarding-0411` est créée depuis `origin/main` (`e29b6a7e0f`) et contient déjà ce brief. Travaille dessus, jamais sur main.
- **Avant la première ligne** : `git grep` sur `origin/main` ET sur les branches `origin/claude/*` récentes pour chaque point. S'il est déjà là, ne recode rien : écris `déjà là — fichier:ligne (appelant fichier:ligne)` dans le rapport. Lis `CLAUDE.md` (Doctrine) et `agent_docs/chantiers-livres.md` pour le sujet touché.
- **TDD** : test qui échoue d'abord, puis le code. Un test qui sait dire NON.
- **Tests CIBLÉS seulement** (≤ 5 fichiers de spec) + `tsc` du paquet touché. Si du TS est touché : UNE fois `pnpm exec turbo run build --filter=<paquet>^...`, puis `pnpm --filter <paquet> run check-types 2>&1 | grep 'error TS'` doit rendre zéro ligne avant chaque push. Pour l'IA : `cd apps/ia && python -m pytest <fichiers> -q`. **Jamais** la suite complète, jamais `check-types` racine, jamais de build complet : c'est le travail de la CI.
- **Compagnons d'un changement visible par l'utilisateur** : FR et EN (parité des clés i18n), entrée de changelog (`apps/web/src/features/changelog/`), semis de démo (`apps/api/src/modules/demo/demo-dataset.ts` + `demo-coverage.ts`, craft rule n°9), et l'APPELANT branché (une fonction que personne n'appelle ne compte pas).
- **Trace** : `// #<issue>.<n> — <raison>` à l'endroit du comportement.
- **Commits** : Conventional Commits, scope ∈ web|api|ia|contracts|demo (jamais `ci`), numéros dans le sujet, pied `Doc-inchangée: <fiche> — <raison>` si aucune doc n'est touchée (≤ 100 caractères). Prettier sur les fichiers touchés (`npx -y prettier@$(node -p "require('./package.json').devDependencies.prettier") --write <fichiers>`).
- **Push tôt, push simple** : `git push -u origin HEAD:refs/heads/claude/a-onboarding-0411`, après chaque point vert. Ni `--force`, ni `--no-verify`. Ne jamais piper `git push` vers `tail`/`head` : lis son code de sortie. Si la branche distante a bougé sans toi : STOP et rapport.
- **Interdits** : aucun fichier `.github/workflows/*`, aucune PR (le fil intègre), aucune donnée inventée, aucun fournisseur nommé à l'écran, aucun secret dans un fichier ni dans un journal.
- **Rapport final (≤ 15 lignes)** : branche + SHA poussé (vérifié par `git ls-remote origin claude/a-onboarding-0411`), une ligne par point (`livré` / `déjà là` / `bloqué` + `fichier:ligne` du code ET de son appelant + test), les fichiers hors périmètre que tu as dû toucher, et ce qui reste.
