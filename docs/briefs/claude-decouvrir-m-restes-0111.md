# Lot M — restes de la recette I/J/K du 01/11

Branche : `claude/decouvrir-m-restes-0111`

## Compris (recette prod 01/11, bundle ≥ ed1a393727, journal `.claude/notes/registre-2026-11-01-recette-IJK.md`)

1. **#4967.2** : une recherche Laura quittée continue bien (PASS), mais revenir par « Demander à Laura » (barre latérale) ouvre une conversation VIERGE avec la question recopiée dans le composer, au lieu de rouvrir le fil EN COURS. Il faut passer par la liste des conversations pour le retrouver.
2. **Source nommée** : onglet « Besoins » de Découvrir, le premier besoin EXTIA affiche « Jobintree » (un fournisseur/site d'annonces). Doctrine : on ne nomme jamais nos fournisseurs sur une carte/ligne.
3. **Compte incohérent** : Découvrir affiche « 144 correspondent au total » avec 0 entreprise affichée, alors que la même recherche en affichait 20 juste avant (après pose puis retrait de filtres de rail).

## Je fais

1. #4967.2 — l'entrée « Demander à Laura » rouvre le fil dont un tour est EN COURS ou PRÊT non lu (même source que la pastille `LauraReadyDot` livrée par #5080) ; sinon comportement d'avant. Test : tour en cours + clic entrée ⇒ fil en cours affiché, pas de fil vierge ; aucun tour en cours ⇒ comportement inchangé.
2. Source jamais nommée — trouver où le libellé de SOURCE d'un besoin est rendu dans l'onglet Besoins (`grep -rn "source" apps/web/src/features/discover` ; probablement le nom du site d'annonces de l'offre). Remplacer par un libellé générique déjà existant (« offre d'emploi », « annonce ») — le LIEN vers l'annonce peut rester. Garde d'architecture si une garde « aucune source nommée » existe (la chercher : `grep -rln "Jobintree\|sources jamais nommées\|providerName" apps/web/src/architecture`) : l'étendre pour attraper ce cas, test qui dit NON avec « Jobintree ».
3. « N correspondent au total » — reproduire en test (composant ou hook qui calcule ce total vs la liste affichée) ; le total ne doit pas contredire la liste : un total qui ne correspond à aucune entreprise affichée après filtres se dit « N avant filtres » ou ne s'affiche pas. Lire d'abord la source du total ; si la cause n'est pas trouvée en ≤ 40 tours, l'écrire dans la PR (fichier:ligne lus) sans maquiller.
4. Tests qui savent dire NON, un par point.

## Je ne fais PAS

Lot F (onglets, SIREN), TheirStack (lot L), Découvrir côté IA.

## Droits

Aucune surface d'accès touchée.

## Je défais

Rien de décidé ; citer #4967, #5080 aux lignes touchées.

Périmètre : `apps/web/src/features/chat/*`, `apps/web/src/features/laura/*`, `apps/web/src/components/sidebar/*`, `apps/web/src/features/mobile/*`, `apps/web/src/features/discover/*`, `apps/web/src/architecture/*`, `apps/web/src/i18n/*`, `apps/web/src/test/tests-node.generated.ts`, `docs/briefs/*`, `changes/*`

## Règles communes

- Pars de `origin/main` ; push `git push origin HEAD:refs/heads/claude/decouvrir-m-restes-0111` (SIMPLE ; pre-push en run_in_background puis attendu) ; après chaque push `git ls-remote` = `git rev-parse HEAD`. Jamais main, jamais `--no-verify`/`--force`.
- PUSH APRÈS CHAQUE POINT VERT ; PR PRÊTE vers main dès le premier point poussé.
- Plafond 200 tours. Tests CIBLÉS seulement ; Prettier 3.9.10 ; nouveau test web ⇒ une ligne dans `tests-node.generated.ts`.
- Doctrine : jamais de donnée fictive ; aucune source nommée ; une absence n'est jamais « 0 ».
- Rapport ≤ 10 lignes.
