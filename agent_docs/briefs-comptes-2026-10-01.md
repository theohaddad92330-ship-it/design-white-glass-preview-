# Chantier — briefs comptes (démo 6 comptes + pipeline payant) — 2026-10-01

base : 8cfc187f4a — 2026-10-01

Source : mail de Théo (CEO) du 01/10 + 5 classeurs dans `agent_docs/sources/briefs-comptes-2026-10-01/`
(gitignoré) : `ENGIE_BELLUM_BRIEF.xlsx` (17 onglets), `BPCE_BELLUM_BRIEF.xlsx` (14),
`SG_BELLUM_BRIEF.xlsx` (19), `TOTALENERGIES_ONESIDE_BRIEF.xlsx` (15), `ALSTOM_ONESIDE_BRIEF.xlsx` (14).
Mode : intégrer des données + implémenter.

## Décisions (Louis, 01/10)

- D1 — Salle démo = **6 comptes cibles** : ENGIE, Groupe BPCE, Société Générale, TotalEnergies, Alstom, SNCF.
  Retirés : Thales, leboncoin, BlaBlaCar, Decathlon. Leurs features démo sont RE-SEMÉES sur les 6, jamais déclassées en « vide à dessein ».
- D2 — Coordonnées (mobiles, e-mails) des classeurs **en clair** en démo.
- D3 — « OneSide » (113 mentions, TotalEnergies + Alstom) **neutralisé** : « ton cabinet » / « axe métier ».
- D4 — Comptes d'exemple non-cibles **gardés** (TALENTBRIDGE, Lorvane Conseil, Commune de Saint-Exemple, Nova Logistique).
- D5 (tranché sans toi, règle de Théo « zéro donnée de notre propre performance ») — colonnes STATUT RELATION
  (« Tentative », « Faux numéro »…) et tout comptage de nos tentatives retirés à l'ingestion ; la garde-fou Engie
  « 49 statuts de relation » est réécrite sans ce chiffre.
- D6 (tranché sans toi) — UN contrat `AccountBrief` sert la démo ET le payant ; les contrôles de Théo sont du CODE
  qui tourne sur les deux (la démo est le premier client des contrôles : « Strasbourg siège de BPCE » devient un rouge CI).

## Inventaire

| id  | point                                                                                                                         | source                     | lot   | état  | preuve |
| --- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------- | ----- | ----- | ------ |
| 1   | Brief = onglet « Ce que je sais » : ~10 rubriques × (ce qu'on sait · ce que ça veut dire)                                     | mail §2, COCKPIT ×5        | L1,L3 | livré |        |
| 2   | Bandeau KPI du cockpit (6 tuiles valeur + sous-titre)                                                                         | COCKPIT l.3-5 ×5           | L1,L3 | livré |        |
| 3   | Graphiques cockpit (technos score, prix par besoin, besoins par canal, ESN par preuve, externes par entité / postes par site) | COCKPIT bas ×5             | L1,L3 | livré |        |
| 4   | Fiche compte (champ · valeur · fiabilité)                                                                                     | FICHE COMPTE ×5            | L1,L2 | livré |        |
| 5   | Achats avant d'appeler (élément · nom · ce que c'est · à avoir en tête · fiabilité)                                           | ACHATS ×5                  | L1,L2 | livré |        |
| 6   | Sites où vont les consultants / sites industriels                                                                             | SITES ×5                   | L2    | livré |        |
| 7   | Organigramme nominatif Engie 388 pers. (fonction, rattachement, responsable, mails, mobiles, accroche)                        | ENGIE-03                   | L2    | livré |        |
| 8   | Managers de périmètre Engie (82)                                                                                              | ENGIE-04                   | L2    | livré |        |
| 9   | Décideurs (Engie 94, BPCE 51, SG 46, TotalEnergies 101, Alstom 40)                                                            | DECIDEURS ×5               | L2    | livré |        |
| 10  | Contacts (BPCE 304, SG 1 781 avec code SI, TotalEnergies 14 métier)                                                           | CONTACTS                   | L2    | livré |        |
| 11  | Fonctions observées Engie                                                                                                     | ENGIE-06                   | L2    | livré |        |
| 12  | Entités et filiales (Engie 16, SG filiales et startups 15) avec statut SORTI                                                  | ENGIE-08, SG-05            | L1,L2 | livré |        |
| 13  | Engie Home Services (85 pers.)                                                                                                | ENGIE-15                   | L2    | livré |        |
| 14  | Organigramme SI SG : 87 codes, densité de contacts                                                                            | SG-03                      | L2    | livré |        |
| 15  | ESN présentes avec preuve + niveau de preuve (Confirmé/Observé/Indice)                                                        | ESN ×3, PRESTATAIRES TTE   | L1,L2 | livré |        |
| 16  | Technos / compétences à vendre (score, verdict, signaux, où, pourquoi)                                                        | TECHNOS ×5                 | L2    | livré |        |
| 17  | Besoins récents BPCE 17 avec prix, canal, manager opérationnel                                                                | BPCE-08                    | L1,L2 | livré |        |
| 18  | Besoins observés SG, signaux terrain, métiers externalisés, prix SG                                                           | SG-11..14                  | L2    | livré |        |
| 19  | Besoins et tendances (tendance · donnée · ce que ça veut dire)                                                                | BESOINS ×4                 | L2    | livré |        |
| 20  | Projets 2026-2027/2028/2029 (horizon, public, ce que ça change, offre à monter) → Veille                                      | PROJETS ×3                 | L2    | livré |        |
| 21  | Programmes industriels (TTE 14, Alstom 26)                                                                                    | PROGRAMMES                 | L2    | livré |        |
| 22  | Hypothèses de prestation avec question de qualification (TTE 24, Alstom 24)                                                   | HYPOTHESES                 | L2    | livré |        |
| 23  | Postes ouverts (BPCE 13, Alstom 19) → Veille                                                                                  | POSTES OUVERTS             | L2    | livré |        |
| 24  | Plan d'action (quand · action · quoi faire · pourquoi)                                                                        | PLAN ×5                    | L2    | livré |        |
| 25  | Externes en poste (Engie 75, BPCE 60, SG 45, TTE 13, Alstom 8) → Partenaires                                                  | EXTERNES ×5                | L2    | livré |        |
| 26  | Anciens du compte Alstom (8)                                                                                                  | ALSTOM-12                  | L2    | livré |        |
| 27  | Organisation métier TTE (85 fonctions)                                                                                        | TTE-04                     | L2    | livré |        |
| 28  | Garde-fous en FIN de brief (6-7 par compte)                                                                                   | GARDE-FOUS ×5, mail        | L1,L3 | livré |        |
| 29  | Contrôle : France uniquement (entités/sites hors France refusés sauf mention « référence »)                                   | mail, gardes BPCE/Engie/SG | L1    | livré |        |
| 30  | Contrôle : siège EXPLICITE, distinct des sites secondaires (incident Strasbourg/BPCE)                                         | mail, BPCE-13              | L1    | livré |        |
| 31  | Contrôle : périmètres sortis marqués (Equans/Engie, Treezor/SG, Reichshoffen/Alstom)                                          | mail, gardes               | L1    | livré |        |
| 32  | Contrôle : prix PAR CIRCUIT (direct / MSP / portage), jamais une moyenne inter-circuits                                       | mail, BPCE-13              | L1    | livré |        |
| 33  | Contrôle : ESN avec niveau de preuve obligatoire                                                                              | mail                       | L1    | livré |        |
| 34  | Contrôle : zéro donnée de notre propre performance (D5)                                                                       | mail                       | L1,L2 | livré |        |
| 35  | Contrôle : interprétation sur CHAQUE ligne du « Ce que je sais »                                                              | mail                       | L1    | livré |        |
| 36  | Neutraliser « OneSide » (D3)                                                                                                  | D3                         | L2    | livré |        |
| 37  | Écran Comptes = le brief                                                                                                      | mail §3                    | L3    | livré |        |
| 38  | Écran Contacts = organigramme avec mobiles                                                                                    | mail §3                    | L2    | livré |        |
| 39  | Écran Veille = projets + postes ouverts                                                                                       | mail §3                    | L2    | livré |        |
| 40  | Écran Partenaires = ESN présentes + routes de rang 2                                                                          | mail §3                    | L2    | livré |        |
| 41  | Retirer Thales, leboncoin, BlaBlaCar, Decathlon de la démo, features re-semées (D1)                                           | D1                         | L4    | livré |        |
| 42  | Pipeline payant : master public × interne (Market Memory, DataForge) × enrichissement → AccountBrief contrôlé                 | mail §4                    | L5    | livré |        |
| 43  | Changelog FR+EN + i18n FR+EN                                                                                                  | règles dépôt               | L3    | livré |        |
| 44  | Enrichissement en ligne « sur ce qui manque » avant le brief                                                                  | mail §4                    | L6    | livré |        |
| 45  | Rattrapage CIBLÉ des comptes payants déjà analysés (doctrine « un correctif de collecte rattrape l'existant »)                | doctrine                   | L6    | livré |        |
| 46  | Coût du brief agrégé au coût du run (`analysis_runs`)                                                                         | L5 rapport                 | L6    | livré |        |

## Lots

- **L1 — contrat + contrôles** (`packages/contracts`) : schéma zod `AccountBrief`, contrôles purs (29-35), tests. Fondation.
- **L2 — ingestion démo** : convertisseur xlsx → module TS généré par compte (D3, D5 appliqués), contrôles L1 en garde ; semis des 5 comptes (ENGIE, TTE, Alstom neufs ; SG, BPCE enrichis) dans les tables lues par Contacts, Veille, Partenaires ; `raw_analysis.account_brief` ; `demo-coverage.ts`.
- **L3 — écran** : onglet « Ce que je sais » de la fiche compte (rubriques, KPI, garde-fous en fin), FR+EN, changelog.
- **L4 — retrait** des 4 comptes, re-semis de leurs features sur les 6.
- **L5 — pipeline payant** (apps/ia) : étape qui produit `account_brief` pour tout compte, passée aux contrôles L1.

## Ce qu'on ne promet pas

- Aucun compte démo au-delà des 6 (D1).

## Reprise

- 01/10 : inventaire + décisions faits. En vol : L1 (`feat/brief-commercial-contrat-01-10`, opus) et L4
  (`feat/demo-retrait-4-comptes-01-10`, sonnet), worktrees locaux. Ensuite : L2 (après L4, mêmes fichiers démo) et
  L3 (après L1), puis L5.
- 01/10 soir : L1 = PR #3515 (CI, format corrigé `a502446191`). L4 = PR #3517 (agent coupé au plafond, travail sauvé,
  main fusionné `1d36908020`, 3 specs démo vertes en local ; CI fait foi). L2a (convertisseur + 5 JSON, 0 violation,
  0 « OneSide ») + L3 (onglet, GA-19 corrigé) = branche `feat/brief-commercial-01-10`. L2b (semis 3 comptes neufs +
  brief sur SG/BPCE + Veille + Partenaires) en vol sur `feat/brief-commercial-demo-semis-01-10` (= L1+L2a+L3+L4).
  Plan de merge : #3515 et #3517 au vert → PR unique L2a+L3+L2b. Puis L5 (pipeline payant, apps/ia).
- 01/10 nuit : #3515 MERGÉE. #3517 = démo 6 comptes + données + écran + semis + rouges corrigés (`34a9ab765b`), CI en cours.
  #3519 = L5 pipeline (étape après le graphe, `analysis.worker.ts`), CI en cours. Reste L6 (points 44-46) puis recette écran.
- 01/10 nuit (2) : #3519 MERGÉE (L5 + L6 : étape brief, enrichissement web des manques, rattrapage ciblé
  `POST internal/admin/commercial-brief-backfill`, coût au run). #3517 rouges corrigés (token surface, jeu figma 6 comptes,
  axes de score des 3 dossiers neufs, test maquettes) — `abd283e2b4`, fusion auto au vert. Ensuite : recette écran.
- 01/10 21 h : #3517 MERGÉE `d9015f3b6a`, servie en prod (API d9015f3b6a, IA b14001ca53 ⊇ #3519). Recette écran :
  PASS — 6 comptes cibles seuls (4 retirés absents), BPCE siège Tours Duo Paris 13e, prix par canal, Treezor/Equans sortis,
  0 « OneSide », SNCF sans onglet, Veille ENGIE/Alstom, Partenaires ENGIE (13 ESN). FAIL/PARTIAL en correction
  (`fix/demo-brief-recette-01-10`) : onglet brief pas ouvert à l'arrivée (`?tab=overview`), mobiles absents de la liste
  Contacts (compteur 0), « Préparation » démo ≈ 60 s. Console non prouvée. « Lumen Infra Services » = partenaire de
  sourcing fictif (#2818), compte d'exemple non-cible (D4).
- 02/10 : #3531 MERGÉE `bd78218f8c`, servie. Recette écran : arrivée sur « Ce que je sais » (ENGIE, BPCE) PASS ; SNCF arrive
  sur un onglet non vide PASS ; « coordonnées trouvées » 315/462 PASS ; préparation démo ≤ 6 s ; 0 erreur console. Mobiles
  sur les cartes Contacts : 1/10 en tête de liste — cohérent avec la donnée (164 mobiles sur 463 contacts semés, 18/33
  décideurs), à surveiller. Chantier livré ; reste hors périmètre : brief rejeté retenté à chaque rattrapage (coût).
- SNCF n'a pas de classeur : son onglet « Ce que je sais » n'apparaît pas (on n'affiche pas ce qu'on n'a pas) — à
  classer « vide à dessein, raison : aucune source » dans `demo-coverage.ts` au lot L2.

## 15/10/2026 — BRIEF-FIX : le brief n'existait sur aucun compte réel

- **Fait prouvé en prod** (journaux Railway 13-15/10) : 0 compte sur 79 avait `raw_analysis.commercial_brief` ; les 6 appels
  `POST /commercial-brief` finissaient en 502 (`Claude troncature … 8000 tokens de sortie jetés`, puis
  `sortie sans objet JSON lisible`).
- **Cause** : `_MAX_TOKENS = 8_000` (`apps/ia/app/routers/commercial_brief.py`) trop bas — le brief BPCE de référence
  fait ~6 000 tokens, et un dossier réel dépasse. **Plafond porté à 16 000** (sous le seuil non-streaming du SDK, très
  sous le max de Sonnet).
- **Concision** : règle 13 du prompt `bellum_commercial_brief` (limites par section). **Une seule reprise** à 32 000 si la
  sortie est coupée au plafond (`output_tokens >= plafond` et JSON illisible) ; une 2e troncature reste un 502.
- **Visibilité** : un échec du step API (`failed`) est compté dans `raw_analysis._api_metrics.commercial_brief_status =
'failed'` (aucun faux brief écrit, onglet absent) en plus du WARN avec le code IA.
- **Rattrapage** (à lancer par un humain APRÈS déploiement, NON lancé ici) :
  `POST /internal/admin/commercial-brief-backfill` — `workspaceId`, `limit` 20, `afterId` pour paginer ; un brief déjà
  écrit n'est jamais touché (`keepExisting`).
