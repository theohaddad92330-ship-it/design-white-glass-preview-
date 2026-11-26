# Lot K — retirer « Marché observé » de Découvrir (#4791.5, jamais arrivé sur main)

Branche : `claude/decouvrir-k-retrait-marche-3110`

## Compris

La PR #5058 (lot E, fusionnée 0d5c020ae1) annonçait le retrait de la section « Marché observé » (décision Louis 31/10 : les comptes Market Memory entrent dans la liste, la section disparaît). Le commit de retrait n'a JAMAIS été poussé : sur main, `apps/web/src/features/discover/view/MarketObservedSection.tsx` existe, `Discover.tsx:39` l'importe et `:3064` la rend ; la recette prod du 31/10 18:21-18:28 UTC la voit encore sous la liste. Market Memory comme SOURCE (#4791.2) est bien sur main (`dc3d582768`, `a6efa7284e`).

## Je fais

1. Retirer la section de Découvrir : `MarketObservedSection.tsx` (+ son test), son rendu `Discover.tsx:3064` et son import `:39`, la requête `marketObservedQueryFromFilters` et ce qui ne sert plus qu'à elle (`market-context.ts` si plus appelé — `git grep` d'abord : `ReverseMarketPage.tsx`, `MarketAwarenessCard.tsx`, `compatibleEnvironments.ts` la CITENT en commentaire ou réutilisent son calcul : ne casse pas leur calcul, déplace-le s'il le faut, GA-26).
2. NE PAS toucher au bloc du rail `FilterRail.tsx:617` (`framing.marketObservedBlock`, champs « Famille de rôles observée » / « Écosystèmes liés à ») : le lot F (en cours) les BRANCHE sur la recherche (décision Louis). Seuls ses libellés d'aide qui citent « la section Marché observé » (`discover.json:257,261,2180` et autres langues) sont réécrits pour ne plus la citer.
3. Gardes d'architecture qui lisent la section (`une-absence-ne-fait-pas-une-ligne.test.ts:225,305`, `discover-filters-reach-the-search.test.tsx:304-325`, `demo-discover-market-observed-coverage.spec.ts`, `demo-coverage.ts`) : mises à jour avec la raison écrite (« retrait décidé par Louis 31/10, revient sur #4632 ») — jamais déplacées en « vide à dessein » pour faire passer.
4. Test de NON : Découvrir rendu après une recherche ne contient plus « Marché observé ».

## Je ne fais PAS

Le rail (lot F), Market Memory source (livré), autre écran.

## Droits

Aucune.

## Je défais

#4632 (section posée), #1626, #1796.2 si leurs lignes sont touchées — « revient sur #N », décision Louis 31/10.

Périmètre : `apps/web/src/features/discover/*`, `apps/web/src/architecture/*`, `apps/web/src/i18n/*`, `apps/web/src/test/tests-node.generated.ts`, `apps/web/src/features/consultants/*` (si calcul déplacé), `apps/web/src/features/welcome/*` (idem), `apps/api/src/modules/demo/*`, `agent_docs/*`, `docs/briefs/*`, `changes/*`

## Règles

- Pars de `origin/main` ; push `git push origin HEAD:refs/heads/claude/decouvrir-k-retrait-marche-3110` APRÈS CHAQUE POINT VERT (pre-push en fond + Monitor). Jamais main, jamais `--no-verify`. VÉRIFIE après chaque push que la branche distante porte ton commit (`git ls-remote origin claude/decouvrir-k-retrait-marche-3110`) : le lot E a déclaré un retrait jamais poussé.
- Plafond 120 tours. TDD. Tests ciblés, `npx tsc --noEmit -p apps/web`, Prettier 3.9.10.
- PR PRÊTE vers main. Rapport ≤ 8 lignes.
