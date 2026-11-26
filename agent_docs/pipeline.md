---
sources:
  - apps/ia/app/routers/phase*.py
  - apps/api/src/modules/analysis/analysis.worker.ts
  - apps/api/src/modules/analysis/analysis.service.ts
---

# Pipeline d'orchestration — Comment une analyse fonctionne

## Les deux pipelines, à ne pas confondre

Ce document décrit le **pipeline d'ANALYSE** : ce qui se passe entre le clic
« Analyser » et le dossier livré, en cinq étapes séquentielles.

Le **pipeline de DONNÉE** (tome 2/8) est autre chose : il décrit ce que devient
une information depuis la source jusqu'à l'écran, quel que soit le chemin qui l'a
collectée. Ses sept étages, dans l'ordre :

```
① COLLECTE          sources N1→N5, par territoire et fenêtre
② NORMALISATION     dates ISO/UTC, montants en centimes, NAF officiel, domaines
③ RÉSOLUTION        qui est cette entreprise ? — le SIREN est le pivot
④ DÉDUPLICATION     une entité = une ligne ; proposé, jamais fusionné au-delà du domaine
⑤ QUALIFICATION     fait / observation / inférence / hypothèse — jamais spéculation
⑥ SCORING           intérêt, adressabilité — deux nombres, jamais fondus
⑦ DECAY             une donnée périmée ne disparaît pas : elle redevient INCONNUE
   EXPOSITION       avec sa source, sa date, et « ce que je ne sais pas »
```

Les niveaux de collecte, le principe qui tranche les cas limites et les refus
permanents sont dans `CLAUDE.md` ; le détail par source et ses limites dans
`agent_docs/tome2-donnee-sources-pipeline-2026-08-21.md`.

## Vue d'ensemble

Utilisateur tape "SNCF" → clic Analyser → 5 étapes séquentielles → résultat en 3-6 min.
Chaque étape sauvegarde en BDD AVANT de lancer la suivante.

## Étape 0 — Vérifications (<1s)

1. Vérifier JWT (auth Supabase)
2. Vérifier crédits (table user_credits : accounts_used < accounts_limit)
3. Créer le compte dans accounts (status = 'analyzing')
4. Charger le profil ESN (table profiles → onboarding_data)
5. Créer un job BullMQ (queue: 'analysis', data: { accountId, companyName, profileData })
6. Répondre au client : { jobId, accountId }

**Le compte repris est celui de la MÊME société, quel que soit son statut** (#4603, 26/10/2026).
Avant de créer, `AnalysisService` cherche un compte existant de la même société **quel que soit son
chemin d'entrée** (CRM, import, Découvrir) **et quel que soit son statut** — via
`accountsService.findSameCompanyAccount(userId, company_name, { siren })`. La clé est le **SIREN
d'abord**, puis `marketMatchKey` (`same-company-account.ts`). Deux « Veepee » mesurés en production le
26/10/2026 : la fiche venue du CRM n'était candidate ni par son statut (`analyzing` de colonne) ni par
sa clé (aucun SIREN, nom du CRM ≠ raison sociale). Un compte `completed` repris ici est un
**RAFRAÎCHISSEMENT** — le run est appendé, jamais un écrasement, et une correction humaine n'est
jamais perdue.

→ WebSocket : le front se connecte au room du jobId

## Étape 1 — Collecte de données (15-30s, EN PARALLÈLE)

### Brave Search

- 8-10 requêtes ciblées construites dynamiquement :
  - "{companyName} stratégie IT 2024 2025 2026"
  - "{companyName} DSI CTO nominations"
  - "{companyName} prestataires ESN conseil"
  - "site:linkedin.com {companyName} directeur informatique"
  - "{companyName} appels d'offres IT"
  - "{companyName} recrutement développeur data"
  - "{companyName} filiales France"
  - "{companyName} transformation digitale budget"
- Résultats : ~120 résultats, dédupliqués, top 30 gardés
- Endpoint : GET https://api.search.brave.com/res/v1/web/search

### Firecrawl

- Scrape les 15 meilleures URLs (exclure linkedin.com, facebook.com, youtube.com)
- Résultat : ~40 000 caractères de contenu markdown
- Endpoint : POST https://api.firecrawl.dev/v0/scrape

### Pappers

- Recherche par nom : GET https://api.pappers.fr/v2/recherche?q={companyName}
- Puis détail : GET https://api.pappers.fr/v2/entreprise?siren={siren}
- Résultat : CA, effectifs, siège, dirigeants, établissements, SIREN

→ WebSocket emit : { phase: 'collecting', percent: 15 }

## Étape 2 — Claude BELLUM-RESEARCH (60-90s)

- Construire le prompt : profil ESN + 30 résultats Brave + 40K chars + Pappers
- Appel Claude API (model: claude-sonnet-4-20250514, max_tokens: 16000)
- Parser JSON robuste
- Fusionner données Pappers (source de vérité pour CA, effectifs)
  - `legal_name` (raison sociale du registre) voyage avec `financials_history` : ce sont les comptes SOCIAUX de cette entité, pas le CA consolidé du groupe (`revenue`) — recette 21/10 K1
- Sauvegarder : UPDATE accounts SET sector, employees, revenue, raw_analysis, attack_angles
- **Les offres qui ont fait sortir le compte de Découvrir restent dans le dossier** (#4646, 27/10/2026) :
  `with_carried_offers` (`apps/ia/app/services/discover_carried_offers.py`) les remet EN TÊTE, datées, et un rejeu
  qui ne les retrouve pas ne les efface pas. Hors Découvrir, la même liste s'affiche sans elles. Leurs compétences
  (`carried_offers` comptées à part : `carried_unfound_count` remonte `carriedFromDiscover` dans la cascade
  d'offres, pour qu'un « found: 0 » après cinq appels payés DISE combien d'offres viennent de Découvrir au
  lieu de se contredire en silence — #4646.7). Leurs compétences
  (`carried_skills`) comptent aussi comme demande explicite du commercial pour la cascade d'offres
  (`explicit_request` / `terms`, plancher CASCADE-PLANCHER-5) — `apps/ia/app/routers/phase1_research.py`.

→ WebSocket emit : { phase: 'research_complete', percent: 40, data: ficheCompte }
→ L'utilisateur VOIT la fiche compte immédiatement

### Pause sur des homonymes (#2164.17, 01/11/2026)

Run lancé par NOM (aucun SIREN verrouillé) dont la recherche rend `entity_resolution.state = 'ambiguous'` avec au
moins deux candidats porteurs d'un SIREN : le worker coupe le flux du graphe APRÈS la persistance de la recherche et
met le job en pause — job BullMQ différé (`DelayedError`, aucune tentative consommée), question rangée dans
`job.data.entityQuestion`, rien en base, compte toujours `analyzing` (`analysis-entity-pause.ts`). La fiche compte la
lit (`GET /analysis/:id/entity-question`) et répond (`POST /analysis/:id/entity-answer`, le job est promu) : même
entité que l'hypothèse ⇒ reprise ordinaire, recherche gardée ; autre SIREN ⇒ recherche relancée, verrouillée, sur un
thread de checkpointer distinct. Sans réponse en 5 min (`ENTITY_QUESTION_WAIT_MS`), reprise sur l'hypothèse. Une
seule question par run ; même job, donc aucun débit de plus.

## Étape 3 — Apollo + Claude BELLUM-CONTACTS (40-90s)

### Apollo People Search

- POST https://api.apollo.io/v1/mixed_people/search
- Headers : x-api-key: {APOLLO_API_KEY}, Content-Type: application/json
- Body : { q_organization_name, person_titles: ["DSI","CTO","Head of Data",...], page: 1, per_page: 25 }
- Pagination : jusqu'à 5 pages = 120 contacts max
- GRATUIT (0 crédits consommés)
- Si 0 résultats → fallback sur peopleMentioned (Phase 1)
- **Fonction d'un contact (#4465)** : l'expérience EN COURS (sans date de fin) la plus récente chez l'employeur du compte (`apps/ia/app/services/current_position.py`) ; jamais une expérience terminée ; aucune en cours chez le compte ⇒ le titre brut est gardé (inconnu, rien de deviné). Une ligne `manual`/`crm` n'est jamais réécrite. Un départ prouvé (expérience terminée chez le compte, ou autre employeur observé à la relecture) range le contact en `historique` (« ancien »), sans suppression.

### Collecte pilotée par la demande (#4923, 30/10/2026)

La phase contacts (`apps/ia/app/routers/phase2_contacts.py`) ne se contente plus des personas du profil :

- **Familles cibles** — `target_families` (`contact_themes.py`) croise le profil de l'ESN (offres, expertises, personas et leurs voisines), le scope et le secteur du compte, et ajoute TOUJOURS le socle comité d'achat (DSI, Achats, Data & IA, Transformation, Direction générale). Des titres posés par l'utilisateur ne sont jamais élargis.
- **Passe dirigeants** — après une recherche par personas, une seconde passe (`c_suite, vp, head, director`, sans titres) part TOUJOURS, sur toutes les ancres (id, domaine, nom) fusionnées.
- **Couverture** — `couverte_tete` (un rôle de tête trouvé) / `couverte_partielle` (contributeurs seuls) / `non_couverte` ; `non_mesure` sort du dénominateur. Une famille cible sans tête est relancée (active par défaut, plafond 6, têtes d'abord, par nom sans ancre).
- **Recherche web par rôle** — `web_role_search.py` : une requête par rôle de tête manquant, no-op sans `SERPER_API_KEY`, employeur vérifié, Apollo gagne en cas de doublon ; source interne jamais nommée à l'écran.
- **Niveau groupe + zone (lot 755)** — la recherche web par rôle interroge aussi les entités du groupe (compte d'abord, même plafond) ; une zone française ordonne les contacts d'un autre pays derrière (`zoneNote` dit pourquoi), rien n'est retiré.

### Claude BELLUM-CONTACTS

- Prompt : profil ESN + contacts Apollo + entités + angles + pains
- Enrichir chaque contact : role, priority, whyContact, entity
- Produire organigramme + chaîne de décision
- Sauvegarder : INSERT INTO contacts (...)

→ WebSocket emit : { phase: 'contacts_complete', percent: 70, data: contacts }

### Zone d'ouverture et homonymes (cas Ludovic, 19/10/2026)

- **LUD.6** — un compte ouvert depuis une zone (Découvrir sur une région ou une ville) transmet `preferred_zone` à la phase contacts (`apps/ia/app/routers/phase2_contacts.py`, à défaut la `contactZone` du profil) : `prefer_zone` (`app/services/contact_zone.py`) classe devant les décideurs de cette zone. C'est une PRÉFÉRENCE d'ordre : aucun contact n'est exclu.
- **#4928** — la recherche Apollo par nom est floue (« Boulanger » attrape « Boulangerie Ange »). Après la fusion de toutes les passes, `guard_search_hits` (`apps/ia/app/services/search_hit_employer.py`, appelé dans `phase2_contacts.py`) garde un résultat si l'id ou le domaine de son organisation est celui du compte/groupe, si son nom normalisé est ÉGAL à celui du compte ou le commence suivi d'un suffixe juridique ou géographique (« Boulanger SA », « Boulanger France »), ou si une expérience EN COURS le satisfait (alors l'entité et la fonction affichées sont celles de cette expérience). Sinon il est écarté (`employer_mismatch`), compté et journalisé ; un employeur inconnu n'est jamais rejeté. Geste « Écarter les contacts de cette entité » livré (#4928.5) : `POST /contacts/account/:accountId/exclude-entity` (`records:write`, compte borné à l'espace et au périmètre BU, archivage motivé réversible), appelé par `ContactsEntityExclude` (onglet Contacts). Rattrapage des contacts déjà en base (#4928.4) : `apps/api/scripts/contacts-employer-catch-up.ts` (`contacts-employer-catch-up.runner.ts`), ciblé (un espace ou un compte), par segment contacts, « concerné » = collecte antérieure à `EMPLOYER_GUARD_CAPABILITY_AT`, SIMULATION par défaut, écrire exige `--appliquer --confirmer <N>` ; il ne part jamais au déploiement et n'a PAS été lancé. Pas encore livré : passe web par rôle.
- **LUDB.5** — après l'enregistrement des contacts, `analysis.worker.ts` appelle `excludeHomonymContacts(accountId, website)` : un contact déjà rattaché dont le domaine employeur diffère de celui du compte (homonyme, ex. stillfront / still.sk) est écarté (`excluded_at` + raison) ; il est archivé, pas supprimé.

## Étape 4 — Claude BELLUM-PLAN (30-60s)

- Prompt : profil ESN + analyse + contacts enrichis
- Produire : actionPlan, offersToPropose, evaluation, prioritySubAccounts
- Sauvegarder : INSERT INTO action_plans (...) + UPDATE accounts SET raw_analysis, status='completed'
- **Fin d'un lot lancé par Laura (#4462.9)** : à la fin de CHAQUE run, réussi ou en échec, le worker appelle `LauraBatchFollowService.settled(accountId, userId)` (`analysis.worker.ts`, `@Optional()`, ne jette jamais) ; la DERNIÈRE analyse du lot pose le classement « par où commencer ». Un échec ferme sa place dans le lot : il ne reste jamais suspendu à une analyse perdue.

→ WebSocket emit : { phase: 'analysis_done', percent: 100 }

## Étape 5 — Brief commercial (après `analysis:done`, hors chemin critique)

- **Échelon choisi (01/10/2026)** : une phase APRÈS le graphe, déclenchée par `AnalysisWorker.runViaGraph` à côté de `recordNeedProposals` (best-effort, `void`) — elle relit ce que les phases 1-4 ont DÉJÀ écrit dans `raw_analysis` plus les faits internes de la façade `AccountIntelligenceContext` (Market Memory + DataForge, siège résolu par hiérarchie de confiance) ; aucune nouvelle collecte, aucun nœud ajouté au graphe, zéro latence ajoutée au dossier.
- IA : `POST /commercial-brief` (`apps/ia/app/routers/commercial_brief.py`, prompt `bellum_commercial_brief`) rend un `CommercialBrief` validé contre son JSON Schema ; API : `CommercialBriefStep` passe `checkCommercialBrief` + le siège du dossier — 0 violation ⇒ `raw_analysis.commercial_brief`, sinon rien n'est écrit et seuls les CODES sont journalisés.
- Réglage : `COMMERCIAL_BRIEF_ENABLED` (défaut activé, voir `env-reference.md`) ; un appel Sonnet de plus par analyse, entrée bornée à 60 000 caractères.
- **Coût (point 46)** : le coût de l'appel brief s'AJOUTE à `analysis_runs.cost_eur` du dernier run du compte (`addCostToLatestAnalysisRun`, `analysis-run-cost.ts`, rejeté compris, jamais d'écrasement).
- **Espace du run (#4667)** : `analysis_runs.workspace_id` est ce que lit « Mes analyses ». `AnalysisService.start` le prend sur le compte et, à défaut (fiche venue d'un import), sur l'espace ACTIF de l'utilisateur qui lance — sans quoi une analyse lancée depuis Laura restait invisible de l'historique.
- **Cadrage ville/site (KEVIN-FIX K.10, 20/10)** : un cadrage `geo_perimeter: city` (`scope_city`) ORDONNE les sites du registre (`order_sites_for_zone`, `insee_sirene.py`) — le site de la ville d'abord (priorité « haute », « dans la zone »), le reste nommé « hors site (ville) », un siège hors zone gardant son importance ; sans site PROUVÉ dans la zone, rien n'est marqué. Les contacts du chemin recommandé (`scope_filter.filter_recommended_path`) suivent : le lieu qui dit la ville passe avant le lieu non dit, jamais « hors site » sans preuve.
- **Dossier zoné : la zone en tête (#4432.7/.8, 21/10)** : avec un cadrage `region` + `geo_areas`, `phase1_research` pose une consigne « PÉRIMÈTRE : ZONE » et `zone_dossier.zone_first` range en tête (tri stable) les filiales/entités, les établissements (`sitesFrance`) et les offres de recrutement situés dans la zone ; lieu inconnu juste après, lieu connu ailleurs en dernier — rien n'est retiré, `zoneStatus` (`in_zone` / `out_of_zone`) n'est posé que lorsque le lieu est connu, une offre sans localisation n'est jamais « dans la zone ». Sans zone, rien ne change.
- **Zone cherchée = périmètre (#4432, 21/10)** : un run lancé depuis Découvrir ou une carte de Laura (`suggestion_id` `discover:` / `laura:`) sans périmètre saisi reçoit `geo_perimeter`/`geo_areas` des critères de la recherche (`geoScopeFromOriginCriteria`, `AnalysisService.start`) — ville → `city`, départements/régions nommés → `region`. Un périmètre saisi au cadrage gagne ; sans zone, le run reste national. Côté IA, `region` + `geo_areas` range les contacts (`scope_filter.filter_recommended_path`) : lieu de la fiche dans la zone d'abord, lieu connu ailleurs écarté « hors zone (…) », lieu absent gardé après.
- **Le dossier DIT de quels critères il est né (#4432.10, 25/10)** : `phase1_research` pose
  `dossierBornFrom` (`zone_dossier.dossier_born_from(seller_hypotheses, cadrage)`) — la sélection
  Découvrir ou la carte de Laura qui a lancé le run, et la zone du cadrage. Rien de deviné : sans
  critère d'origine ni cadrage, la clé est absente et l'écran ne dit rien.
- **Le cadrage d'une conversation avec Laura se garde (#4642, 27/10)** : `AnalysisService.start` lit `lauraFramingOf(suggestion_id,
suggestion_criteria)` ; un compte créé le garde en `discover_origin_criteria` (l'origine reste « search »), un compte relancé
  le remplace seulement si l'ancien cadrage est celui d'une conversation (`canReplaceLauraFraming`) — jamais les critères de
  Découvrir. Le run le reçoit comme hypothèse d'origine, sans raison inventée : `dossierBornFrom` dit donc aussi le cadrage Laura.
- **Enrichissement en ligne (point 44)** : AVANT l'appel modèle, l'IA détecte les manques bloquants (siège non résolu, aucun site, aucun signal récent) et, pour ceux-là seuls, lance ≤ 3 recherches via le connecteur de recherche existant (`commercial_brief_enrichment.py`) — faits « source web » + URL au prompt, France seule ; sans clé du connecteur = no-op strict, les manques restent nommés dans « ce qu'on ne sait pas ».
- **Rattrapage (point 45)** : `POST internal/admin/commercial-brief-backfill` (secret interne, jamais public ; espace obligatoire, plafond 20 par défaut / 100 max, `force` explicite, `afterId` pour reprendre) rejoue l'étape brief SEULE sur les comptes analysés sans brief ; ne part jamais seul.

## Étape 4 bis — Blocs du dossier complet (#4078, après `analysis:done`, AVANT le brief)

- `DossierBlocksStep` (appelée par `AnalysisWorker.produceDossierBlocksThenBrief`, en série avant le brief qui les relit) écrit les cinq blocs que seule la démo portait : 16 `financial_indicators` et 17 `data_reliability_notes` calculés sans modèle (`dossier-blocks.ts`), 01/14/15 par UN appel `POST /dossier-blocks` (prompt `bellum_dossier_blocks`, modèle du brief) sur la liste blanche du brief.
- Une ré-analyse RAFRAÎCHIT un bloc déjà posé (import, analyse antérieure) — décision Louis 15/10/2026, qui renverse le « jamais réécrite » du 12/10 ; seule une correction humaine (clé listée dans `raw_analysis.human_corrected_blocks`, gardée aussi dans l'UPDATE) gagne toujours. Un bloc rafraîchi vide n'écrit rien (n'efface pas l'ancien) ; aucune source nommée par son outil ; aucun crédit débité, coût modèle ajouté au dernier run.
- Segment de rattrapage `dossier_blocks` (#4078, 14/10) : l'étape date `accounts.dossier_blocks_collected_at` quand elle aboutit (blocs écrits, dossier sans matière, ou cinq clés déjà posées) — jamais sur un échec du modèle, qui laisse le compte concerné. Capacité inscrite dans `SEGMENT_CAPABILITY_HISTORY.dossier_blocks` (13/10, intégration `f2258af8ac`).
- Écran : la Synthèse rend `SegmentStaleCollectionNotice dimension="dossier_blocks"` (date du segment, à défaut celle de l'analyse ; jamais analysé = aucune ligne) — hors démo.
- Rattrapage manuel : `apps/api/scripts/parite-blocs-catch-up.ts` (simulation par défaut, `--appliquer`), ciblé sur la date du segment contre la capacité (jamais sur une clé absente), hors espaces de démo.

## Gestion des erreurs

- Si Brave échoue → continuer sans (Firecrawl + Pappers suffisent)
- Si Firecrawl échoue → continuer avec Brave snippets seuls
- Si Apollo échoue → fallback peopleMentioned + message à l'utilisateur
- Si Claude échoue → vérifier res.ok, logger status + body, status = 'error'
- JAMAIS de données fictives
- **Créneau d'analyse débité puis exception avant l'enfilage (#4119)** : `AnalysisService.start` et `resume`
  enveloppent `startClaiming` / `resumeClaiming` ; si une lecture ou écriture lève APRÈS le débit du créneau
  (`claim.held`), le filet `releaseUnlaunchedSlot` rend le crédit (`refundAnalysisSlot`) et marque le compte en
  erreur. Chaque sortie déjà prévue (échec typé, enfilage raté) rend son crédit elle-même et baisse `held` ;
  une fois le job en file, c'est le worker qui rend sur échec terminal.
- **Annuler une analyse qui n'est plus en cours (audit H1)** : `AnalysisService.cancelByUser` refuse avec
  `not_cancellable` dès que le compte n'est plus `analyzing` (terminé, en échec, déjà annulé), AVANT toute
  écriture — sinon annuler un dossier livré rendait son crédit à chaque clic.
- **Appels d'offres européens indisponibles (#4116)** : la phase 1 (`phase1_research.py`) l'annonce par un
  avertissement `eu_tenders` — « seuls les appels d'offres français sont listés » — au lieu d'un faux « zéro avis ».
  La source n'est jamais nommée.
- **Annuaire du registre absent, jamais `null` (BELLUM-IA-C)** : quand l'annuaire n'a rien rendu ou que le registre
  est coupé, la phase 1 (`phase1_research.py`) OMET la clé `registryAnnuaire` — le contrat partagé veut un objet.
- **Cache partagé des faits publics (#4067)** : la phase 1 lit d'abord `source_cache` (faits publics par
  entreprise, communs à tous les espaces, jamais une donnée privée d'un espace) avant toute collecte ; les offres
  cadres passent par la même question que Découvrir (nom, SIREN, placement). L'empreinte fournisseur (pages
  partenaires, mentions légales, sous-domaines) est collectée par `provider_footprint_*`.
- **Veille sans achat, collecte communautaire (VC.1-VC.3, Louis 18/10)** : une relecture de veille (`watch_refresh`)
  ne lit les sources d'offres payées (`CACHE_ONLY_JOB_SOURCES`) qu'en cache — froid = source sautée, aucun appel.
  Toute collecte phase 1 pose un tampon VIDE sous la société (`source_cache.mark_collected`, clé SIREN sinon domaine,
  jamais un espace) pendant `WATCH_COMMUNITY_REUSE_S` (24 h) : la veille d'un autre espace réutilise alors les
  lectures cache, sinon elle recollecte les seules sources gratuites. Les critères de l'espace (variante
  `jobs_fact_variant`) s'appliquent à la lecture. Un vide Mantiks se garde 7 j (`TTL_EMPTY_MANTIKS`).
- **Cache d'offres partagé par SIREN (#4045, 14/10)** : TOUTES les sources d'offres de la phase 1 (France Travail,
  APEC, Adzuna, Jooble, TheirStack, Fantastic.jobs, Mantiks, boards ATS, pages carrières) écrivent sous la variante
  canonique `public_facts.jobs_fact_variant(source, pack, roles)` et relisent avant d'appeler — Découvrir lit les
  mêmes entrées sans réseau. Un fournisseur sans clé n'écrit jamais « cherché, rien trouvé » ; un groupe plus large
  que le SIREN est collecté et rangé sans relecture ; ATS et carrières (qui dépendent du site) ne relisent qu'une
  entrée non vide. Pas de rejeu de masse : le cache se remplit au fil des analyses.
  **15/10 (CACHE-SOURCES)** : Adzuna, Jooble, TheirStack, Fantastic.jobs et Mantiks rangent le fait BRUT de
  l'entreprise (30 j, variante = la source seule, clé fournisseur = SIREN > domaine > nom) ; le tri métier du
  vendeur (pack, `all_roles`) s'applique à la lecture (`_aggregator_share`). Les sources payées à l'offre lisent
  UNE page de 25 offres par entreprise. Raison : crédits TheirStack épuisés en 5 jours.

## Offres : ordre d'achat de la fiche et relecture du semis (DISCOVER-OFFRES, 15/10/2026)

L'analyse (`phase1_research.py`, `_aggregator_jobs`) relit d'abord le fait « merged » du cache commun (offres
fusionnées d'une analyse déjà faite, semées par `apps/ia/scripts/seed_jobs_cache_from_analyses.py`) : avec assez
d'offres fraîches, aucune source payante n'est interrogée. Sinon l'ordre est Fantastic.jobs → Mantiks (si
Fantastic a gardé < 10 offres) → TheirStack (si les deux < 5). Elle range aussi le site du compte par SIREN
(`company_domains.remember`) pour que Découvrir sache de quel domaine parle une carte. Découvrir, lui, n'achète rien.

## Portée déclarée des champs de contact (#3219, 15/10)

La phase 3 (`classify`) transmet le périmètre déclaré du run (`analysis_runs.scope_mode`) à
`saveEnriched` → `ContactsService.applyEnrichment`, qui l'écrit en `scope` dans le journal de provenance
pour `entity`, `family` et `decisionRole` seulement (jamais l'e-mail ni le téléphone). Sans périmètre
déclaré, aucune portée n'est écrite. Deux runs de périmètres différents font ressortir `scope_difference`.

## Cadrage du run et offres récentes (phase 1, 15-16/10/2026)

`phase1_research.py` lit le cadrage confirmé du run (`req.cadrage`, service `run_cadrage`) : `_with_scope_directives`
préfixe au contexte la consigne de périmètre puis celle du cadrage (ce que le commercial vend, postes à placer, entités
ciblées/exclues, thèmes exclus) ; les postes à placer deviennent les `placedRoles` de CE run (`profile_with_run_roles`).
Les offres passent par `prefer_recent_offers` (une offre de plus de 90 j ne reste que si rien n'est récent, #4182), puis
`_rank_and_keep_run_jobs` : tri par métier placé, et les offres d'un autre métier SORTENT quand le run porte des postes.
Sans site saisi, le domaine vient du site déjà rangé par SIREN (`company_domains.lookup`), jamais deviné du nom.
Rien de posé dans le cadrage ⇒ chemin inchangé.

**Le demandeur d'une offre sur le compte (#4182.5).** Après `stamp_signal_urls`, `stamp_offer_requesters`
(`offer_requester.py`) pose `requester` sur chaque signal `source_kind: job` dont l'URL est celle d'une offre collectée :
la jointure est l'URL, jamais le texte. Le dossier est lu dans le texte de l'offre par `derive_offer_requester`, la même
fonction que Découvrir ; il voyage par `readRecentSignals` → `GET /accounts/signals` → Mes cibles (`OfferRequesterLine`).

**Le lieu de l'offre sur le signal de recrutement (#4816).** Après `stamp_offer_attachments`, `stamp_offer_locations`
(`dated_signals.py`) pose `location` sur un signal `recrutement` sans lieu dont l'URL est celle d'une offre collectée qui en
porte un : jointure par l'URL, jamais par la prose. Offre d'intermédiaire, offre sans lieu ou signal sans lien : rien ne se
pose, et un lieu existant n'est jamais écrasé. L'axe Zone de Signaux › Historique lit ce champ ; un lieu que
`discover-offer-territory.ts` ne résout pas sort de la facette.

## Critères de route accumulés jusqu'au plan (#3278, 17/10/2026)

`analysis.service.ts` / `analysis.worker.ts` transmettent les critères ACCUMULÉS (canaux déjà utilisés, réponses obtenues — `accumulatedRouteCriteriaOf`) à `phase4_plan.py`, plus seulement à /chat. Le plan les cite ; s'il n'y en a aucun, il le dit en une phrase. Un plan re-planifié (« Changer d'angle ») nomme sa route et le signal daté qu'il suit, et sa date « Calculé le » est celle du nouveau calcul.

La route du plan RENDU cite aussi sa preuve : `recommended_route_for_plan` reçoit les critères accumulés et la fiche du compte, et sort `proof_cited` (source + jour du relevé), `channel_history` et le signal suivi (#3278, V12-FIX-R42).

## Vague 4 — périmètre CRM et besoins historiques (19/10/2026)

- **« Déjà travaillées » (#4142.6)** : `analysis.worker.ts` ne lit les SIREN déjà travaillés du CRM de l'espace
  (`persistence.workedSirens`) que si `scopeSelection.exclude_worked_accounts` est coché ; sinon aucune lecture.
- **Besoins historiques DataForge dans le plan (#4281.2)** : `phase4_plan.py` ajoute `historical_needs_block` (besoins
  DU compte lus dans `dataforge_needs`, datés, prescripteur et sa fraîcheur) AVANT les repères du secteur. Best-effort :
  compte non rattaché ou panne → aucun bloc, prompt byte-identique. Les extraits sectoriels se resserrent au compte du
  référentiel SEULEMENT quand son SIREN l'y rattache sans ambiguïté (un seul `source_id`), jamais un rattachement deviné.
- **Messages vides repris puis signalés (recette 21/10 O.8)** : si `bellum_messages` rend une sortie sans message
  exploitable alors que des contacts sont à traiter, `phase4_plan.py` fait UNE reprise sur le modèle principal du plan ;
  si elle échoue encore, il journalise une erreur et ajoute une entrée `degraded` (`code: empty_output`). L'écran dit
  alors « Messages non préparés » au lieu de « Terminé » (`plan.messagesStatus = 'missing'`).
- **Filiales du web conservées (#4327)** : `_merge_pappers` (`phase1_research.py`) passe par `merge_web_subsidiaries` — le
  registre ne remplace plus les filiales que le web nomme (indirectes, nom commercial) ; rien n'est inventé.

- **Lu dans l'ESPACE, et jusqu'à la classification (#4294.9, 20/10)** : `needs_for_owned_account` lit le compte par
  `workspace_id` quand l'analyse le porte (un coéquipier n'est plus muet ; un autre espace ne lit rien), sinon par son
  créateur. `classify_node` ajoute les prescripteurs des besoins passés aux `known_contacts` (relation `prescriber`,
  « à revalider » au-delà d'un an) : ils départagent, ne filtrent jamais, un nom déjà connu ne se double pas. Le bloc du
  plan ouvre sur `needs_summary` et nomme ses trois usages : ANGLE, INTERLOCUTEUR, PREUVE. Coût : 2 à 4 lectures SQL par
  phase (compte, rattachement SIREN, besoins), zéro appel modèle de plus ; quelques centaines de caractères de prompt.

## Recette Simon 20/10 — aperçu de relance et contacts écartés (SIMON-FIX S.18)

- **L'aperçu suit le débit** : `GET /analysis/launch-plan?relaunch=true` (`AnalysisService.planLaunch`, paramètre
  `relaunch`) saute le cache de résultat exactement comme `start()` le fait pour `dto.relaunch` — un « Actualiser »
  rend `fresh` + le coût de `resolveAnalysisCost`, jamais `cache_hit` (« aucun crédit » annoncé, 10 crédits débités).
  Le prix ne change pas.
- **Une seule source de compte** : `enrichOrganigram` / `enrichOrganigramWave` (`analysis-ondemand.service.ts`) n'envoient
  à la classification que les contacts NON écartés (`excluded_at` nul) ; `total` du toast = la liste affichée.
- **Tri par score** : `?sort=score_asc|score_desc` ordonne sur le /25 AFFICHÉ (`LIST_SCORE_25_SQL`, miroir de
  `readListScore25`), puis `priority_score`, puis l'id.

## Re-recette Simon 20/10 — recrutements ciblés et réponse sans liste fantôme (SIMON-FIX S.14, S.18b)

- **Les métiers que nulle ESN ne place sortent À LA SOURCE** : `offer_relevant_to_profile` (`domain_job_filters.py`) écarte,
  pour toute source d'offres (France Travail, APEC, WTTJ, recherche), un intitulé « non placé » (liste unique de
  `discover_hiring_scope.py`, jumeau TS `discover-hiring-scope.ts`, même fixture) et la famille ROME « J » (santé).
  Cause : un placeur en CDI (`recruitsForClients`) gardait toute ouverture hors d'une liste courte (facteur, livreur…) ;
  « Infirmier », « Kiné », « Agent de tri » passaient. Sans profil : on ne filtre pas. La date d'une ligne de balayage
  de territoire est `dateCreation` (publication), jamais `dateActualisation`.
- **Une réponse ne renvoie jamais à une liste absente** : `commercial_verifier.REFERS_TO_ABSENT_LIST` — « cette
  sélection », « choisir un compte » sans qu'un outil ait rendu une ligne (ni liste dans la réponse) ⇒ la limite s'ajoute et
  dit ce qui manque. Déterministe, zéro appel modèle.

**KEVIN-FIX K.6 — Laura « missions pour ce profil » lit le moteur de Découvrir.** `find_accounts_for_talent` rappelle
`discover_skill_offers.find_skill_accounts` (compétences de la fiche → offres < 90 j → employeurs) sur les départements de
la zone (`talent_zone_departments` : code, « 59 — Nord », région, ville de `CITY_DEPARTMENTS`) AVANT la veille ; un compte
n'est listé qu'avec une offre datée qui cite une compétence du profil (pas de remplissage). Zéro appel de plus hors outil.

### Recherche d'une personne par nom (#4386, 20/10/2026)

`GET /contacts/search-by-name` → `ContactsService.searchPeopleByName` → `IaClient.searchPersonByNameCascade` →
`POST /phase/2/people/search-by-name` (`cascade=true`) → `apps/ia/app/services/person_name_search.py`. Cascade, arrêtée dès
qu'un résultat est solide : base de contacts (≤ 3 essais : nom + entreprise, forme accentuée + variante d'entreprise, nom
seul filtré localement) → registre des dirigeants (gratuit, ≤ 2 lectures) → recherche web (≤ 2 requêtes facturées).
Source sans clé = no-op ; source en panne = notée `down`, la cascade continue et l'écran le dit. Dédoublonnage par URL
LinkedIn normalisée, sinon nom sans accent + cœur d'entreprise ; chaque résultat porte `sources`, `match` (en mots à
l'écran) et la réponse `sourcesQueried`. Cache 24 h, jamais écrit si une source est tombée. Révélation payante seulement
après le choix d'un résultat (chemin inchangé). La fiche talent et la relecture d'employeur restent sur le chemin
historique (elles utilisent l'id base). Exception depuis le 02/11 : la relecture d'employeur d'un contact lit son parcours daté par People-Match (`POST /phase/2/people/employment-freshness`, `app/services/employment_freshness.py`, 1 crédit tracé D19, hors cache) — `in_post` / `left` / `unknown`, jamais un échec pris pour un état.

## Import de CV — l'identité vient du document (#4401, recette 21/10)

- `read_document` garde les EN-TÊTES et PIEDS DE PAGE d'un DOCX (`word/header*.xml`, `word/footer*.xml`, lignes
  répétées lues une fois) et lit une zone de texte une seule fois (la branche `Fallback` est ignorée). Un PDF de CV dont
  le texte direct tient en moins de 200 caractères passe par le repli OCR existant (le plus long texte lu est gardé).
- `/cv/parse` complète le bloc `identity` avec `cv_identity` : e-mail, téléphone (FR et international) et URL LinkedIn LUS
  dans le texte brut — la valeur lue est sa propre citation ; le nom vient de la première ligne « Prénom NOM », sinon il reste
  vide. Ce qui n'a pas été trouvé se DIT (`identity_gaps`) ; chaque bloc écarté par `_validate_fields` est journalisé avec son
  motif (`unknown_detection`, `duplicate`, `no_quote`, `quote_not_found`), jamais sa valeur.
- #4401.2 — au-delà de l'identité : `cv_identity.read_city` lit la ville de l'en-tête à sa forme codée (« 75011 Paris »,
  « Paris (75) ») ; `cv_experiences` lit les expériences sous leur rubrique (période + « rôle chez/–/| entreprise »,
  format fermé « rôle | entreprise | début | fin | ») quand le modèle n'en rend pas. Une formation n'est pas une mission,
  une ligne ambiguë est ignorée. L'API les écrit sur la fiche par ses arbitres existants.

## Secteur — NAF + activité + site (#4358.4 = #4419.10 = #4435.4)

- `sector_reading.py` : un secteur demandé (liste NAF = union de secteurs entiers) se lit par le NAF, puis par
  l'activité déclarée (`corporatePurpose`, `activityDomain`, `activity`, `description`) puis par le site (`websiteText`),
  seulement pour un NAF « flou » (`FUZZY_NAF_PREFIXES`). `account_qualification` ne classe plus « hors secteur » une ligne
  ainsi rattachée et rend `qualification.sectorAttachment` (« rattaché par son activité / son site »). Termes : une seule
  constante, `SECTOR_ACTIVITY_TERMS`. Sans activité ni site : NAF seul, rien d'inventé.

## Contacts : le seuil de l'élargissement (#4433.9, 21/10/2026)

La passe d'élargissement automatique des contacts (#2543.5g, titres retirés, bande de séniorité, une fois par
run) part quand le stock reste SOUS `CRITERIA_WIDEN_MIN_RESULTS` (10, le seuil commun des critères) — plus sous un 5
propre à la passe. Le repli web (≤ 5) et la passe par titres (< 25) gardent leurs réglages de coût/latence. Son
résultat (`widened`, `coverage.widened` du graphe) se dit à l'écran si elle a apporté des contacts. Voir
`agent_docs/criteria-referential.md`.

## Cadrage de /search : objectifs, angle et run en vol (Théo B r1-recherche, 22/10/2026)

L'écran « Analyser » (trois étapes de Théo) ajoute DEUX champs au cadrage confirmé (`analysisScopeSelectionSchema`,
contrats) : `objectives` (liste sans doublon d'une table fermée de huit clés, plusieurs choix possibles — le preset de
contexte ne porte qu'UN objectif, celui du dernier clic) et `angle` (une phrase, 300 caractères). `graphScopeSelection`
(API) les transmet au graphe ; `run_cadrage.cadrage_directive` (IA) les écrit dans la consigne de collecte, l'objectif par
sa phrase de la table (`OBJECTIVE_PHRASES`) — une clé inconnue est ignorée, jamais recopiée dans le prompt. Rien de posé ⇒
chemin inchangé. `AnalysisService.planLaunch` annonce aussi le run déjà en vol sur le nom (`inFlight`, avec le prénom de
qui l'a lancé), lu avec le même test de péremption que la couche d'idempotence de `start()` : l'aperçu ne crée ni ne
rejoint rien. Le coût reste calculé côté serveur ; l'écran n'affiche aucun crédit (#4468).

## La pertinence passe avant le coût, y compris sur la fiche (#4284.1, #4563, 25/10/2026)

`phase1_research` applique désormais **le même tri métier que Découvrir** aux offres d'une fiche de
compte : `sort_offers_by_trade(jobs, profile, caller="account")`. Une offre hors métier (« Ssiap »,
« chef de chantier » sur une ESN informatique) ne se liste pas, et le journal dit combien ont été
écartées et pourquoi.

La cascade des offres rend compte d'elle-même : `offersCascade` ne part vers l'écran que lorsqu'il y a
quelque chose à dire — le plancher de 5 offres n'est pas atteint (`belowFloor`), ou le commercial a
formulé une demande explicite (`explicit`), auquel cas la cascade va au bout de ses paliers. Elle dit
les paliers tentés, ce que chacun a rapporté et les appels payés. ⛔ Le plancher ne s'atteint JAMAIS en
filtrant moins : on élargit la recherche, on ne baisse pas l'exigence.

**Le plancher compte le MÉTIER du vendeur, pas ce que le tri garde (DECATHLON, 30/10/2026).** Une ESN qui
place en CDI (`recruitsForClients`) sans métier déclaré garde toute offre : 10 offres de vente rendues par
Adzuna « atteignaient » le plancher et aucune offre data n'était jamais cherchée. Désormais
`placed_role_terms` (métiers déclarés, sinon déduits — `domain_job_filters.py`) donne les `trade_terms` de
`it_job_signals_aggregators` : le plancher (`run_cascade(counts=)`) et le raccourci « offres déjà connues »
de `phase1_research.py` ne comptent que les offres qui les recoupent, et le palier « termes » cherche
l'employeur AVEC chacun (« DECATHLON data », `adzuna_employer_term_offers`, ≤ 3, sans crédit, cache 30 j).
Sans métier au profil : chemin inchangé.

**Chercher un autre métier sur la fiche (Louis 30/10/2026).** Hors de l'analyse, la veille d'un compte
porte un champ « métier » : `GET /accounts/:id/job-offers?term=` (porte d'appartenance) →
`IaClient.accountJobOffers` → `POST /companies/job-offers` → `account_offer_search` — « toutes nos sources
s'il faut » (Louis 30/10) : gratuites TOUJOURS — Adzuna (marque + métier, dans son quota du jour), France
Travail (`france_travail.account_term_offers`, nom + métier, employeur prouvé), puis APEC, boards ATS, pages
carrières et WTTJ (offres de l'entreprise filtrées sur le métier) ; payantes (Mantiks, TheirStack,
Fantastic.jobs) SEULEMENT sous 5 offres, un appel chacune par entreprise gardé 30 j
(`account:offer_search:paid`). Fusionnés sans doublon, au plus 50, sans stage. Cache 30 j quand Adzuna et
France Travail ont répondu, un jour sinon. ⚠️ Mesuré en prod le 30/10 : le quota Adzuna (500 appels/jour) était épuisé à 13 h — avec
Adzuna seul, la recherche disait « n'a pas pu partir » tout l'après-midi. L'écran déroule 5 par 5
(`ACCOUNT_JOB_OFFERS_STEP` / `ACCOUNT_JOB_OFFERS_MAX`, `@bellum/contracts`). `searched: false` (AUCUNE
source n'a pu partir) se DIT — jamais « aucune offre ». En démo : les offres semées du dossier, filtrées
par le métier.

## Une source de contacts en panne ne tue plus le dossier (#4622, 26/10/2026)

Mesuré en production : l'écran d'un compte affichait, tel quel,
`Analysis failed in phase contacts: HTTPException: 500: Apollo down (search 'SANEF')`.
Deux défauts tenaient dans cette seule ligne — le dossier **entier** était perdu parce qu'**une**
source était tombée, et le nom de **notre** fournisseur s'affichait au client (doctrine : on nomme
ce que l'espace a branché, jamais ce qui nous sert).

**Ce qui change à l'étape 3 (Apollo + BELLUM-CONTACTS).** Une panne est désormais classée avant
d'être propagée, avec le vocabulaire d'`ApolloSearchStatus` (`apps/ia/app/routers/phase2_contacts.py`,
`_PANNES_RECUPERABLES` / `_degrade_ou_releve`) :

| Nature de la panne             | Statut       | Ce que fait le pipeline                                                                    |
| ------------------------------ | ------------ | ------------------------------------------------------------------------------------------ |
| 5xx / réseau (`DOWN`)          | récupérable  | la phase **dégrade** : zéro contact, `sourceStatus` dit pourquoi, l'analyse va à son terme |
| 429 (`RATE_LIMITED`)           | récupérable  | idem                                                                                       |
| Clé absente (`UNCONFIGURED`)   | récupérable  | no-op strict (doctrine « sans clé = no-op »), donc dégradation                             |
| Authentification / plan refusé | **terminal** | `HTTPException` 500 : c'est une configuration à réparer, pas un aléa                       |

Le zéro rendu par une phase dégradée **n'est jamais un « 0 contact » muet** : `sourceStatus` porte la
raison, conformément à GA-18 / GA-19 (« une valeur absente ne s'affiche jamais 0 »).

**Et côté message.** Le dernier recours de `apps/api/src/modules/analysis/analysis.worker.ts` rendait
le texte BRUT de l'exception. Il traduit maintenant le seul emballage technique du graphe — le nom de
la phase est relu dans `PHASE_LABELS_FR` et rendu en français (« L'étape « … » n'a pas abouti… »),
avec le geste de reprise. Nos propres messages, déjà en français, continuent de passer tels quels, et
**aucun nom de fournisseur n'apparaît plus**.

⚠️ Ce correctif est la racine d'un volume mesuré le 26/10 : dans l'espace relevé, **1 022 comptes sur
1 144 portaient `status = 'error'`**, créés en deux lots (199 le 18/10, 823 le 20/10). Voir #4621 —
ces coquilles d'échec VIDES sont masquées de la liste par conception, ce qui rendait le symptôme
invisible depuis l'écran.

## Les offres d'emploi sont estampillées, et l'archive a enfin un LECTEUR (#4760, 28/10/2026)

Deux moitiés d'un même défaut, corrigées ensemble. Aucun test ne les voyait : `test_signal_layers.py`
testait la fonction **seule**, jamais son branchement.

**Phase 1 (IA).** Jusqu'ici, seuls les `recentSignals` passaient par l'estampillage de fraîcheur
(`signal_freshness.py`) et par les couches : une offre d'emploi n'était jamais datée ni classée.
`phase1_research.py` fait désormais passer `itJobSignals` par le même chemin
(`build_signal_layers(recentSignals, itJobSignals)`), avec la fenêtre propre au recrutement —
**180 jours**, bien plus courte que les 24 mois du signal commercial : un besoin de plus de six mois
n'est plus un déclencheur, c'est de l'historique. La clé rendue porte son nom :
`signalLayers.jobOffers`. Une offre sans date reste `undated`, jamais supposée récente. Le `type`
`recrutement` n'est posé que POUR le calcul et ne ressort pas si l'offre n'en portait pas — aucune clé
inventée sur l'offre.

**Après l'analyse (API).** La couche était calculée côté IA et **personne ne l'appelait** — le motif
qui revient dans tout le dépôt : du code juste, calculé, testé, que personne n'appelle. Désormais
`packages/contracts/src/schemas/signal-layers-reader.ts` porte le lecteur partagé, et
`analysis.worker.ts` relit la couche en fin d'analyse (`recordHistoricalNeeds`, via
`analysis.persistence.readSignalLayers`) et ÉCRIT les besoins historiques dans le dossier :
`raw_analysis.historical_needs` (libellé, date réelle, source, total ; `buildHistoricalNeeds` puis
`saveHistoricalNeeds`), lue par l'outil Laura `get_account_needs_history` (#4759). Une couche absente
(analyse antérieure) n'écrit rien plutôt que « 0 » ; une couche sans historique retire la clé périmée.
Best-effort — une lecture qui échoue n'arrête pas l'analyse (`logger.warn`).

Gardes : `historical-needs-wiring-4760.spec.ts` (elle lit le texte source et rougit si l'appelant
disparaît), `test_job_offers_freshness_4760.py`, `signal-layers-reader.test.ts`.

## L'annuaire d'écosystème rattaché par SIREN SEUL (#4734, 29/10/2026)

Phase 1 gagne un APPELANT, et c'est tout ce que ce lot ajoute au chemin critique : après la fusion des
signaux collectés (`merge_collector_signals`), `_research` appelle `ecosystem_signals_merged`
(`app/services/dated_signals.py`) — l'appelant de `french_tech_signals`, qui jusque-là n'existait que
testé. Le motif habituel du dépôt : du code juste, calculé, testé, que personne n'appelait.

- **Deux conditions, toutes les deux nécessaires** : `_use_registry` (la même porte que BODACC — un type
  d'entité pour qui la donnée de registre a un sens) **et** un SIREN résolu. Si l'une manque, les
  `recentSignals` ressortent tels quels.
- **Rattachement par SIREN seul.** Aucun rapprochement par nom ni par domaine : un annuaire qui ne porte
  pas le SIREN du compte ne produit AUCUNE ligne, plutôt qu'une appartenance devinée.
- **Sans annuaire déclaré = no-op strict.** `FRENCH_TECH_DIRECTORY_URLS` est vide par défaut : zéro appel
  réseau (voir `agent_docs/env-reference.md`).
- **Une panne d'annuaire ne casse jamais le dossier** : l'exception est avalée et la liste d'origine est
  rendue — une source libre n'a pas le droit d'arrêter une analyse.
- La ligne voyage dans `recentSignals` avec le type `ecosystem` (`merge_ecosystem_signals`) ; aucune clé
  `raw_analysis` neuve. Contrat et rendu : `discover-signal-ecosystem.test.ts`, `signalTypes.ecosystem`
  (FR/EN). En démonstration, vide à dessein — voir `agent_docs/demo-mode.md`.

**Le dossier NOMME ces besoins (#4760, 29/10/2026).** `recordHistoricalNeeds` ne journalise plus seulement un compte : après la lecture
de `signal_layers`, il écrit `raw_analysis.historical_needs` (`buildHistoricalNeeds` : `{ total, items }`, chaque ligne = libellé + date
réelle, `null` si non datée, + source `signal` / `job_offer`) par fusion JSONB (`AnalysisPersistence.saveHistoricalNeeds`). Une analyse
sans couche n'écrit rien (« non mesuré », jamais 0). La fiche compte rend les lignes `signal` dans la carte « Besoins plus anciens »
(`CompanyPublicDataSection`) ; les offres anciennes gardent le bloc de #4757 et ne se répètent pas (GA-26).

**L'actualisation fait la même chose que l'analyse (lot 762, #4762).** Le corps de `recordHistoricalNeeds` / `recordNeedProposals` vit dans
`research-followups.ts`, appelé par `AnalysisWorker` (fin d'analyse) ET par `AnalysisOnDemandService.runResearch` — donc par « Actualiser »,
le refresh de la veille et le rattrapage de segment. Y passent aussi le garde-fou homonyme (`withoutHomonymResearchFacts`) et le rattachement
des deals CRM aux comptes (`linkCrmDealsFor`). Coût inchangé : 1 crédit d'enrichissement.

## Annuaires de l'écosystème startup (#4734, 29/10/2026)

`phase1_research.py` appelle `french_tech_signals(<SIREN d'ancrage>)` juste avant `signal_coverage`, puis
`merge_ecosystem_signals` (`dated_signals.py`) ajoute aux `recentSignals` ce que l'annuaire DIT, en type
`ecosystem` : libellé, date de la ligne, lien. Sans SIREN d'ancrage (jamais le nom seul), sans annuaire
déclaré (`FRENCH_TECH_DIRECTORY_URLS`) ou pour une entreprise absente : aucune ligne, zéro réseau. Un label
périmé reste listé, « à confirmer ». Garde : `test_ecosystem_signals_4734.py` (lit le texte source et rougit
si l'appelant disparaît).

## Contacts : entités cochées, score de pertinence, introuvable (lots 757/758/760, 31/10/2026)

- **Groupe vers filiales (lot 757)** : `phase2_contacts.py` reçoit `checked_entities` (le sélecteur de périmètre) ; `checked_entity_passes` les dédoublonne (sans le compte, 16 au plus) et chaque entité fait une passe People-Search de plus, fusionnée aux autres ; chaque contact porte l entité qui l a fait venir (`matchedVia: checked_entity`). Best-effort strict : une source en panne n ôte rien ; sans case cochée, aucun appel de plus. Les entités cochées sortent de `out_of_scope_entities` et entrent dans l identité du compte.
- **Score de pertinence (lot 758)** : cinq axes notés, plafonds role 30, proximity 20, seniority 15, angleFit 25 (le rôle face à l offre déclarée), freshness 10, somme 100. La joignabilité (`accessibility`) n est plus notée : c est une pastille « Joignable ». Un axe non évaluable sort du dénominateur et reste nommé.
- **Introuvable (lot 760)** : un état `pending` de coordonnée plus vieux de 15 minutes est tranché à la lecture (`settleStalePendingCoordinates`) : `not_found` si une source a répondu rien, `unknown` sinon (un timeout n est pas un échec).

## Mentions légales : les champs publiés (#4743, 02/11/2026)

- `legal_notice_fields.extract_legal_notice_fields` relit, sans appel réseau, les pages déjà scrapées dont l'URL est une mention légale (`firecrawl.is_legal_notice_url`) ; `phase1_research` l'appelle juste après `collect_partner_page_mentions` et pose `result["legalNotice"]`.
- Champs : raison sociale, forme juridique, capital, immatriculation, siège, dirigeant publié, hébergeur. Chaque valeur est gardée TELLE QUE publiée (capital non converti, forme non devinée d'après le nom) avec `sourceUrl` et `detectedAt`. Un champ absent n'a pas de clé ; aucune page légale ou aucun champ = pas de clé `legalNotice`.
