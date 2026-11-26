# Brief — lot L2 : « Demander à Laura » sans quitter la page (#4345, #4309, #4868)

Branche : `claude/laura-demander-sans-quitter-l2` (ce fichier est déjà dessus). Base `origin/main`.
Agent : écrivain. **Plafond : 300 tours.** À 240 : commit et push du vert, rapport, stop.

## Les issues (lis chacune EN ENTIER, avec ses commentaires, par `gh api repos/Bellum-AI/belllum-monorepo/issues/<N>` et `/comments`)

- **#4345** — « Demander à Laura » fait quitter la page courante.
- **#4309** — Découvrir : « Expliquer avec Laura » sans quitter la page.
- **#4868** — montée `@tanstack/react-router` : la requête laissée dans `to` n'arrive plus (52 liens profonds). Vérifie d'abord si c'est déjà corrigé sur `origin/main` (`git log -S` et `git grep`) ; si oui, écris la preuve `fichier:ligne` dans le rapport et ne code rien.

Chaque demande d'une issue devient un point numéroté `#N.k` dans ton rapport. Un retour est un symptôme : cherche le geste empêché, et la FAMILLE (tous les endroits qui font la même chose : `git grep -n "Demander à Laura\|Expliquer avec Laura\|AskLaura"`).

## Contrat (Louis, 31/10 : « go pour tout » ; libellé et mobile par défaut)

**Je fais** : tout « Demander à Laura » / « Expliquer avec Laura » ouvre la **bulle Laura** sur la page courante (`features/laura/bubble/**`), avec la question pré-remplie et le contexte de la page (compte, candidat, liste), au lieu de naviguer vers /chat. Libellé unique : « Demander à Laura ». La bulle s'ouvre AUSSI sur mobile (≤ 768 px, GA-28 ; plein écran ou feuille du bas, comme la bulle actuelle sur mobile). Si l'utilisateur veut le fil complet, la bulle garde son lien « Ouvrir dans /chat » existant.

**Je ne fais PAS** : pas de changement du moteur de Laura, ni de /chat, ni de `Chat.tsx` (autre lot en cours) ; pas de nouveau contexte serveur (on passe ce que la page sait déjà).

**Droits** : aucun changement d'accès (la bulle respecte déjà les droits de la page).

**Je défais** : nomme dans un commit (« revient sur #N » / « garde #N ») chaque `#N` que `git blame` attache aux lignes modifiées (la porte `anteriorite` le vérifie).

## Pièges

- Retirer un chemin (la navigation vers /chat) : liste par `git grep` ce qu'on n'atteignait QUE par ce chemin.
- Accessibilité : nom accessible, tabulable, cible ≥ 44 px (GA-27/32/35), focus rendu à l'élément d'origine à la fermeture (`dialog-restores-focus-on-close`).
- Démo (craft rule 9) : en démo, « Demander à Laura » ouvre la bulle avec une réponse scriptée (`features/demo/`).
- i18n fr ET en, clés orphelines retirées ; changelog `packages/contracts/src/changelog/` (`entries.ts` + `labels.fr.ts` + `labels.en.ts`).
- Prettier du dépôt (printWidth 120, guillemets simples) ; jamais un reformatage de fichier entier.

## Périmètre

Périmètre : apps/web/src/components/primitives/**, apps/web/src/features/laura/**, apps/web/src/features/discover/**, apps/web/src/features/demo/**, apps/web/src/features/accounts/**, apps/web/src/routes/**, apps/web/src/i18n/locales/**, packages/contracts/src/changelog/**, packages/figma-sync/src/spec/overlays/**

## TDD et gates — CIBLÉS

- Tests d'abord (le test qui sait dire NON : aucune navigation vers /chat au clic).
- `node apps/web/node_modules/typescript/bin/tsc --noEmit -p apps/web/tsconfig.json` (filtre TS6305 ou `pnpm --filter @bellum/contracts build`).
- `pnpm --filter @bellum/web exec vitest run <≤ 5 fichiers>` + gardes `apps/web/src/architecture/` qui citent les fichiers touchés.
- `pnpm lint:exports:types`.
- **JAMAIS** la suite complète, le `check-types` racine, le build, ni `pnpm ci:local`.

## Livrer

Commits (sujet ≤ 100 caractères, scope web/contracts/tooling), numéros dans le sujet. Trace `// #N.k` au comportement. **Push** : `GARDE_PORTE_PUSH=0 git push --no-verify origin HEAD:claude/laura-demander-sans-quitter-l2` après chaque étape verte, puis `git ls-remote` pour prouver l'arrivée. **N'ouvre PAS de PR.**

Rapport (≤ 15 lignes) : SHA, points livrés (`fichier:ligne`), points déjà là (preuve), non faits + raison, fichiers hors périmètre, chemins orphelins. Puis STOP.
