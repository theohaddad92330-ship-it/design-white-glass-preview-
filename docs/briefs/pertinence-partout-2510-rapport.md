# Rapport — PERTINENCE-PARTOUT (25/10/2026)

Branche `claude/pertinence-partout-2510`, base `origin/claude/decouvrir-trois-causes-2510`. Pas de PR. SHA : tests rouges `bb6aed9c`, implémentation `b45ee342` (+ ce rapport).

## Ce qui est fait

- **UN verdict** (GA-26) : `discover_hiring_scope.hiring_reject_reason` (`nonPlaced` · `outsideTrade` · `offSector` · `noRoles`). Il ajoute « Ssiap », « sécurité incendie », et — **même pour un placeur « tous métiers »** vendant de l'IT — les filières techniques hors IT (chef de chantier, CVC/CFO/CFA, électricien…), sauf si l'intitulé est informatique (`is_it_offer`).
- **`offer_pertinence.py`** : compteur `TradeCount` (reçues, retenues, rejets par motif) et une ligne de journal par appelant : `PERTINENCE-OFFRES caller=… profile=read|none received=… kept=… outsideTrade=… rejected={…}`.
- `mentions_as_technology` : « vue », « go », « java », « rust »… ne comptent que sous forme technique (`Vue.js`, `Golang`, `Vue 3`) ou à côté d'un mot d'informatique ; jamais « en vue de », « go live », « l'île de Java ».
- **Aucun appel de modèle ajouté** (verdict déterministe) : donc ni palier, ni cache 30 j, ni coût par recherche. Un test le garde.

## Par appelant

| Appelant                                                                        | Avant (0 rejet)                                                 | Après (lu par le test)                                                                           |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Analyse de compte (`phase1_research._rank_and_keep_run_jobs`, `caller=account`) | 6 reçues, 6 gardées, `outsideTrade 0`                           | 6 reçues, 1 gardée (« Développeur Vue.js »), `outsideTrade 5`                                    |
| Signaux de Laura (`get_account_signals`, `caller=laura`)                        | « Ssiap », « Chef de chantier » cités                           | 3 offres reçues, 1 gardée, `outsideTrade 2` ; clé `pertinence` dans la réponse                   |
| Page /signals (`discover_signals._build_candidates`, `caller=signals`)          | « Chef de chantier », « Technicien CVC » gardés pour un placeur | écartés ; compteur journalisé (règle de Découvrir conservée : sans métier ni déduit ⇒ `noRoles`) |

Un **compte** hors métier reste (Laura : `outOfTrade: true`, signaux vides, placé après les autres). **Sans profil** (`None`, `{}`) : rien n'est écarté et le journal dit `profile=none`.

## Tests

`tests/test_pertinence_partout_2510.py` (21 cas), écrit AVANT : commit `bb6aed9c`, **20 rouges / 1 vert** sur l'ancien code (analyse gardait « Ssiap », Laura le citait, /signals gardait « Chef de chantier » ; le reste rouge faute du module). Après : `21 passed`. Voisins (hiring_scope, run_cadrage, zone dossier, account_signals, discover_signals_router, widen_4437…) : verts.

## Non fait / à savoir

- `discover_skill_offers.py` et la moisson : **non touchés** (autre lot). `mentions_as_technology` n'y est donc **pas branché** ; le lot parallèle doit l'appeler dans `_mentions`. Sur la base, `is_it_offer` couvre déjà le cas boulangerie.
- Découvrir carte/registre (`discover.py`) garde `drop_off_scope_hiring` : il profite du verdict commun mais sans ligne de compteur.
- Pas de description d'outil modifiée (cache de prompt) : Laura voit `outOfTrade` dans la donnée.
- Déjà rouges hors de ce lot : 2 tests de `test_discover_fresh_jobs_4430.py` (annoncés) et 2 de `test_discover_signal_grid_wiring_4115.py` (chemin registre ; identiques sur la base).

## À prouver en production

La recette rouvre les 12 derniers comptes analysés et compte les offres hors IT (cible : 0) ; lire la ligne `PERTINENCE-OFFRES caller=account` du journal.
