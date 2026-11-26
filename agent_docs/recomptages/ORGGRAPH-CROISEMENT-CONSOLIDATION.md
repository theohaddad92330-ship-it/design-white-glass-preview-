# OrgGraph — le croisement des 272, consolidé

> Écrit le **30/08/2026 au soir**, contre `origin/main` = `deaff12e0` (les dix croisements)
> puis `70fedd979` (cette consolidation). Il remplace le statut « aucun » que portait
> `ORGGRAPH-inventaire.md` : **les 272 exigences ont désormais un statut chacune, avec preuve.**

## 0. Ce que ce fichier clôt

`ORGGRAPH-inventaire.md` porte 272 exigences numérotées 1 → 272. C'était un **INVENTAIRE**,
et il le disait lui-même : « rien n'a été croisé contre le dépôt », « aucun fichier du dépôt
n'a été ouvert ». Sa 3ᵉ colonne est une **zone de code probable**, jamais un statut.

C'était le trou le plus large des trois zips, et il ne se voyait pas **parce que le fichier a
l'apparence d'un recomptage**. Trois documents (`orggraph-*.md`) en couvraient moins d'un
cinquième.

Dix croisements en lecture seule, à périmètres disjoints, l'ont statué en entier.

## 1. La couverture — vérifiée par machine, pas relue

| Rapport                                           | Items       |   Plage | Couvert |
| ------------------------------------------------- | ----------- | ------: | ------: |
| `ORGGRAPH-croisement-01-items-1-23.md`            | §0 §1       |      23 |      23 |
| `ORGGRAPH-croisement-02-items-24-49.md`           | §2 §3       |      26 |      26 |
| `ORGGRAPH-croisement-03-items-50-71.md`           | §4 §5 (P0)  |      22 |      22 |
| `ORGGRAPH-croisement-04-items-72-100.md`          | §6 §7       |      29 |      29 |
| `ORGGRAPH-croisement-05-items-101-121.md`         | §8 §9       |      21 |      21 |
| `ORGGRAPH-croisement-06-items-122-148.md`         | §10 §11     |      27 |      27 |
| `ORGGRAPH-croisement-07-items-149-176.md`         | §12 §13     |      28 |      28 |
| `ORGGRAPH-croisement-08-items-177-184-257-272.md` | §14 §17 §18 |      24 |      24 |
| `ORGGRAPH-croisement-09-items-185-220.md`         | §15 (1/2)   |      36 |      36 |
| `ORGGRAPH-croisement-10-items-221-256.md`         | §15 (2/2)   |      36 |      36 |
| **Total**                                         |             | **272** | **272** |

**Aucun item sans ligne** — vérifié en extrayant les numéros de chaque table et en les
diffant contre `range(1, 273)` : zéro trou, zéro doublon, chaque numéro dans le rapport
de sa plage et nulle part ailleurs.

## 2. Le compte — et pourquoi il ne s'écrit pas en une seule table

⚠️ **Un compteur uniforme sur des formes hétérogènes ment.** Écrit une première fois, il a
rendu **165 au lieu de 272** : quatre rapports mettent leur nombre en 3ᵉ colonne (`| Statut |
Items | Total |`), deux le mettent en 2ᵉ, et le rapport 08 n'emploie pas du tout le même
vocabulaire. La FORME de chaque fichier s'établit avant de compter, et chaque somme se
croise avec la taille de sa plage.

**248 items dans le vocabulaire standard** (neuf rapports, chacun réconcilié avec sa plage) :

| Statut         |  Nombre | Part |
| -------------- | ------: | ---: |
| **LIVRÉ**      | **100** | 40 % |
| PARTIEL        |      54 | 22 % |
| ABSENT         |      77 | 31 % |
| PÉRIMÉ         |      11 |  4 % |
| À CLARIFIER    |       3 |  1 % |
| **NON PROUVÉ** |   **0** |    — |
| **Total**      | **248** |      |

**24 items dans leur propre vocabulaire** (rapport 08 — ce sont des REFUS et des POURQUOI,
pas des fonctionnalités ; leur donner les six statuts standards aurait été un contresens) :

| Bloc                              | Items | Résultat                              |
| --------------------------------- | ----: | ------------------------------------- |
| §14 — les 8 refus du FINAL        |     8 | **8 TENUS, 0 violé**                  |
| §17 — les 3 alternatives écartées |     4 | **aucune trace dans le code** (voulu) |
| §18 — les POURQUOI                |    12 | **5 consignés, 7 non consignés**      |

### ⚠️ Le « NON PROUVÉ = 0 » a demandé un arbitrage, il ne se lit pas dans les rapports

Le rapport 06 a rendu **3 NON PROUVÉ**, tous sur le ledger de corrections d'organigramme,
en s'appuyant sur l'audit du **matin** du 30/08 qui le déclarait « CODE MORT — zéro appelant ».

**C'est faux depuis 11 h 53 le même jour.** Vérifié à la main, pas déduit d'un rapport :
`OrgCorrectionDrawer` est monté à `FocalOrgView.tsx:574`, et `useOrgCorrections` a deux
appelants de production (`OrgCorrectionDrawer.tsx:34`, `OrgCorrectionsHistory.tsx:9`).
Cinq autres rapports (01, 02, 04, 07, 10) l'ont trouvé branché indépendamment.

Le rapport 06 a fait exactement ce contre quoi son propre brief le mettait en garde : il a
cru une ligne de moins de 24 h sans la revérifier. **Ses 3 NON PROUVÉ sont périmés.**

## 3. La contradiction entre deux rapports, tranchée dans le code

Les rapports **04** et **10** se contredisent frontalement sur un point de doctrine :
_une correction humaine survit-elle à une réanalyse ?_

- Le **10** dit non : une reconstruction écrase les corrections de champ, seuls
  `graphVersion` et les rejets survivent (`org-graph.service.ts:440-472`).
- Le **04** dit oui : `AccountsService.replayOrgCorrections` les rejoue à chaque run.

**Le 04 a raison, et le 10 s'est trompé de fonction.** `memoryFor` (`:440-472`) ne porte
effectivement que `{graphVersion, rejectedItems}` — mais ce n'est pas le chemin des
corrections. `replayOrgCorrections` (`accounts.service.ts:2696`) relit
`org_graph_corrections` (`object_type, object_id, field, new_value`) et les rejoue ;
il est appelé depuis `applyOrgChart` (`:2772`), **le seul chemin d'écriture de
l'organigramme**. La doctrine « une correction humaine gagne toujours » est donc tenue.

> C'est la règle 8 du skill qui paie ici : **un rapport d'agent est une AFFIRMATION.**
> Deux rapports en désaccord sur un point de doctrine se tranchent en ouvrant le code,
> jamais en croyant le plus détaillé des deux.

## 4. Le défaut le plus lourd trouvé par le croisement — et il est réel

**Un bloqueur peut entrer dans le chemin recommandé STOCKÉ.** Trouvé indépendamment par les
rapports **02** et **07**, puis vérifié à la main.

La règle du FINAL, recopiée dans `focalOrgData.ts:194-199` :

> « masquer complètement un blocker hiérarchiquement réel falsifie l'organigramme ;
> **on l'exclut du chemin, pas de la structure** ».

Le **web** la tient. Le **générateur** ne la tient pas : dans `org_graph_assembler.py`, la
construction de `recommendedPath` (≈ l.1101-1155) filtre les rejetés (`rejected_ids`), le
cadrage (`filter_recommended_path`) et réordonne (`demote_governance_first_touch`) — **jamais
les bloqueurs**. Les 5 occurrences de `blocker` du fichier concernent la CLASSIFICATION du
rôle (`:137`, `:430`, `:441`, `:462-463`), aucune le filtrage du chemin.

C'est le motif **« porte unique dans un seul langage »** : tout ce qui lit
`raw_analysis.org.orgGraph` sans passer par l'écran — export PDF, outil du copilote, MCP,
future routine — recommandera la personne qui bloque le dossier.

**CORRIGÉ le 30/08 au soir** — PR #1272. Le filtre est posé au MÊME endroit que les filtres
existants et LIT `decisionRoles` déjà porté par `people_nodes` plutôt que de le redériver
(GA-26). Deux points tenus : `unknown` n'est pas un bloqueur, et le bloqueur reste dans
`people` — exclu du chemin, jamais de la structure. TDD, et la garde prouvée capable de dire
NON. Suite IA complète : 5 423 tests verts.

## 5. Ce qui reste dû, par ordre de poids

Les ABSENTS ne sont pas tous du même prix. Les quatre familles qui reviennent dans plusieurs
rapports à la fois :

1. **Le planificateur d'enrichissement n'existe pas** (rapports 02, 05, 06, 07, 09 — item 122
   et suivants, item 154). Ce que le FINAL §11 décrit — sélection de vague, 4 modes de ciblage,
   **coût annoncé avant confirmation**, job reprenable — n'a aucun équivalent : il y a UN bouton
   qui re-classe synchroniquement tous les contacts connus, sans ciblage, sans job, sans
   prévisualisation de coût (`analysis-ondemand.service.ts:464`).
2. **Aucune temporalité, aucun reporting matriciel** (rapports 01, 03, 05, 06, 09 — items 23,
   69, 70, 156, 207, 208). Ni `validFrom`/`validTo`, ni `functional` : `orgHierarchyRelationSchema`
   n'a que 5 valeurs. C'est aussi le POURQUOI le plus lourd des 7 non consignés.
3. **L'écran « tous les contacts » de la maquette 03 n'existe pas** (rapport 04 — items 89,
   95-100). « Voir tous » renvoie vers l'onglet Contacts préexistant : recherche libre + un
   filtre de rôle, là où la maquette demande 7 colonnes, 6 filtres et une pagination.
4. **`accessStatus` n'existe nulle part** (rapports 04, 05), ce qui prive de socle le tri du
   Top 10 et le statut « à éviter » (items 88, 92, 93, 94).

## 6. Ce que le croisement a trouvé de POSITIF, et qui n'était pas acquis

- **Le P0 tient, et tient mieux que le tracker ne le disait.** Aucune relation hiérarchique ne
  se déduit plus d'une preuve d'identité : `_CLAIMS_BACKING["member_of"] = {identity, membership}`
  ferme structurellement le chemin, avec deux tests qui l'exécutent. Le rapport 03 a même trouvé
  un **3ᵉ verrou non documenté** — un miroir TypeScript (`org-reporting-hypothesis.ts`, GA-126/127)
  qui ferme un second chemin d'écriture (`applyRelationVerdict`) qu'aucune garde Python ne voyait.
- **Aucun des 8 refus du FINAL n'est violé**, et aucune des 3 alternatives GPT écartées n'a
  laissé de trace dans le code.
- **Aucun critère protégé n'atteint le prompt de notation.** Vérifié par exécution (le poste a
  `anthropic` installé, contrairement à celui de l'auteur du FINAL) : `strip_protected_criteria`
  retire `photoUrl`/`gender`/`nationality`/`address` récursivement avant `json.dumps`, et ne
  garde que les deux exceptions nommées (identité, ville/pays). `test_protected_criteria_scoring.py`
  rejoue la vraie phase 3 et relit le texte envoyé — 10/10 vert.
- **Neuf gardes citées comme preuve ont été exécutées, aucune trouvée borgne** (GA-98/99, GA-100,
  GA-50, GA-103, GA-112 à GA-115, GA-126).

## 7. Ce que ce croisement NE dit pas

- **Il ne dit pas que 100 items « LIVRÉ » sont sans défaut** : il dit que le code fait ce que
  l'item demande, avec un appelant réel. Un écran livré peut être laid ou lent.
- **Il ne rattache pas les items aux commits.** 408 commits et 138 merges sur 24 h : le
  rattachement item ↔ commit dépasse ce qu'une passe de mesure établit. « Non rattachable »
  plutôt qu'une estimation.
- **Les 272 ne s'additionnent à AUCUN autre total.** Le zip du 27 août est un chantier distinct
  de celui du 26 (les 22 PDF) et de celui du 24 (les 11 archives). Aucun total ne les fusionne :
  les recouvrements sont prouvés et non déduplicables.
