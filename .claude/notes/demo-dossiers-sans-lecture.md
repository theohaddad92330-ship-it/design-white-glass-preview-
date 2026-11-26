# Les six dossiers de démonstration, et qui porte `evaluation.dossier_read`

Mesuré le 14/09/2026 dans `apps/api/src/modules/demo/demo-dataset.ts` (`grep -n dossier_read:`).

| # | `company_name`      | Constante              | Porte `dossier_read` ? |
| - | -------------------- | ----------------------- | ----------------------- |
| 1 | Société Générale     | `societeGeneraleDossier` (l.553)  | ✅ (l.972) — cas HONNÊTE, 2 axes `unknown` |
| 2 | Thales                | `thalesDossier` (l.1457) | ❌ |
| 3 | leboncoin             | `leboncoinDossier` (l.2301) | ❌ |
| 4 | BlaBlaCar             | `blablacarDossier` (l.2980) | ❌ |
| 5 | SNCF                  | `sncfDossier` (l.3682) | ✅ (l.4084) — cas COMPLET, 7 axes mesurés |
| 6 | Decathlon             | `decathlonDossier` (l.4483) | ✅ (l.4550) — cas NO-GO, 2 axes `unknown` |

Les trois à seeder dans ce lot : **Thales, leboncoin, BlaBlaCar**. Ci-dessous, ce que
leur `raw_analysis` porte DÉJÀ — la matière du `dossier_read` à écrire. Un semis qui
sortirait de cette matière serait une donnée fictive (doctrine « JAMAIS de donnée
fictive »).

## Thales (l.1457-2301)

- **Secteur / identité** : NAF 70.10Z (siège de holding), SIREN 552059024 corroboré
  (`apps/ia/tests/test_homonym_disambiguation.py`). 1 000-1 999 salariés au registre
  (périmètre holding), groupe à 20,6 Md€, 3 300 recrutements annoncés en France pour 2026.
- **`priority_score`** 5, **`priority_justification`** : PRUDENT — calendrier excellent
  (acquisition Exail, recrutements 2026, tension documentée sur les sites), fit d'offre
  solide, accès MOYEN (pas de relation établie), concurrence installée sur le cœur
  défense. Ambition réaliste : un pilote court sur un périmètre NON CLASSIFIÉ.
- **`commercial_status`** watching, **`priority_gate`** prioritised, **`sprint`** extension
  (pilote court, périmètre non classifié — cohérent avec la justification).
- **`relationship_memory`** : jamais travaillé ensemble, entrée par un ancien collègue
  passé côté programme ; budget confirmé côté programme mais décision remontée au
  niveau groupe ; atout concurrentiel cité : habilitation défense à jour + deux
  références en environnement contraint.
- **`it_challenges` (thalesChallenges)** : tenir une architecture de plus de mille
  services ; industrialiser plus de soixante cas d'usage d'IA ; réécriture progressive
  et cohabitation des langages ; volume de livraisons et fiabilité de la chaîne.
- **`recent_signals` (thalesSignals)** : acquisition Exail (renfort d'intégration),
  tension documentée sur les sites industriels, un pilote data sur un périmètre civil,
  cartographie puis pilote sur les interfaces d'intégration après le rapprochement.
- **`go_no_go`** existant (ancien score /25) : PRUDENT, `commercial_score` 50,
  `data_confidence` 83.
- **Contacts déjà seedés** : Patrice Caine (Président du CA et DG, mandataire social) ;
  sièges de décision (roleSeat) — directeur technique de l'entité concernée par le
  rapprochement, responsable production/intégration/tests, responsable data d'une
  entité support, responsable achats d'une entité du groupe, DSI groupe, responsable
  sécurité industrielle et numérique, responsable SI industriels de site, responsable
  transformation numérique d'une entité civile.
- **Org graph** : `thalesOrgGraph` existe déjà (importé dans `raw_analysis.plan.org`).
- **`attackAngles` / `actionPlan`** : déjà seedés (renfort intégration Exail, renfort
  sites en tension, pilote data périmètre civil).

## leboncoin (l.2301-2980)

- **Secteur / identité** : NAF 63.12Z (portails internet), SIREN VIDE À DESSEIN (non
  corroboré dans le dépôt — le dossier montre la branche « résolution par le nom »).
  500-999 salariés, 831,3 M€ de CA au dernier exercice publié.
- **`priority_score`** 5, **`priority_justification`** : PRUDENT — les besoins
  (industrialisation de l'IA, exploitation de plateforme, fiabilité de la chaîne de
  livraison) collent au catalogue, mais l'ÉQUIPE INTERNE EST MATURE et construit
  l'essentiel elle-même. L'entrée se joue sur l'EXPLOITATION, pas sur la conception.
- **`commercial_status`** inbox (pas encore trié), **`priority_gate`** pending,
  **`sprint`** volume (qualification légère, sans plan de compte).
- **`it_challenges` (leboncoinChallenges)** : renfort d'exploitation sur les chaînes
  d'apprentissage automatique ; fiabilité de la chaîne de livraison.
- **`recent_signals` (leboncoinSignals)** : renfort d'exploitation de plateforme
  d'apprentissage automatique (signal récent, autres à relire dans le fichier).
- **`go_no_go`** existant : PRUDENT, `commercial_score` 50, `data_confidence` 73.
- **Contacts déjà seedés** : directeur data/infrastructure/plateforme, responsable
  ingénierie plateforme, RSSI, directeur de la régie publicitaire, responsable achats
  et prestations externes, responsable exploitation des plateformes, responsable
  apprentissage automatique, responsable fiabilité de la chaîne de livraison, directeur
  technique de la régie publicitaire.
- **Org graph** : `leboncoinOrgGraph` existe déjà.
- **`attackAngles` / `actionPlan`** : déjà seedés (« se placer sur ce que personne ne
  veut faire », « chiffrer le risque plutôt que la prestation », « engager une première
  mission datée »).

## BlaBlaCar (l.2980-3682)

- **Secteur / identité** : NAF 63.11Z (traitement de données et hébergement), SIREN
  VIDE À DESSEIN (seules les FILIALES ont un SIREN corroboré : Comuto Pro, BlaBla
  Insurance, Klaxit). 250-499 salariés, revenu NON PUBLIÉ au registre (dit en toutes
  lettres, sans nommer de fournisseur).
- **`priority_score`** 6 (le mieux noté des dossiers réels), **`priority_justification`** :
  PRUDENT — calendrier favorable (expansion financée, prise de poste technique
  récente), zones sans titulaire identifié, taille compatible avec une ESN moyenne.
  Le frein est l'ÉQUIPE INTERNE, mature et habituée à construire elle-même.
- **`commercial_status`** watching, **`priority_gate`** parked (`gate_reason:
  'no_budget'` — démonstration délibérée du croisement gate/sprint), **`sprint`**
  focus (effort maximum malgré l'écartement de priorité).
- **`it_challenges` (blablacarChallenges)** : fermer proprement les systèmes des
  activités sortantes ; surveiller la qualité des correspondances pendant l'expansion.
- **`recent_signals` (blablacarSignals)** : fermeture et reprise de données des
  activités sortantes.
- **`go_no_go`** existant : PRUDENT, `commercial_score` 60, `data_confidence` 77.
- **Contacts déjà seedés** : Frédéric Mazzella (Président du CA, mandataire social) ;
  sièges de décision — directeur de l'ingénierie plateforme, responsable technologique
  (montée en charge et IA), directeur financier, RSSI, responsable ingénierie activités
  bus/train, responsable qualité des correspondances, responsable partenariats de
  transport, responsable achats et prestations externes.
- **Org graph** : `blablacarOrgGraph` existe déjà.
- **`attackAngles` / `actionPlan`** : déjà seedés (entrer par une entité, faire passer
  un cas d'usage de la recherche à l'exploitation, prouver sur la disponibilité).

## Ce que ça donne pour la variation demandée (phase 2)

Les trois `priority_justification` existantes donnent déjà trois textures différentes :
- **Thales** : accès MOYEN, budget confirmé mais décision remontée au groupe → un bon
  candidat pour le dossier « axes PARTIELS » (preuves correctes mais pas toutes fraîches
  ou toutes sourcées au même niveau).
- **leboncoin** : équipe interne mature, construit l'essentiel elle-même, pas encore
  trié côté commercial → un bon candidat pour DEUX axes `unknown` (capacité d'achat
  externe et concurrence les moins mesurables, symétrique de Decathlon mais PRUDENT,
  pas no-go — la nuance à tenir).
- **BlaBlaCar** : le mieux noté, calendrier favorable, zones sans titulaire → un bon
  candidat pour le dossier TRÈS MESURÉ (sept axes `measured`, comme SNCF, mais avec
  ses propres impacts/leviers).

Aucun des trois ne porte de `no_go` — Decathlon est déjà le seul, et rien dans leur
`priority_justification` existante ne le justifierait (tous PRUDENT, jamais STOP).
