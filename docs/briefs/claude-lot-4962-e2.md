# Brief — lot E2 : suite de #5024 (sortie de démo hors /login)

Plafond : 300 tours (à 240 : commit du vert, push, rapport, stop).
Branche : `claude/lot-4962-e2` (part de origin/main, porte ce brief).
Périmètre : apps/web/src/_, docs/briefs/_

## Contexte

#5024 : un client ouvrait la démo dans un onglet puis se connectait à son vrai espace dans un autre — il restait en démo. Le lot E (branche `claude/lot-4962-e`, commit 307d85e3, en cours d'intégration — LIS-le : `git show 307d85e3`, `git show origin/claude/lot-4962-e:docs/briefs/claude-lot-4962-e-rapport.md`) a corrigé le cas `/login` : `useCloseDemoOnLogin.ts` se fonde sur `useDemoSpaceStatus` (statut serveur) au lieu du seul marqueur d'onglet (`demo-tab.ts`, sessionStorage). Base ta branche sur `origin/claude/lot-4962-e` : `git merge origin/claude/lot-4962-e` en premier commit.
Reste (arbitrage Louis 31/10 10:55) : un onglet NEUF ouvert sur une autre page que `/login`, SANS marqueur démo d'onglet, alors qu'une session RÉELLE existe, peut encore servir la session démo d'un autre onglet.

## Je fais

- Au montage de l'application (là où la session est résolue — cherche l'appelant de `isTabDemo()` / `useIsDemo`), un onglet sans marqueur démo dont le statut serveur dit « session réelle » sort de la démo (même geste que `useExitDemo.ts:39-50`, qui existe — le réutiliser, ne pas le recoder).
- Un onglet QUI PORTE le marqueur démo reste en démo (le prospect qui navigue dans la démo n'est pas éjecté).
- Trace `// #5024.2` au comportement. i18n fr+en si un texte apparaît.

## Je ne fais PAS

Pas de changement serveur ; pas de changement de `/login` (fait par E) ; pas de déconnexion de la session réelle.

## Droits

Touche la session (qui est dans quel espace). Qui voit l'espace réel : l'onglet sans marqueur démo, quand la session serveur est réelle. Qui est REFUSÉ : un onglet sans marqueur et SANS session réelle n'entre dans aucun espace réel (pas d'escalade : on ne fait que SORTIR de la démo, jamais entrer dans un espace sans session). Tests obligatoires, rouges d'abord : (1) onglet neuf sans marqueur + session réelle → sort de la démo ; (2) onglet avec marqueur → reste en démo ; (3) REFUS : sans session réelle → aucun espace réel exposé.

## Règles

TDD ; tests ciblés seulement (≤ 5 specs vitest + gardes `src/architecture` concernées + `tsc -p apps/web`) ; construire `packages/{contracts,utils,errors,http,observable}` si vitest l'exige ; jamais suite complète ni build ; jamais .github/ ni .claude/ ; push après chaque point vert ; pas de PR.

## Rapport

`docs/briefs/claude-lot-4962-e2-rapport.md` (≤ 15 lignes : SHA, livré fichier:ligne, tests + résultat, questions). Commit + push. STOP.
