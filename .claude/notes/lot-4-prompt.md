# Lot 4 — prompt de reprise

Écrit le 04/09/2026, fin du lot 3. Repartir de `origin/main` **frais**.

## État

**9 PR mergées et recettées en production** (`1b328c1bb` en tête) :

| PR | Ce qui change |
|---|---|
| #1479 | Un contact peut exister **sans entreprise** — onglet « À qualifier », 4 jointures INNER→LEFT |
| #1480 | Les filtres de la liste de contacts **atteignent l'API** (3 étaient jetés) |
| #1481 | Six gestes qui ne répondaient pas + une garde borgne rebranchée |
| #1482 | Une alerte de mission **mène quelque part** |
| #1483 | Ce que Bellum calculait déjà **arrive à l'écran** (Veille, Intégrations, Import, Messagerie) |
| #1484 | **Un seul cockpit d'équipe**, et sa fuite de permission est fermée |
| #1485 | Une colonne neuve atteint **ceux qui ont déjà choisi** leurs colonnes |

**9 issues closes et vérifiées** : #1335, #1354, #1355, #1391, #1412, #1457, #1458, #1459, #1473.
**8 commentées, laissées ouvertes** : #1398, #1413, #1416, #1424, #1440, #1447, #1451, + #1462/#1463 (doublon non tranché).
**108 issues ouvertes.**

## ⚠️ À LIRE AVANT DE CODER

`.claude/notes/decisions-en-attente-2026-09-04.md` — **6 décisions** attendent Louis,
chacune avec le coût de ses options. **Ne pas les deviner.** Les deux dernières sont
sorties du lot 3 : une garde de permissions qui lit les commentaires (Q5), et une
capacité qui a perdu son écran (Q6).

## Décisions DÉJÀ prises — ne pas les re-poser

- **Onglet « Équipe » supprimé**, `/team` est le seul cockpit d'équipe. **Fait.**
- **Parité démo : on tient la doctrine.** Le cockpit d'équipe, l'état connecté de
  `/integrations` et les bandeaux proactifs restent **invisibles en démonstration**,
  avec leur raison écrite. Ils se recettent en production.
- **Laura : une primitive, deux poids.** `AskLaura` gagne un variant `prominent`
  réservé aux écrans de LISTE. **Pas encore fait.**
- **Automatisations** : relances → `/actions/chaines`, rituels → `/team`. **Pas fait.**
- **~10 issues par PR**, et on recette avant d'ouvrir la suivante.

## Ce qu'il reste, groupé

- **`/missions` (26)** — #1366→#1385 : planification, suivi, renouvellements, Laura.
  ⚠️ #1376/#1380 dépendent de la **Q1** (que devient `/missions/board`).
- **`/pilotage` (8)** — #1432→#1439. Dépend de la décision « Automatisations ».
- **`/dashboard > Moi` (8)** — #1404→#1411. ⚠️ **#1408 : « Mes comptes » filtre sur le
  CRÉATEUR, `/comptes` sur le RESPONSABLE** — deux populations, deux vérités.
- **`/team` (5)** — #1460→#1464, ex-onglet Équipe, à retraiter sur leur vrai écran.
- **`/briefing` (7)**, **`/mailbox` (5)**, **`/integrations` (5)**, **`/watchlist` (4)**,
  **`/partners` (5)**, **`/propositions` (4)**, **`/accounts` (4)**, **import (3)**.

## Pièges payés dans le lot 3 — ne pas les repayer

- **La recette live a trouvé 4 défauts que 7 300 tests ne voyaient pas.** Aucun ne
  produit d'erreur : il faut **compter à l'écran**, ou avoir un **état ancien**.
- **Attendre que Vercel ET Railway servent le bon commit** avant toute mesure. J'ai
  failli conclure deux fois qu'un lot ne marchait pas. Recette en mémoire :
  `recette-attendre-les-deux-deploiements`. ⚠️ `curl` rend **0 octet** dans ce shell —
  lire le bundle **depuis le navigateur**, et sonder une chaîne littérale (clé i18n,
  chemin d'API), jamais un nom de composant (minifié).
- **Le changelog conflicte à CHAQUE lot parallèle, et ses libellés partagent
  l'accolade fermante** — la concaténer naïvement casse la compilation. Recette en
  mémoire : `conflit-changelog-accolade-partagee`. Lancer
  `pnpm --filter @bellum/contracts test` après résolution, c'est le seul contrôle
  qui l'attrape. ⚠️ `commitlint` refuse le type `merge:` → `chore(contracts):`.
- **Un merge tue la CI des autres PR** : un `Format` **ANNULÉ** fait échouer
  `CI Status`. Ce n'est pas une régression — refusionner `main` et repousser.
- **Le check Railway échoue TOUJOURS sur une PR.** Merger sur `CI Status`.
- **Ne pas prendre un rapport d'agent au pied de la lettre.** Un lot a annoncé une
  colonne « livrée, cochée par défaut » — elle était invisible en production.
- **`gh issue comment/close` : toujours `--body-file`**, jamais `--body "…"`.
- **Ne pas nettoyer les worktrees en masse** : `.claude/worktrees/` contient ceux
  d'autres sessions. (Les branches survivent à `worktree remove`, mais c'est du bruit.)

## Méthode qui a marché

Quatre agents de **diagnostic** en parallèle (un par famille d'écrans), puis quatre
agents d'**écriture** en worktrees isolés sur des zones disjointes. Le diagnostic a
ramené 117 issues à ~25 familles, et a trouvé les antériorités : **trois specs
avaient été closes sur leurs points faciles** (#1316, #1319, #1322 — cette dernière
avec 2 points sur 7). Les retours d'aujourd'hui en sont largement les restes.
