# Compte — audit « collecté vs affiché »

But : pour la fiche **compte** (comme le travail Apollo sur les contacts), extraire un
maximum de données factuelles ET vérifier que tout ce qui est collecté est réellement
affiché. Ce document liste les données **collectées et persistées** dans
`accounts.raw_analysis` / `accounts.apollo_enrichment` mais **PAS affichées** dans la
fiche web (les « données qui dorment »), et ce que la PR `feat/account-rich-display`
câble.

## Mécanique de persistance (rappel)

- Le service IA (`apps/ia`, phase 1 `_research()`) construit UN dict `result` ; grâce à
  `extra="allow"`, **chaque `result["clé"]` survit** dans ce que le worker API persiste
  comme `account.raw_analysis` (même les clés non déclarées au contrat).
- Côté API, `AccountsService.applyResearch` écrit `raw_analysis = toSnakeCaseKeys(data)`
  (donc les clés camelCase de l'IA arrivent en **snake_case** dans la colonne) et stocke
  `apollo_enrichment` **tel quel** (camelCase, colonne dédiée).
- Le `GET /accounts/:id` renvoie `a.*` + `raw_analysis` **entier** (moins la seule clé
  `branches`, paginée à part). Donc **toutes** les clés ci-dessous atteignent le client
  web — rien n'est filtré côté API.
- Côté web, `parseAccountAnalysis()` ne garde que les clés **déclarées** au contrat
  (`accountAnalysisShape`) ; les clés non déclarées survivent uniquement sur la colonne
  brute. Les composants doivent donc lire une clé déclarée pour la voir via le hook.

## Tableau : collecté-mais-caché (avant cette PR)

| Source                    | Clé `raw_analysis` (après snake-case)                                                                        | Contenu factuel                                                               | Affiché avant ?                                                                                                                                                                                                                                                                |
| ------------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Apollo org**            | `apollo_enrichment` (colonne, camelCase)                                                                     | logo, effectifs, industrie, fondation, CA, funding, technos, LinkedIn/Twitter | **Partiel** — carte Firmographie (effectifs/industrie/fondation/CA/funding/technos/liens). **Manquants** : logo (le hero utilise les initiales), description, adresse, téléphone, cotation, keywords, société mère, effectifs par département (champs non extraits jusqu'ici). |
| **Pappers financiers**    | `financials_history` [{year, revenue, net_result, headcount}]                                                | comptes annuels FR                                                            | **Non**                                                                                                                                                                                                                                                                        |
| **Pappers identité**      | `capital`, `legal_form`, `creation_date`, `activity_label`, `corporate_purpose`, `rcs_status`, `pappers_url` | forme juridique, capital, objet social, lien Pappers                          | **Non**                                                                                                                                                                                                                                                                        |
| **Pappers dirigeants**    | `executives`, `c_level`                                                                                      | représentants légaux                                                          | **Non** (l'organigramme est bâti sur les contacts, pas ces champs)                                                                                                                                                                                                             |
| **INPI / Pappers bénéf.** | `beneficial_owners` [{name, detentionPart, detentionVote}]                                                   | bénéficiaires effectifs                                                       | **Non**                                                                                                                                                                                                                                                                        |
| **BOAMP**                 | `public_tenders` [{title, buyer, location, deadline, cpv, url}]                                              | appels d'offres IT ouverts                                                    | **Non**                                                                                                                                                                                                                                                                        |
| **DECP**                  | `awarded_contracts` [{title, buyer, winner, amount, url}], `purchasing_thread`                               | marchés IT attribués (titulaire = concurrent)                                 | **Non**                                                                                                                                                                                                                                                                        |
| **Emploi**                | `it_job_signals` [{title, location, date, contractType, skills, company, url, source}]                       | offres IT (France Travail/APEC/WTTJ)                                          | **Non**                                                                                                                                                                                                                                                                        |
| **GitHub org**            | `github_signals` {org, url, publicRepos, topLanguages, activeRecentRepos, lastActivity}                      | signal tech ingénierie                                                        | **Non**                                                                                                                                                                                                                                                                        |
| **tech-detect**           | `detected_tech_stack` [str]                                                                                  | stack front réelle (Wappalyzer-lite)                                          | **Non** (seulement dans l'export PDF)                                                                                                                                                                                                                                          |
| **BODACC**                | `legal_signals` [{date, type, tribunal, label}]                                                              | annonces légales                                                              | **Non** (au mieux un signal générique dans Veille)                                                                                                                                                                                                                             |
| **Brave News**            | `news` [{title, url, age, description}]                                                                      | presse récente                                                                | **Non** (au mieux Veille)                                                                                                                                                                                                                                                      |
| **recherche-entreprises** | `registry_annuaire` {name, siren, nafCode, headcountRange, dirigeants…}                                      | annuaire officiel                                                             | **Non**                                                                                                                                                                                                                                                                        |
| **EDGAR US (SEC)**        | _(prompt-only)_                                                                                              | CA/résultat net/actions (XBRL 10-K)                                           | **N/A — non persisté** en champ structuré (injecté seulement dans le prompt)                                                                                                                                                                                                   |

Composants « orphelins » (existent, lisent de vrais champs, **montés nulle part**) :
`sections/GeneralInfo`, `BusinessOverview`, `Technologies`, `Competitors`,
`ExecutiveSummary`, `ItPrograms`, `AttackAngles`. Certains champs (`technology_stack`,
`competitors`, `program_names`) ne survivent que dans l'export PDF.

## Ce que câble cette PR

1. **Apollo org — extraction max** (`apollo_org.py`, même appel = zéro coût) :
   `shortDescription` (blurb), `rawAddress`/`city`/`state`/`country`/`postalCode`,
   `phone`, `publiclyTradedSymbol`/`publiclyTradedExchange`, `departmentalHeadCount`,
   `keywords`, `parentOrganization`, `retailLocationCount`. Present-only, jamais inventé.
2. **Type contrat** `AnalysisApolloOrgEnrichment` étendu ; nouvelles sous-schemas
   tolérantes ajoutées à `accountAnalysisShape` pour exposer les sources cachées via le
   hook typé.
3. **Affichage (Vue d'ensemble)**, present-only, sourcé, masqué si vide, i18n FR+EN :
   - Firmographie Apollo enrichie (description, adresse, téléphone, cotation, keywords,
     société mère, effectifs par département).
   - **Données financières** (Pappers `financials_history` + capital + forme juridique +
     lien Pappers).
   - **Stack technique** (`detected_tech_stack` + technos Apollo, dédupliqués).
   - **Dirigeants & bénéficiaires** (`executives`/`c_level` + `beneficial_owners`).
   - **Appels d'offres & marchés attribués** (`public_tenders` + `awarded_contracts`).
   - **Offres d'emploi IT** (`it_job_signals`) comme signaux de croissance.
   - **Signal GitHub** (`github_signals`).

Non couvert (hors périmètre / risque) : `legal_signals` BODACC et `news` (déjà destinés à
la Veille), `registry_annuaire` (redondant avec Pappers), EDGAR (prompt-only — nécessite
d'abord de le persister côté IA).
