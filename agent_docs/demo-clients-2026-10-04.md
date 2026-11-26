# Chantier « Démo clients » — 04/10/2026

Source : Drive `BELLUMAI - Team / 02 · INTERNE / DÉMO CLIENTS`, 8 zips (theo@bellum-it.com), 295 fichiers
(268 csv · 19 xlsx · 8 md), ~11 600 lignes. Extraits : `agent_docs/sources/demo-clients-2026-10-04/` (gitignoré),
classeurs uniques à plat : `agent_docs/sources/briefs-comptes-2026-10-04/` (18 xlsx — les 2 BPCE_BELLUM_BRIEF sont identiques, sha égal).
Schéma complet (onglets, colonnes, cockpits, doublons, remplissage) : `.claude/sources/demo-clients-schema.md`.
Rapport code : `.claude/sources/demo-clients-rapport-code.md`.

Mode : **implémenter**. Pipeline existant : `apps/api/src/scripts/commercial-brief/` (convertisseur xlsx → JSON
contrat `commercial-brief.ts`), 5 comptes livrés le 01/10 (ENGIE, BPCE, SG, TotalEnergies, Alstom).

## Décisions (Louis, 04/10)

- D1 **Tout le monde voit tout** : un seul semis pour toutes les salles. Variantes fusionnées : BPCE = brief groupe + couche
  Toulouse (Thélio) ; Sanofi = union Lyon (Alpineo) + Digital France (QuickSort).
- D2 **Laura démo inchangée** (script de 34 questions).
- D3 **Marchés = capacité PRODUIT**, pas seulement démo : « Bellum doit aussi être capable de gérer ça ».
- Règles héritées du 01/10 (README des briefs) : nom de l'ESN prospect neutralisé · aucune donnée de notre propre performance ·
  périmètres sortis `exited` · coordonnées en clair, jamais inventées · France uniquement.
- D4 (Louis 04/10) **Suisse ouverte** : le contrat accepte `scope: suisse` (renverse partiellement « France uniquement » du 01/10 pour ABB seul ; les fiches France inchangées).
- D5 (Louis 04/10) **Marchés locaux : personnes EN CLAIR** dans la fiche marché (nom, poste, employeur, e-mail, mobile), rattachées aussi à la fiche de leur employeur quand il est dans l'espace.
- D6 (Louis 04/10) **Grille de prix d'un client payant** : d'abord SES besoins et missions (déterministe, n affiché, cellule absente si n<3) ; **sinon c'est Bellum qui les récupère** (collecte propre, c79 : prix observés publiquement dans la zone, source étiquetée « observé », fournisseurs jamais nommés, jamais les prix d'un autre espace GA-43).
- D7 (Louis 04/10) **Place** : Comptes › « Marchés locaux » + Laura + puce sur la fiche compte ; /pilotage/marche renvoie vers la zone.
- D8 (Louis 04/10) **Génération d'une fiche marché = 2 crédits**, cache 7 j, lecture gratuite.
- D10 (Louis 05/10) **Score démo 5 « non arbitré » gardé, mais ÉCRIT** à côté du score (liste et fiche) — pas de score vide, pas de score dérivé.
- D11 (Louis 05/10) **Tuile BPCE « 304 » retirée** (chiffre manuscrit du classeur, contredit 427 brief / 469 liste) — par règle du convertisseur, jamais en éditant le JSON.
- D12 (Louis 05/10) **E2E 2154.21 : `POST /laura/plan` exclu du collecteur d'écritures** de ce test (carte proactive différée, instable) — rien d'autre retiré de la surveillance.
- D13 (Louis 06/10) **Les 5 comptes d'extension (Thales, Renault, EDF, Orange, Airbus, #3294) sont REMPLIS** depuis le public (secteur, siège, signaux, périmètres), score « non arbitré » comme les autres, jamais de personne inventée — pas retirés, pas cachés.
- D14 (Louis 06/10) **Bandeau /accounts : chaque chiffre nomme sa base** (« 10 suivis sur 19 comptes », « parcours observés sur N contacts ») — plus de chiffre plus grand que le total sans dénominateur.
- Tranché sans Louis (recos du plan) : Lyon-Suisse scindé en 2 zones ; zones = départements/cantons + libellé (≤10/espace, ≤6 départements) ; règles suisses = contenu du brief démo ; galaxies via group_head_siren en v1 ; libellé « Marchés locaux » / « Local markets ». Plan : `agent_docs/capacite-marche-2026-10-04.md`.
- D9 (Louis 05/10) **Démo « au max »** : la salle montre TOUT ce que le produit sait faire, le plus fidèlement possible — on garde les voies d'accès personnelles déjà semées (Trévisani, Palmieri, Bini Smaghi) et le consentement d'enregistrement de l'appel semé ; on ne retire une fonction démo que si elle repose sur un compte FICTIF (D « plus d'exemples », 04/10).

## Calendrier des démos

| Date            | ESN             | Comptes                                                                   |
| --------------- | --------------- | ------------------------------------------------------------------------- |
| lun 05/10 13h30 | NGen Nantes     | Naval Group Indret · Chantiers de l'Atlantique · marché Nantes-St-Nazaire |
| mar 06/10 10h30 | Thélio Toulouse | BPCE (+ Toulouse)                                                         |
| mar 06/10 15h00 | QuickSort       | BNP Paribas · Bpifrance · Sanofi                                          |
| mer 07/10 14h00 | Meedz Lille     | ADEO-Leroy Merlin · Kiabi · marché Lille                                  |
| jeu 08/10 10h00 | Les Pertinents  | BPCE                                                                      |
| jeu 08/10 15h00 | Alpineo         | Sanofi Lyon · ABB Suisse · marché Lyon-Suisse                             |
| ven 09/10 09h30 | OneSide         | TotalEnergies · Alstom                                                    |

## Inventaire (un point par classeur)

| #   | Classeur                                  | Onglets | Statut  | Lot                   | Preuve                                            |
| --- | ----------------------------------------- | ------- | ------- | --------------------- | ------------------------------------------------- |
| 1   | NAVAL_GROUP_INDRET_BELLUM_BRIEF.xlsx      | 10      | MERGÉ   | A1                    | PR #3600 → 431f5f04                               |
| 2   | CHANTIERS_ATLANTIQUE_BELLUM_BRIEF.xlsx    | 8       | MERGÉ   | A1                    | PR #3600 → 431f5f04                               |
| 3   | BNP_PARIBAS_QUICKSORT_BELLUM_BRIEF.xlsx   | 19      | À FAIRE | A2                    |                                                   |
| 4   | BPIFRANCE_QUICKSORT_BELLUM_BRIEF.xlsx     | 15      | À FAIRE | A2                    |                                                   |
| 5   | SANOFI_QUICKSORT_BELLUM_BRIEF.xlsx        | 19      | À FAIRE | A2                    |                                                   |
| 6   | SANOFI_LYON_BELLUM_BRIEF.xlsx             | 17      | À FAIRE | A2 (fusion Sanofi)    |                                                   |
| 7   | ADEO_LEROY_MERLIN_MEEDZ_BELLUM_BRIEF.xlsx | 15      | À FAIRE | A2                    |                                                   |
| 8   | KIABI_MEEDZ_BELLUM_BRIEF.xlsx             | 12      | À FAIRE | A2                    |                                                   |
| 9   | BPCE_TOULOUSE_THELIO_BELLUM_BRIEF.xlsx    | 25      | À FAIRE | A3 (couche Toulouse)  |                                                   |
| 10  | BPCE_BELLUM_BRIEF.xlsx (×2 identiques)    | 14      | À FAIRE | A3 (rafraîchir)       |                                                   |
| 11  | ENGIE_BELLUM_BRIEF.xlsx                   | 17      | À FAIRE | A3 (rafraîchir)       |                                                   |
| 12  | SG_BELLUM_BRIEF.xlsx                      | 19      | À FAIRE | A3 (rafraîchir)       |                                                   |
| 13  | TOTALENERGIES_ONESIDE_BRIEF.xlsx          | 15      | À FAIRE | A3 (rafraîchir)       |                                                   |
| 14  | ALSTOM_ONESIDE_BRIEF.xlsx                 | 14      | À FAIRE | A3 (rafraîchir)       |                                                   |
| 15  | ABB_SUISSE_BELLUM_BRIEF.xlsx              | 15      | À FAIRE | A3 (scope suisse, D4) |                                                   |
| 16  | MARCHE_NANTES_SAINT_NAZAIRE.xlsx          | 7       | À FAIRE | M (capacité marché)   |                                                   |
| 17  | MARCHE_LILLE_MEEDZ.xlsx                   | 10      | À FAIRE | M                     |                                                   |
| 18  | META_MARCHE_LYON_SUISSE.xlsx              | 14      | À FAIRE | M                     |                                                   |
| 19  | LISEZ_MOI.md ×8                           | —       | LU      | —                     | ordre de lecture, cadrage hors IT (NGen, OneSide) |

## Lots

- **A1** (pour lun 13h30) : Naval Group Indret + Chantiers de l'Atlantique → plans, JSON, DEMO_DOSSIERS, couverture démo.
- **A2** (pour mar 15h) : BNP, Bpifrance, Sanofi fusionné, ADEO, Kiabi.
- **A3** (pour mar 10h30) : rafraîchir les 5 comptes du 01/10 depuis les classeurs du 04/10, couche Toulouse sur BPCE, ABB selon D4.
- **M** : capacité « Marché / zone » produit (contrat, stockage, API, écran, génération IA, démo des 3 marchés). Conception d'abord.

## Ce qu'on ne promet pas

- Laura démo répondant sur les briefs (D2).
- Un lien de démo par prospect (D1).

## Reprise (06/10 après-midi)

**En prod** : #3615, #3622, #3616 (Marchés locaux), **#3735** (finitions : porte barre latérale, listes repliées, pluriels, Suisse « RÈGLES LOCALES ») — recette Lille 06/10 PASS 6/6, 0 erreur console, « présentable avec réserves » ; chrono d'entrée salle 57-70 s (limite). **#3739** (4cf9ce7f, API servie fc9348f3 qui la contient) : D13 Airbus/Orange/EDF/Renault/Thales remplis (score 5 non arbitré, 1 tâche), D14 bandeau « sur N comptes », pastille Score « non arbitré ». **#3741** (5efa823b, web/Vercel) : tranche « 10 001 et plus », « Ce que je sais » replié à 4, espacement Comptes liés.
**NON RECETTÉS** : #3739 et #3741 à l'écran (machine au ROUGE au moment du merge) ; mobile 390 px (`recetteur-mobile`) ; espacement Comptes liés mesuré en px.
**Gardés à dessein** : e-mails perso en clair (D5 + règle coordonnées en clair) ; Decathlon ×3 (entités distinctes, jamais de fusion).
**À relire par Louis** : filiales des comptes d'extension écrites de mémoire (Airbus Commercial Aircraft, Orange Business, Enedis, Dacia, Thales Alenia Space…).
**Reste** : L6 Laura `read_market_brief` ; L2/L3 génération IA (2 crédits, cache 7 j) ; chrono salle < 60 s (semis plus lourd).
**Recette 07/10 12h15 (avant Meedz)** : 7/7 PASS — entrée salle ≤ 14 s ; bandeau « 10 suivis sur 19 comptes » ; 5 comptes d'extension remplis (filiales vues : Airbus Commercial Aircraft/Helicopters/Defence and Space, Renault Dacia/Alpine/Mobilize, EDF Enedis/Framatome/Dalkia, Orange Business/France, Thales Alenia Space/Systèmes Aéroportés) ; Kiabi « non arbitré » ; Lille tranches « 10 001 et plus », « Ce que je sais » 711 px replié, Comptes liés 8 px. ⚠️ À CORRIGER APRÈS LA DÉMO : `TypeError: Cannot read properties of undefined (reading 'component')` (runLoader) + écran noir ~3 s à l'ouverture de /accounts/marches ; « Directeur des systèmes d'information — Directeur des systèmes d'information » répété (porte d'entrée des 5 comptes) ; libellé tronqué « Direction / Management de tran… » (prix médian par métier) ; ADEO en-tête « À trier » vs liste « Priorité forte » ; Kiabi/Chantiers/TotalEnergies « À programmer » ; bulle « Assistant IA » qui recouvre le bas droit.
**Prochaine commande** : porte santé verte → recette écran salle démo : /accounts (D13 5 comptes remplis, bandeau « sur N comptes », Kiabi Score « non arbitré ») + Lille (tranches, « Ce que je sais » replié, espacement) avant Meedz 07/10 14h ; puis Lyon/Suisse pour Alpineo 08/10 ; puis L6 Laura.
