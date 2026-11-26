# Rapport — Lot W2, #4611 : Laura dit où en est le travail lancé (28/10/2026)

Branche `claude/laura-avancement-4611` (base `origin/main`). Un outil de LECTURE `get_work_progress`, une carte, une garde.

## Ce qui est fait

| Point | Où                                                                                                                                                                                              |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| .1/.2 | `apps/api/src/modules/work-progress/` (service + lecteur SQL), pont `POST /internal/copilot/work-progress`, outil IA `work_progress_tool.py`. Une seule forme, cinq familles, quatre compteurs. |
| .3    | Carte `comparison` bâtie du SEUL résultat de l'outil (`progress_block_from_output`) ; celle que le modèle écrirait lui-même est remplacée.                                                      |
| .4    | Chaque compteur = sa requête (`countEach`) ; aucune soustraction nulle part.                                                                                                                    |
| .5    | `counterReading` : `null` → « non mesuré » + raison, jamais `0` (contrat, API, outil, carte).                                                                                                   |
| .6    | `failures` : libellé + raison TELLE QUE L'AMONT L'A DONNÉE ; absente ⇒ « raison non fournie par la source ».                                                                                    |
| .7    | Amont injoignable ⇒ erreur claire ; délai ⇒ `outcome: unknown`, `retryable: false` (`distinguish_timeout`, défaut inchangé pour les autres appels).                                             |
| .8    | `isLotInScope` : espace + périmètre de portefeuille (BU) ; lot d'un autre espace / hors périmètre / inexistant ⇒ `lot_unknown`, indistinguables, aucun chiffre.                                 |
| .9    | `DEMO_WORK_PROGRESS` (2ᵉ lot : rendue, en cours, en file, UNE EN ERREUR avec sa raison) + `seedWorkProgressBatch` + classement `demo-coverage.ts` + empreinte du semis.                         |
| .10   | `_forced_work_progress_kwargs` (outil forcé au round 0) + `progress_answer_gate` : outil absent, en erreur ou en délai ⇒ le modèle n'est PAS rappelé, la réponse est « je n'ai pas pu lire ».   |

## Limites assumées (à trancher)

- **Rattrapages = toujours « non mesuré »** (`no_run_ledger`). Ils se jouent par un geste d'opérateur (`internal/admin/segment-catchup`), cross-espaces, et ne sont que journalisés : aucune table par espace n'en garde un lancé/rendu/échec. Les chiffrer demanderait un journal par espace — décision produit.
- **Analyses** : l'état d'un sous-job est celui ENREGISTRÉ ; il se rafraîchit quand on ouvre le lot (`GET /analysis-batches/:id`). La carte lit l'enregistré, elle ne rejoue pas la lecture d'état.
- **`partial`** (analyse arrêtée après des phases livrées, enrichissement partiel) est compté dans « en erreur » ; sa raison manque souvent côté amont, et se dit alors telle quelle.
- **Démo** : Laura y est scriptée (décision Louis 12/10, `demoTurn`) et n'appelle aucun outil : les lots semés alimentent l'écran des lots et l'outil sur un espace réel ; aucune amorce scriptée n'a été ajoutée.
- La note de la carte tient 300 caractères (contrat `comparison`) : toutes les raisons d'échec sont dans la sortie de l'outil, la carte en cite les premières.
