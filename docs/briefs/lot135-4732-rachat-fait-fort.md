# Lot 135 — #4732 : un rachat / une fusion est un FAIT FORT sur la carte Découvrir

Arbitrage Louis 29/10/2026 : oui, un rachat passe en fait fort sur la carte Découvrir, comme sur la fiche compte
(`discover_signal_grid.py:89` le laissait en contexte), et les comptes déjà analysés sont rattrapés par SEGMENT, ciblés.

Périmètre : apps/ia/app/services/discover_signal_grid.py, apps/ia/app/services/dated_signals.py, apps/ia/tests/test_discover_signal_grid_4732.py, apps/api/src/modules/analysis/segment-catchup.service*.ts, apps/api/src/modules/admin/admin-segment-catchup.controller*.ts, docs/briefs/lot135-4732-rachat-fait-fort.md

## Antériorité

- #4769 (fusionné) : fiche compte — `dated_signals._MERGER_TERMS_RE` → `acquisition`, démo SNCF semée (`demo-dataset.ts`) : rien à recoder, déjà classé « seedé ».
- Ce lot ne touche QUE la carte (grille) et le rattrapage.

## Ce que le lot fait

1. Grille : un acte légal qui nomme vente/cession (genre BODACC « sale »), fusion, absorption, scission, rachat ou apport partiel → FORT ; une actualité qui nomme rachat / acquisition / fusion → FORT. Le prédicat est UN seul (`names_merger`, partagé avec la fiche, GA-26).
2. Rattrapage : `POST internal/admin/segment-catchup/signals/mergers[/preview]` — comptes dont le registre porte un acte de rapprochement des 12 derniers mois ET dont la collecte du segment signaux est antérieure à #4769 ; jamais tout le parc, jamais au déploiement, interrupteur du segment respecté.

## Ce que le lot NE fait PAS

- Aucune probabilité, aucune source nommée, rien d'affiché quand rien n'est trouvé.
- Le plafond « 5 forts + 10 contexte » (Louis 13/10) est inchangé : un fort en trop descend en contexte.
- Pas de nouvelle donnée de démo : l'acte SNCF seedé par #4769 est déjà classé (craft rule 9) ; la carte de démo n'est pas changée.
- Le registre `SEGMENT_CAPABILITY_HISTORY` n'est pas touché (constante propre, comme #4687) ; `.github/workflows` non plus.

## Décisions touchées

- Garde #4115 (grille : « Actualité = contexte sauf fait fort », Louis 12-13/10) : étendue, pas renversée.
- Garde #4732 / #4769 (fiche compte) ; doctrine du 18/09 « un correctif de collecte rattrape l'existant ».

- Garde #4565 (exclusion des stages, prédicat unique `internship_posting` — ligne voisine de la grille, inchangée).

## Limite connue

- `MERGER_SIGNALS_CAPABILITY.at` = fusion de #4769 ; à resserrer sur le déploiement réel s'il est plus tardif.
- `tests/test_discover_signal_grid_wiring_4115.py` (2 tests) échoue déjà sur main : dates de fixtures de début octobre hors fenêtre de fraîcheur.
