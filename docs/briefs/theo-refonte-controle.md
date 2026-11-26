# Refonte Théo — passe de CONTRÔLE sur nos maquettes validées (23/10/2026)

Tu reprends une branche `claude/theo-refonte-<lot>` déjà écrite par un écrivain. Louis : « on avait fait des maquettes ensemble pour s'assurer que tout est validé, base-toi sur ça aussi ; je veux que tout soit parfait et que tout le nouveau design soit intégré ».
Cadre commun : `git show origin/claude/theo-refonte-briefs:docs/briefs/theo-refonte-commun.md` (règles, décisions, discipline : tout s'applique).

## Base

`git fetch origin && git checkout -b claude/theo-refonte-<lot> origin/claude/theo-refonte-<lot> && (git merge --no-edit origin/claude/r23-integ-pr11-theo || true) && (git merge --no-edit origin/claude/theo-refonte-coque || true)`. Pousse sur LA MÊME branche (`git push origin HEAD:claude/theo-refonte-<lot>`), sans PR.

## Les trois sources, et qui gagne

1. **Maquette de Théo** (`_appliquees/`, et pour l'onboarding `git show origin/claude/maquettes-theo-v22:docs/maquettes/theo-v23/Bellum_V23_Onboarding_Complet.html`, qui PRIME sur la v22) : elle décide de la structure et du visuel.
2. **Nos maquettes validées avec Louis** (branches `origin/claude/maq-<domaine>-19-10`, dossier `docs/maquettes/<domaine>/`) : chaque `.html` + `_controle*.md` + `_inventaire.md`. Elles portent ce que Louis a VALIDÉ : contenu, états, clics, règles. Domaines : shell, decouvrir, analyse, laura, compte, aujourdhui, actions, affaires, talents, pilotage, reglages.
3. **Les inventaires** `origin/claude/inventaire-ecrans-19-10` et `origin/claude/inventaire-back-19-10` (`docs/maquettes/_inventaire/`) : liste de ce qui existe aujourd'hui.

Règle : visuel et structure = Théo. Tout ce qui est validé dans nos maquettes (une info, un état, un clic, une modale, un filtre, une règle de `_controle`) et absent de l'écran livré s'AJOUTE, à la place que notre maquette lui donne, dans le langage visuel de Théo. Un VRAI conflit entre les deux (Théo retire ou contredit une chose que notre maquette valide) : tu ne tranches pas. Garde l'existant et note le point sous « À trancher par Louis » (écran, ce que dit Théo, ce que dit notre maquette, ta recommandation).

## Le geste, écran par écran

1. Ouvre l'écran livré (code), la maquette de Théo et notre maquette du même écran.
2. Coche chaque ligne de `_controle*.md` et de `_inventaire.md` du domaine : présent, ajouté, ou à trancher.
3. Corrige les écarts : contenu manquant, état vide, modale, clic mort, couleur, densité, mobile, clair/sombre.
4. Mets les tests à jour. `cd apps/web && npx tsc --noEmit -p .` doit donner 0 `error TS`. Lance `npx vitest run src/architecture` + les specs de l'écran (10 au plus).
5. Commit + push après chaque écran : `fix(web): refonte Théo — <écran> conforme aux maquettes validées`.

## Discipline et rapport

Celles du cadre commun : 300 tours, aucun sous-agent, rien en arrière-plan, `timeout 540`, rien sous `.claude/`. Rapport en 12 lignes au plus : par écran conforme / partiel, la liste « À trancher par Louis », le SHA poussé. Puis STOP.
