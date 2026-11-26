# Lot E — connexion : ne plus retomber sur l'espace de démonstration (#5024, régression de #3788 ; contrat validé par Louis le 31/10/2026)

Conception : session/authentification, arrêt obligatoire du dépôt (§10) — un défaut ouvre ou ferme l'app à tort.

Compris : après s'être identifié, un client retombe sur l'espace de démo, parce que `useCloseDemoOnLogin.ts:~29` ne ferme la démo que si `isTabDemo()` (sessionStorage, par onglet, `demo-tab.ts`) — une démo ouverte dans un AUTRE onglet survit à la connexion.
Je fais : à la connexion d'un compte réel, la sortie de démo se fonde sur l'indicateur `is_demo` renvoyé par le serveur (`useIsDemo.ts`), quel que soit l'onglet ; lire #4608 (ouverte, même famille) et la traiter si c'est la même cause.
Je ne fais PAS : toucher au flux d'auth Supabase, aux cookies, au JWT, aux routes de la démo publique.

## Droits

- Qui voit la démo : un visiteur NON connecté qui ouvre le lien de démo (inchangé).
- Qui est REFUSÉ : un compte réel connecté n'atterrit JAMAIS sur l'espace de démo.
- Test du refus obligatoire : connecté + marqueur de démo posé dans un autre onglet (sessionStorage vide, localStorage/serveur dit démo) ⇒ espace réel. Et le test inverse : visiteur non connecté ⇒ démo toujours accessible.
  Je défais : rien ; garde #3788.
  Périmètre : apps/web/src/_, docs/briefs/_

## Règles communes (lot d'écrivain cloud — lire en entier, une fois)

- Dépôt `Bellum-AI/belllum-monorepo`. Tu travailles sur la branche `claude/lot-4962-e` (déjà créée, elle porte ce brief). `git fetch origin && git checkout claude/lot-4962-e`. Tu ne pousses QUE sur `claude/lot-4962-e`. Jamais main, jamais de PR (le fil principal intègre), jamais de force-push.
- **Plafond : 300 tours.** À 240 : commit + push de ce qui est vert, rapport, STOP.
- Lis d'abord `CLAUDE.md` du dépôt (doctrine, craft rules, design rules) et `agent_docs/chantiers-livres.md` pour ton sujet. Chaque point a un diagnostic ci-dessous (cause fichier:ligne lue sur main le 31/10) : **revérifie-le avant de coder** (le code a pu bouger), et si un point est déjà là sur main, note-le `déjà là <fichier:ligne de l'appelant>` dans le rapport au lieu de le recoder.
- **TDD** : test qui échoue d'abord, puis le code. Le test doit savoir dire NON.
- **Tests CIBLÉS seulement** : ≤ 5 fichiers de spec liés + `pnpm --filter <paquet> exec tsc -p . --noEmit` du paquet touché (ou `pytest <fichier>` pour apps/ia). JAMAIS la suite complète, jamais `check-types` racine, jamais de build : c'est la CI.
- **Compagnons d'un changement visible** : toutes les langues i18n (fr + en au minimum, les mêmes clés partout), le semis de démo si l'écran affiche une donnée neuve (`apps/api/src/modules/demo/demo-dataset.ts` + `demo-coverage.ts`), l'APPELANT (le composant monté dans une route), gardes d'architecture `apps/web/src/architecture/` (aucune couleur hex dans le JSX, plancher 12 px, cibles ≥ 44 px, « non mesuré » ≠ 0).
- **Trace** : commentaire `// #<issue>.<point> — <raison>` à l'endroit du comportement.
- **Commits** groupés par écran, numéros dans le sujet : `fix(web): … (#4968, #4970)`. **Push après chaque point vert** (`git push origin claude/lot-4962-e`), jamais tout à la fin.
- Hooks git : si un hook pre-commit/pre-push lance une suite longue, `GARDE_PORTE_PUSH=0 git push …` est permis ; ne jamais `--no-verify` un test qui échoue réellement.
- Interdits : `git stash`, `reset --hard`, `checkout -- .`, `skip`/`.only` de test, migration qui supprime/renomme (ajout seulement), donnée fictive en dehors du semis de démo, nommer un fournisseur à l'écran, afficher une probabilité.
- Hors périmètre (ligne `Périmètre :`) = ne pas toucher ; si c'est indispensable, l'écrire en QUESTION dans le rapport.
- **Rapport** : écris `docs/briefs/claude-lot-4962-e-rapport.md` (≤ 15 lignes : par point `livré <sha> <fichier:ligne>` / `déjà là <preuve>` / `bloqué <raison>` ; tests lancés et leur résultat ; questions), commit + push. Puis STOP.

## Diagnostic par issue (vérificateur, lu sur main le 31/10 — à revérifier)

## #5024 (diagnostic condensé)

- #5024 (M, retenu, DROITS/session) : useCloseDemoOnLogin.ts:29 ne ferme que si isTabDemo() (sessionStorage, par onglet, demo-tab.ts). Reco : se fonder sur is_demo serveur (useIsDemo.ts:13). Avec #4608 (ouverte).
