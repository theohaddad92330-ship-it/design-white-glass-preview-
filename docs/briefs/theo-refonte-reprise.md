# Refonte Théo — REPRISE et CONTRÔLE durcis (23/10/2026, Opus)

Tu reprends une branche `claude/theo-refonte-<lot>`. Le premier écrivain s'est arrêté au bout de 15 minutes avec UNE retouche (un bandeau) sur trois écrans, en écrivant « écart non jugeable sans voir l'écran rendu ». C'est exactement ce que Louis refuse : « pas de résultats moyens, une vraie refonte ». Ce lot n'a pas le droit de finir comme ça.

Lis d'abord, dans cet ordre :

- `git show origin/claude/theo-refonte-briefs:docs/briefs/theo-refonte-commun.md` — le cadre (règles, décisions, gates, discipline). Tout s'applique.
- `git show origin/claude/theo-refonte-briefs:docs/briefs/theo-refonte-controle.md` — les trois sources (maquette Théo, NOS maquettes validées `maq-<domaine>-19-10` avec leurs `_controle*.md`/`_inventaire.md`, inventaires du 19/10) et qui gagne. Tu fais l'écriture ET le contrôle dans ce même lot.

## Base

`git fetch origin && git checkout -b claude/theo-refonte-<lot> origin/claude/theo-refonte-<lot> && (git merge --no-edit origin/claude/r23-integ-pr11-theo || true) && (git merge --no-edit origin/claude/theo-refonte-coque || true)`. Refais les deux merges à mi-parcours. Pousse sur la même branche : `git push origin HEAD:claude/theo-refonte-<lot>`. Pas de PR.

## Ne pas voir l'écran rendu n'est JAMAIS une raison de ne pas faire

La maquette est un HTML autonome : sa structure, son ordre, ses composants et son CSS se LISENT. L'écran se refait dans le JSX à partir de cette lecture.

- Si `npx -y playwright@1.48.2 install chromium` marche dans ta VM, fais une capture de la maquette (`file://…`, 1440 px puis 390 px) et regarde-la avec Read. Sinon, passe à la suite sans t'arrêter.

## Le geste, écran par écran — dans cet ordre, sans en sauter

1. **Inventaire de la maquette.** Extrais le `<main>` (sans la barre latérale) et écris dans `/tmp/inv-<écran>.md` la liste ORDONNÉE de ses blocs, du haut en bas. Pour chacun : le titre, le type (en-tête de page, onglets, barre de filtres, tableau, carte, liste dense, panneau latéral, état vide, modale, bandeau), les colonnes ou champs, les actions, les états (vide, chargement, erreur), les clics qui ouvrent une modale, et le comportement mobile. Ajoute en dessous les lignes de NOS `_controle*.md`/`_inventaire.md` pour cet écran.
2. **Correspondance.** En face de chaque ligne, écris le composant du code qui la porte aujourd'hui, ou « absent ». Écris aussi chaque élément du code qui n'existe pas dans la maquette : il se GARDE et va sous « À trancher par Louis ».
3. **Refonte.** Réécris la mise en page de l'écran pour que l'ordre, la hiérarchie, les types de blocs, la densité et les espacements soient ceux de la maquette. Utilise les primitives et jetons Théo de la coque (`packages/ui`, `COQUE.md`) et ne recolle pas l'ancienne grille. Branche chaque bloc sur les données réelles, chaque clic de la maquette sur l'action existante, chaque modale. Fais la parité clair/sombre et le mobile.
4. **Preuve.** Écris un test qui sait dire NON sur la structure : l'ordre des sections, les titres, les colonnes, les états vides nommés. Lance `tsc` (0 `error TS`), `npx vitest run src/architecture` et les specs de l'écran (10 au plus).
5. **Commit + push.** Message : `feat(web): refonte Théo — <écran>`. Dans le corps, l'inventaire coché, une ligne par bloc : `fait` / `gardé hors maquette` / `bloqué : <raison>`.

## Ce qui est interdit

- Finir un écran à « partiel » sans un blocage NOMMÉ : une donnée que l'API n'a pas, ou une doctrine que la maquette contredit, comme « aucun score en points ». Même dans ce cas, tous les autres blocs de l'écran sont faits.
- S'arrêter avant que TOUS les écrans du lot soient passés aux étapes 1 à 5, ou avant 270 tours.
- Retoucher un détail et appeler ça une refonte. Le test, c'est que quelqu'un qui pose la maquette à côté de l'écran voie le même écran.
- Supprimer une fonction, un champ, un bouton ou un réglage. Inventer une donnée. Toucher la barre latérale, l'en-tête global ou `packages/ui/src`.

## Rapport

12 lignes au plus : par écran, `conforme` ou `bloqué : <bloc> — <raison>` ; la liste « À trancher par Louis » (écran, ce que dit Théo, ce que dit notre maquette ou le code, ta recommandation) ; le SHA poussé. Puis STOP.
