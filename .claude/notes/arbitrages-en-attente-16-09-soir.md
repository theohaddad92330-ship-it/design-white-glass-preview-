# Arbitrages en attente — 16/09/2026, fin d'après-midi

Remontés par les écrivains et par la recette live. Aucun n'est tranché.
Rien n'est écarté de mon fait : ces lignes attendent Louis.

## 1 — #2153.27 · l'onglet `/actions/chaines`
L'écrivain G2 a livré le patron de redirection (une adresse retirée du menu
emmène au bon endroit, garde dans `sections.test.ts`). `/actions/chaines`
n'était pas tranché par le dossier. **Reco : le retirer et le faire rediriger
vers `/actions`** — le patron le couvre déjà, coût nul.
⚠️ `/watchlist` reste `awaits-absorption` (#2151.60) : `WatchlistPage`
(316 lignes, KPIs + facettes + table) n'est montée nulle part ailleurs —
la rediriger SUPPRIMERAIT la capacité.

## 2 — `GET :id/similar` hors périmètre : 404 ou `[]` ?
Deux lots ont tranché à l'inverse. L'intégrateur vague 14 a suivi **GA-335**
(la route est un fragment qui LÈVE) → **404** hors périmètre ; hors ESPACE elle
rend toujours `[]`. La raison est écrite dans le code. **À confirmer.**

## 3 — parité démo de la cloche (`notifications`)
La table n'est semée NULLE PART en démo, et n'est ni dans `DEMO_SEEDED_TABLES`
ni dans `DEMO_INTENTIONALLY_EMPTY`. Elle est scopée `user_id`, donc
`demo-coverage.spec.ts` ne la voit pas : **garde aveugle, pas exemption.**
Les trois RÉGLAGES sont visibles et actionnables en démo ; ce qui manque est la
cloche, pour les 13 types. **Reco : classer explicitement, raison « les annonces
naissent d'un balayage nocturne, une salle de démo est prêtée 30 min ».**

## 4 — panneau de restitution : la source s'affiche, la DATE non
`ComputedAt` / `deriveComputedAt` refusent d'afficher l'heure de la requête et
le calcul est à la volée. Conforme à la primitive `Provenance`, mais le brief
demandait « la source ET la date ». **Accepter, ou persister un instant de calcul.**

## 5 — #1953.11 / #1953.22 · la provenance d'une réédition ne survit pas au reload
MESURÉ EN PRODUCTION le 16/09 (4897da487) : « Modifier ma demande » étiquette
la réponse précédente « Réponse remplacée à 15:05 — conservée pour mémoire »,
mais **après un rechargement complet l'étiquette a disparu** (zéro élément du
DOM portant « remplac »). Les deux échanges restent alors côte à côte sans
aucune marque de filiation. Un écrivain est dessus (branche `feat/1953-provenance-16-09`) ;
si la donnée n'est pas persistée côté API, c'est un champ additif + migration.

## 6 — les trois arbitrages dus du dossier #2195
#2195.33, #2195.12, #2195.8 — posés en QCM groupé dès que Louis est là.

## 7 — remontés par les écrivains, pas encore posés
- persister « Maintenir les deux » sur une contradiction ?
- retirer `PendingActions.tsx` au profit de `CopilotCards.tsx` ?
- accepter une lecture CRM à l'affichage d'une carte (#1930.14) ?
