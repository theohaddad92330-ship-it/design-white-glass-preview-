# Rapport — lot FIX-HORS-MÉTIER (25/10/2026)

Branche `claude/fix-hors-metier-2510`, base `origin/main` (`af76f469`). Pas de PR. Aucun accès à la production : les preuves sont des tests.

## Constat de départ

Le verdict « hors métier » (`hiringScopeVerdict` / `hiring_scope_verdict`) et la marque existaient et étaient câblés sur
Découvrir (signaux filtrés + marque dans la liste des faits), Mes cibles (tableau), fiche compte (Opportunités, Veille,
offres d'emploi). Les quatre intitulés relevés en prod rendent déjà `keep:false / off_trade` pour un profil cyber
(déclaré ou déduit), en TS comme en Python. Ce qui manquait : des APPELANTS (voir par point).

## Points

- **#4284.1 / #4284.4 / #4284.26 — appelant manquait.** La ligne repliée d'une carte Découvrir (`candidate-subject`,
  l'intitulé qui porte « pourquoi ce compte ») prenait le fait fort le plus récent sans regarder le métier, et la
  marque n'existait que dans le détail déplié. Maintenant : les offres hors métier passent après les faits du métier
  (partition stable, rien n'est retiré) et un sujet hors métier porte « hors de ton métier ».
  Fichiers : `discover/lib/discover-card-facts.ts` (`isOutOfTradeFact`, `outOfTradeFactsLast`), `discover/view/CandidateRow.tsx`.
  Tests : `CandidateRow.outOfTrade.test.tsx` (les 4 intitulés, rouge → vert), jeu partagé
  `packages/contracts/src/fixtures/discover-hiring-scope.json` (+2 profils cyber, 4 cas × 2 + témoin « Analyste SOC ») lu par
  `discover-hiring-scope.test.ts` et `test_discover_hiring_scope_3901p.py` (verts d'emblée : le verdict était juste).
- **#4396.1 / #4398.1 — code existait, appelants déjà câblés** (`OpportunityCards`, `WatchSignalTimeline`,
  `CompanyPublicDataSection`/`JobSignalsCard`, commits e64171a847 et 11f55ee735). Specs existantes relancées : vertes. Rien changé.
- **#4403.1 — code existait ; appelant manquant sur la bibliothèque de signaux** (Mes cibles › Signaux, `SignalsLibrary`) :
  elle lisait le profil sans marquer ni ranger. Maintenant la carte porte la marque et les offres hors métier passent après
  (`model/signal-library.ts`, `isOutOfTrade` exporté de `watchlist.ts`, un seul prédicat). Tests : `signal-library.outOfTrade.test.ts`,
  `SignalsLibrary.outOfTrade.test.tsx`. Le tableau par compte (`WatchlistTable`) était déjà câblé.
- **#4437.5 — calcul existait (IA), affichage incomplet.** Le rattachement (type, compétence, famille) n'était lu que dans le
  détail, et sans le type. Maintenant : `OfferAttachmentLine` sur la ligne du tableau (type · compétences · famille) et le type
  dans le détail ; « non classé » / rien posé ne fait aucune ligne sur la ligne (reste nu). `other` ne s'affiche pas.
  Tests : `watchlist.mesCibles.test.ts`, `WatchlistTable.test.tsx`. i18n fr/en : `detail.attachmentType`, `detail.attachmentAria`.

## Pas fait / questions

- Si l'espace de la recette est un PLACEUR (`recruitsForClients`), les 4 offres restent gardées et sans marque : décision
  14/10 (#1124.1) « le placement en CDI gagne », volontairement non touchée. À confirmer par Louis si c'est le cas du compte de recette.
- Un profil déclaré « Cybersécurité » ne rattache pas « Pentesteur » (la famille ne reconnaît que « pentest » entier) : non élargi,
  pas de liste de métiers figée ajoutée.
- Fiche compte › recrutements : pas de puces de rattachement (la carte d'opportunité ne porte pas `offer_attachment`) — à ouvrir si voulu.
- Démo : données déjà semées (offres hors métier, `offer_attachment`) ; `demo-coverage` non modifié.
- Gates : vitest ciblés verts, pytest ciblé vert, `tsc --noEmit -p apps/web` : exit 0.

[lot-fini] claude/fix-hors-metier-2510
