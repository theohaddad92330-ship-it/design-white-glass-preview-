# LAURA-OFFRES-4563 — rapport

Branche `claude/laura-offres-4563-2510` (base `claude/cascade-plancher-5-2510`, 5db74cc4c6). Pas de PR.
Commits : `3b5ed2c0` tests rouges · `8d349667` outil + câblage IA · `aecfe5ed` démo (SHA du rapport : voir `git log`).

## Cause (vérifiée, pas recherchée)

Aucun outil de Laura ne rendait d'offres ; `web_search` était le repli. Chemin talent (#4421) laissé intact : il rend toujours des comptes.

## Ce qui est fait

- `apps/ia/app/services/job_offers_search.py` — outil `search_job_offers` (entrée : `skills` + `city`/`regions`/`departments`, ni consultant ni compte).
  Réutilise `harvest_skill_offers` (tri métier de CHAQUE offre), `run_cascade` (plancher 5, paliers), le cache 30 j des lectures du moteur, `CASCADE_PAID_CALLS_MAX` (8, palier 0 compris).
- `discover_skill_offers.skill_scope` (ContextVar, aucune signature changée) : fenêtre élargie et plafond abaissé pour la moisson ; clés de cache à part pour la fenêtre. `theirstack_skill_offers` honore `wide_window`.
- Câblage : `CHAT_TOOLS` (avant `push_profile`), dispatcher, libellé d'étape, couverture de carte, matrice de droits (lecture), bornes de sortie, 2 scénarios d'éval (261→263).
- `web_search` NON retiré ; sa description renvoie à `search_job_offers`, et celle de l'outil le nomme « complément ».
- Démo : amorce scriptée `p-offres-competence` (Laura est scriptée en salle, décision 12/10) + `DEMO_LAURA_JOB_OFFERS_COVERAGE` **seedée** + garde `demo-laura-offres-coverage.spec.ts`. Aucune entrée déplacée vers « vide à dessein ».

## Critère → commit → AVANT → APRÈS (lu par `tests/test_laura_offres_4563.py`)

| Critère                                                           | Commit   | AVANT (rouge)                                      | APRÈS                                                                                                                                                      |
| ----------------------------------------------------------------- | -------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. offres sans consultant (intitulé, employeur, date, lieu, lien) | 8d349667 | ModuleNotFoundError / outil absent de `CHAT_TOOLS` | ≥5 offres, 5 champs remplis, pas de clé `accounts`                                                                                                         |
| 2. <5 au palier 0 → cascade, palier dit                           | 8d349667 | idem                                               | `terms` « tenté », `reachedAt=terms`, summary « termes voisins »                                                                                           |
| 3. 3 offres du métier après toute la cascade                      | 8d349667 | idem                                               | 3 rendues, 0 « Chef de rang », `belowFloor`, reason « sous le plancher après toute la cascade », summary dit 3 sur 5 et « rien ajouté hors de ton métier » |
| 4. cache + plafond                                                | 8d349667 | idem                                               | 2ᵉ appel : 0 appel payé, `paidCalls=0` ; 3 compétences × 3 sources payantes : ≤ 8 appels                                                                   |
| 6/7. aucun fournisseur, inconnu nommé                             | 8d349667 | idem                                               | `unknown=[statut,TJM,télétravail]`, offre gardée, valeurs `None`, jamais 0                                                                                 |

Contrôles verts (ciblés) : 12 tests neufs ; cascade 5-2510, sources payantes 4419, volume 4419, 4421 (comptes/missions), couverture d'outils, bornes de sortie, rights_matrix, step labels, web_search, `test_copilote_scope_eval*` (+corpus), `no_vendor_in_user_texts` ; Jest `demo-coverage`, `demo-laura-*` ; Vitest `demo-chat-script.*`.

## Choix à connaître

- Régime de cascade **non explicite** : elle s'arrête dès les 5 atteintes (économie d'appels payés). Passer `explicit_request=True` parcourrait toujours tous les paliers.
- Palier « sources » : la première lecture interroge déjà toutes les sources branchées → affiché « lu dès le départ ». Palier « filiales » : sans objet sans compte → affiché « sans objet ». Mantiks n'honore pas la fenêtre élargie (son corps de requête vit dans `mantiks_volume`, non touché).
- Une ville tapée filtre sur la ville (`offer_in_city`, règle existante 21/10) ; le nombre écarté est dit.
- TJM et télétravail ne sont publiés par aucune source aujourd'hui : toujours « non précisé » tant qu'une offre ne les porte pas.

## Non prouvé sans réseau

- Le rendu réel des sources (France Travail, agrégateurs) et la qualité des offres sur « vue et java sur lille » en prod ; le comportement du modèle (choisit-il bien l'outil plutôt que `web_search` ?) — la description est l'interface, mais seule une recette prod le prouve.
- Le coût réel en crédits (comptage d'appels prouvé, pas la facture).
- Non lancé : `test_3901_offres_par_compte_profil.py` (lent), les 4 tests déjà rouges sur la base, ruff-format de `discover_skill_offers.py`/`chat_tools.py` (déjà non formatés avant moi), `pnpm lint:exports:types`.
