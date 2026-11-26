# DATAFORGE V10 — ingestion et dé-silotage 66 domaines (24/08/2026)

Source : mail de Théo du 24/08 + `DATAFORGE_V10_BELLUMAI_CANONICAL_INTEGRATION.csv`
(345 Mo, **jamais commité** — l'opérateur le garde en local et le passe au script
d'ingestion). Le pack `DATAFORGE_V10_MASTER_PACK.zip` (Drive) est la source brute
à archiver hors dépôt ; le CSV canonique est la vue aplatie qui sert d'index.

## 1. Ce qui a été vérifié (mesures, pas déclarations)

| Affirmation de Théo                                                                  | Mesure                                                                                           |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| 78 870 lignes = 1 195 comptes × 66 domaines                                          | ✓ exact (158 colonnes)                                                                           |
| ~97,5 % des lignes en Tier D                                                         | ✓ 76 871 D / 1 451 C / 412 B / 136 A                                                             |
| `recommended_procurement_route` identique sur les 66 domaines d'un compte            | ✓ **0 compte** avec deux routes distinctes — seed de recherche compte, jamais preuve par domaine |
| Policies embarquées (`bellum_user_claim_policy`…)                                    | ✓ cohérentes tier par tier                                                                       |
| Repo : `OFFER_DOMAINS` = 7, `esn_it` présélectionné, `_MAX_IT_SURFACE = 20`, 7 packs | ✓ tout vérifié vrai                                                                              |

**Trou que le mail ne voit pas : 4 comptes sur 1 195 portent un vrai SIREN**
(34 cellules non vides, dont 30 marque-places « à compléter lot N » — mesuré
avec le parseur livré, 78 870/78 870 lignes lues, 0 rejet).
Même famille que le CSV des 477 ESN (tome 1). Doctrine tome 2 : la résolution
d'entité écarte tout candidat sans SIREN → le mapping DATAFORGE ↔ Bellum se fait
par SIREN **résolu par nous**, en tâche de fond par lots (mécanique
`esn-directory` réutilisée), jamais par nom.

Tier A concentré sur ~30 grands comptes (Veolia 8, SG/AXA/BPCE/Capgemini 7…).

## 2. Décisions (Louis, 24/08)

- **D-DF1** : les deux chantiers en PARALLÈLE, branches séparées, A mergé avant B.
- **D-DF2** : l'onboarding **cesse de présélectionner `esn_it` en silence** — le
  portefeuille de domaines est un choix explicite. Espaces existants inchangés
  (leur `offer_domain` stocké reste ; portefeuille absent = dérivé de lui).

## 3. Refus (avec leur raison)

- **Tier D ne sort JAMAIS vers l'utilisateur.** `SECTOR_PRIOR_ONLY` = prior de
  scoring interne. Un prior sectoriel affiché comme fait est de la donnée
  inventée (règle n°1 du dépôt).
- **La route achats ne s'hérite pas par domaine** (P0 de Théo, confirmé par la
  mesure) : seed de recherche au niveau compte, `bellum_procurement_policy`
  conservé tel quel en base.
- **Pas de 66 packs de prompts écrits main.** La taxonomie 66 est de la DONNÉE
  (contrat + table) ; les prompts passent par les 7 packs existants via le
  mapping `bellum_existing_offer_pack` livré dans le CSV. Un pack par domaine
  s'écrira quand un client le réclamera, pas avant.
- **Pas de second système de prisme.** `ConsultingDomainContext` (mail) =
  extension de `domain_focus` existant, qui fait déjà exactement ça (phases 1-4
  du dé-silo, byte-identité IT verrouillée par goldens).
- **`it_surface` n'est pas renommé sur les analyses stockées.** Les
  `raw_analysis` en production portent la clé pour toujours ; le web la lira
  toujours. Le successeur `domain_demand_surface` est ADDITIF : émis pour une
  ESN non-IT, `it_surface` byte-identique pour une ESN IT.
- **`decision_role`/`contact_ranking` par domaine : plus tard.** Déjà documenté
  au dé-silo — exige un changement de contrat API↔IA (`esn_profile` distinct
  dans `ClassifyRequest`).

## 4. Chantier A — ingestion (branche `feature/dataforge-v10-staging`)

- **A1** : tables partagées `dataforge_accounts` (1 195) +
  `dataforge_account_domains` (78 870), déclarées GA-16. Normalisation : les
  colonnes `account__*` vivent UNE fois sur le compte (le CSV les répète 66×).
  Le compte porte `resolution_status` (pending/resolved/unresolved) comme
  `esn_directory`.
- **A2** : parseur PUR (`dataforge-csv.ts`, testé sur fixtures) + script
  d'ingestion streaming (`pnpm --filter @bellum/api ingest:dataforge <csv>`), idempotent
  par `(source_id, domain_code, data_version)`. Un tier hors {A,B,C,D} = ligne
  écartée AVEC sa raison, jamais devinée.
- **A3** : module `dataforge/` + cron de résolution SIREN par lots de 25
  (`41 * * * *`, kill-switch `DATAFORGE_RESOLUTION_DISABLED=true`), via
  `/esn/resolve` de l'IA (recherche-entreprises, back_off 429 déjà appris).
  Jamais de suppression : un nom irrésolu garde sa ligne et sa raison.
- **A4** : lecture `priorsForSiren(siren)` — le point d'entrée que B consommera.
  Couverture visible : `GET /internal/dataforge/coverage` (InternalSecretGuard).

## 5. Chantier B — dé-silotage (branche `feature/offer-portfolio`)

- **B1** : taxonomie 66 dans `@bellum/contracts` (`CONSULTING_DOMAINS` : code,
  labelFr, labelEn, groupe d'affichage normalisé ~10, pack parmi les 7).
  `product_design_or_commercial` (CSV) → `product_design`.
- **B2** : `offer_domains: string[]` dans les réponses ESN (ADDITIF —
  `offer_domain` singulier reste) ; `esnAnswersToProfileData` en dérive
  `offerPortfolio` + noms français pour le prisme. Portefeuille absent =
  comportement historique byte-identique.
- **B3** : onboarding web — étape portefeuille multi-select groupée, AUCUNE
  présélection (D-DF2), validation ≥ 1 domaine. i18n FR+EN depuis le contrat.
- **B4** : IA — `domain_focus` étend le prisme au portefeuille : pack dominant
  déterministe + énumération des domaines dans la lentille. ESN IT / profil
  vide → prompts byte-identiques (goldens).
- **B5** : `discover_scoring` `domain_demand_surface` — **REQUALIFIÉ en suite**
  (mesuré le 24/08) : le barème est une liste FIXE contractuelle
  (`DISCOVER_SCORE_BLOCKS`, miroir de `_BLOCK_MAXIMA`, somme 100) consommée par
  quatre composants web et deux invariants de test — le rendre PAR PROFIL est
  un chantier à part. Et l'ordre des travaux compte : les SOURCES de Découvrir
  sont filtrées IT (France Travail, BOAMP CPV 48/72) — renommer le bloc
  « surface de demande » au-dessus de signaux IT serait un mensonge mieux
  habillé. Le dé-silotage des sources passe d'abord.
- **B6** : goldens non-IT (portefeuille finance/risque, RH), parité démo
  (`esn_profiles` reste « vide à dessein » — l'onboarding n'est pas joignable
  depuis le lien de démonstration), changelog FR+EN
  (`2026-08-24-portefeuille-domaines`).

## 6. Reste à faire après ce chantier (suivi)

- **B5 — barème Découvrir par profil** (`domain_demand_surface`) : voir la
  requalification ci-dessus ; passe APRÈS le dé-silotage des sources.
- **Dé-silotage des SOURCES de Découvrir** : ROME par domaine côté France
  Travail, CPV par domaine côté BOAMP/DECP — sans lui, les signaux restent IT
  quel que soit le portefeuille.

- Ingestion des tables SÉPARÉES du pack V10 (evidence records, claim audit,
  gatekeepers, missions/TJM) — le CSV canonique est l'index, pas le tout.
- Exposition produit des faits Tier A/B (avec source + date + fraîcheur) dans
  l'onglet Accès — demande une décision d'écran.
- Couverture contacts non-IT (knowledge pack acheteurs par domaine) et
  `decision_role` par domaine (contrat API↔IA).
- Rafraîchissement des Tier B (« bon signal historique, à rafraîchir »).
