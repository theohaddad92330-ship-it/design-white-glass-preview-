# Addendum Stelya / Ingénierie industrielle — chantier du 24/08/2026

Source : `agent_docs/sources/addendum-stelya-industrial-2026-08-24.pdf` (23 pages, retour bêta
Ludovic Marx / Stelya Group, société de conseil en ingénierie industrielle — transmis par Théo).
Règle de précédence du document lui-même : addendum ADDITIF — ne remplace ni les PDF 1-10, ni les
tomes 1-8, ni le CSV DATAFORGE V10 déjà ingéré (PR #1022/#1023, mergées le 24/08 AVANT ce chantier).

**Le contexte qui change tout** : PR #1023 a déjà livré la taxonomie 66 domaines
(`CONSULTING_DOMAINS`), le portefeuille `offer_domains: string[]` additif, l'onboarding
multi-select SANS présélection (D-DF2) et le pack dominant déterministe côté IA. Une partie de
l'addendum décrit donc un repo d'AVANT ce merge — chaque affirmation « confirmé dans le repo »
(§3) est re-vérifiée ci-dessous, même leçon que les marqueurs faux des PDF 1-3.

## 0. Inventaire numéroté (lecture intégrale, 23/23 pages)

### §1 Contrat de non-régression (p1-2)

- **I-01** (p1) Addendum additif : n'écrase rien, étend le périmètre multi-domaines/ingénierie.
- **I-02** (p1-2) Table d'articulation avec les 12 livrables existants (PDF 1-10, tomes, V10).
- **I-03** (p2 §1.1) 10 invariants intouchables (Projet pivot unique, cycle 9 étapes, migrations
  additives, inconnu ≠ 0, prior V10 ≠ fait, apps/ia n'écrit pas métier, fournisseurs non exposés,
  pas d'automatisation LinkedIn, FR+EN+démo, goldens ESN IT byte-identiques).

### §2 Retour Ludovic (p2-3)

- **I-04** (p2) Positionnement : société de conseil en ingénierie, PAS ESN IT/Data.
- **I-05** (p2) Deux piliers : Ingénierie & Conception ; Performance industrielle.
- **I-06** (p2) 15 expertises (méca, élec, électronique, automatisme, info industrielle, R&D,
  études, méthodes, qualité, industrialisation, maintenance, fiabilité, HSE, supply chain,
  pilotage industriel).
- **I-07** (p2) Secteurs d'application : automobile, ferroviaire, aéro, équipements industriels,
  machines spéciales, nucléaire, réseaux élec, énergie/renouvelables.
- **I-08** (p2) Matching : le secteur est porté par la MISSION, pas par le compte.
- **I-09** (p2) Vocabulaire : bannir « régie », « ESN », « intégré chez nos clients », « cabinet ».
- **I-10** (p2) Interlocuteurs : BE, Direction Technique, Méthodes, Qualité, Ingénierie AVANT
  Achats/RH.
- **I-11** (p2) Grain géographique : effectif > 100 sur SITE (préférence Stelya, pas règle
  produit) ; taille groupe non structurante.
- **I-12** (p2) Zones : AURA (cœur Lyon), BFC, PACA.
- **I-13** (p2) Signaux : plan de charge, AO, sous-traitance ingénierie, CAPEX.
- **I-14** (p2) Qualification Projet : budget confirmé, décision identifiée, urgence démarrage.
- **I-15** (p2) Confidentialité : ses retours ne profitent jamais à un concurrent.
- **I-16** (p2 §2.2) 8 non-dits (compte-centrisme, 3 concepts domaine/secteur/site, route groupe
  non héritée, comité dépend du projet, seuil 100 = préférence, qualité des décisions,
  confidentialité contractuelle).
- **I-17** (p2-3 §2.3) 10 critères de « Bellum viable pour Stelya » (recette finale).

### §3 Diagnostic repo (p3) — à RE-VÉRIFIER ligne par ligne

- **I-18** (p3) 13 affirmations « confirmé dans le repo » + verdict « IT-default dans plusieurs
  chemins déterministes ». Écrites AVANT le merge #1022/#1023.

### §4 Modèle conceptuel (p3-4)

- **I-19** (p3-4) 5 contextes séparés qui se croisent sans s'écraser : OfferPortfolio / Account /
  Entity+Site / Project-Mission / Talent, chacun avec sa source de vérité et son interdit.
- **I-20** (p4 §4.1) Sémantique canonique des 7 champs secteur (account.sector,
  site.activity_sectors, project.application_sector_codes, project.primary_domain_code,
  mission.application_sector_codes, consultant.sectors, offer_portfolio.target_sectors).
- **I-21** (p4) Propagation : valeur parent = suggestion `inherited_suggestion`, jamais vérité
  enfant sans confirmation ou preuve.

### §5 OfferPortfolio (p4-5)

- **I-22** (p4) Contrat `offer_portfolio` optionnel (version, company_type, primary/secondary
  domain codes, capability_codes, target_application_sectors, target_site{types,min_headcount},
  target_geographies, preferred_buyer_role_families, secondary_gatekeeper_role_families,
  delivery_models, references, preferred_terms, forbidden_terms, privacy.feedback_reuse) ;
  `offer_domain` legacy conservé, chemin legacy inchangé.
- **I-23** (p4 §5.1) Paramètres Stelya = CONFIG PRIVÉE workspace, jamais codés en dur dans le pack.
- **I-24** (p4 §5.2) Parcours onboarding cible : company_type sans précochage, familles groupées
  (pas 66 cases à plat), secteurs d'application séparés des domaines, géographie + critères site,
  restitution « Bellum a compris X », confirmation + correction permanente.
- **I-25** (p5) Non-régression : anciens profils sur offer_domain ; rollout flag + cohorte bêta.

### §6-7 Taxonomie et pack (p5-8)

- **I-26** (p5-6) Taxonomie V10 = 66 domaines adressables, référentiel de vocabulaire/codes ;
  décrit le marché, ne prouve jamais un achat.
- **I-27** (p6-7) IndustrialEngineeringDomainPack : combinaison curée de domaines V10 (9 cœur +
  8 adjacences), pas une duplication des 66.
- **I-28** (p7 §7.1) 13 familles métiers/expertises de référence.
- **I-29** (p7 §7.2) 13 secteurs d'application avec motions/besoins typiques.
- **I-30** (p8 §7.3) Par domaine V10 du pack : profils, acheteurs, signaux, barrières/contrats.

### §8 Site-level (p9)

- **I-31** (p9) SiteContext : site_type (8 valeurs), activity_sector_codes,
  industrial_function_codes, headcount + headcount_confidence, capex_signal_state,
  engineering_presence_state, decision_autonomy, source_claim_ids.
- **I-32** (p9 §8.1) 6 règles de vérité site (headcount null si inconnu, provenance, taille groupe
  ≠ point de site, site administratif pas promu, « headcount à vérifier » + recherche ciblée,
  site matérialisé seulement si utile).
- **I-33** (p9 §8.2) Score de site Stelya = politique PRIVÉE workspace (zone, headcount, type,
  fonctions, signaux, accès).

### §9 Projet/Mission (p9-10)

- **I-34** (p9) ProjectDomainContext (primary/secondary domain, application_sectors, entity_id,
  site_id, buyer/gatekeeper role families, decision_model, budget_state, start_urgency,
  externalization_state, evidence_claim_ids).
- **I-35** (p10 §9.1) Migration additive : entity_id déclaré dans ProjectEntity, site_id sur
  opportunities (FK sites SET NULL), domain codes, sector codes, decision_context jsonb, site_id
  déclaré dans MissionEntity, domaines/secteurs missions + inherited_from_project_at.
- **I-36** (p10) Héritage Projet→Mission : copie avec provenance `inherited_from_project`,
  correction Mission auditable, jamais de réécriture rétroactive du Projet.

### §10-11 Buyers et signaux (p10-11)

- **I-37** (p10) 14 role families acheteurs (TECHNICAL_DIRECTION → HR) avec alias FR, rôle,
  priorité.
- **I-38** (p10 §10.1) Règles de classement (fonction primaire par domaine du Projet, Achats
  co-décideur si double référent, RH secondaire sauf besoin explicite, C-level pas prioritaire
  sans proximité, titre inconnu « à vérifier », raison affichée).
- **I-39** (p10-11) 15 types de signaux industriels en 4 familles ; activité interne ≠ preuve
  d'achat externe.
- **I-40** (p11 §11.1) Source policy 4 niveaux + query planner qui ne cherche que les lacunes.

### §12 Procurement (p11)

- **I-41** (p11) ProcurementRouteClaim scoped (compte, entité, site, domaine, pays, période) ;
  route V10 = seed, jamais « confirmée » sans evidence scoped.
- **I-42** (p11 §12.1) Logique d'accès Stelya (porteur technique local, modèle de décision,
  rang 1/contrat-cadre si direct fermé, incumbent = double lecture).

### §13-14 Scoring et matching (p12)

- **I-43** (p12 §13.1) Score compte /25 : 5 axes CONSERVÉS, calcul domain-aware.
- **I-44** (p12 §13.2) Discover /100 : « Surface informatique » 20 pts → `domain_demand_surface`
  piloté par le pack ; legacy ESN IT identique.
- **I-45** (p12 §13.3) Confidence : Tier D jamais GO ferme ; inconnu sort du dénominateur ; axes
  exposent positifs/négatifs/non-mesurés/contrefactuel ; seuil 100 = policy privée.
- **I-46** (p12 §14) Matching par contexte Projet/Mission : 8 axes (domaine, compétences, secteur
  pondération, site/mobilité, réglementation/habilitations, séniorité, dispo, commercial).
- **I-47** (p12 §14.1) Non-contamination : 2 Projets de secteurs différents sur le même compte ne
  partagent ni secteur ni shortlist.

### §15-16 Organigramme et impacts (p13)

- **I-48** (p13) Carte d'influence progressive orientée site/projet.
- **I-49** (p13 §15.1) Couverture domain-aware 6 dimensions ; 5-15 contacts utiles, jamais 1000 ;
  ordre d'entrée par DomainContext ; achats jamais premiers d'office ; déductions sourcées.
- **I-50** (p13 §16) Table d'impacts CRM/Projets/ATS/Matching/Missions/Preuves/Action OS/Pilotage.

### §17-18 Prompts et UX (p13-15)

- **I-51** (p13-14 §17.1) ConsultingDomainContext construit UNE fois, injecté dans 8 prompts.
- **I-52** (p14 §17.2) 7 règles communes de prompt.
- **I-53** (p14 §17.3) Bloc système Industrial Engineering (texte de référence).
- **I-54** (p14 §17.4) Comportements attendus Copilote (2 exemples cibles).
- **I-55** (p14 §17.5) Comportements Laura (5 règles).
- **I-56** (p14 §18) VerticalLexicon 4 couches ; interdits workspace gagnent ; 7 substitutions.
- **I-57** (p14-15 §18.1) 8 surfaces à adapter (évolution minimale chacune).

### §19-20 DATAFORGE et confidentialité (p15-16)

- **I-58** (p15 §19) 9 actifs V10 : usage et « ne pas faire » ; pas de 3e copie plate.
- **I-59** (p15 §19.1) 6 données manquantes cas Stelya + action par manque.
- **I-60** (p15 §19.2) Query planner anti-coût 8 étapes ; refresh par decay, pas de re-scraping.
- **I-61** (p15-16 §20) 5 classes de confidentialité (tenant_private → forbidden_reuse).
- **I-62** (p16 §20.1) Contrat de feedback : reuse_scope défaut tenant_private, généralisation =
  décision Product documentée, export/suppression/journalisation.

### §21-22 Architecture et backlog (p16-19)

- **I-63** (p16 §21.1) 16 fichiers existants à étendre (liste nominative).
- **I-64** (p16 §21.2) 7 nouveaux fichiers recommandés.
- **I-65** (p16 §21.3) Stratégie de compatibilité (7 règles : nullable, pas de backfill, cohorte,
  adapters, optional deploy-skew, par tranche, ouverture après validation).
- **I-66** (p17-19 §22) 18 tickets BEL-DOM-1001 → 1018 (prio, dépendances, critères).

### §23-24 Tests et rollout (p19-20)

- **I-67** (p19 §23.1) 10 goldens obligatoires G1-G10.
- **I-68** (p19 §23.2) Familles de tests unitaires/intégration.
- **I-69** (p19 §23.3) Recette manuelle Ludovic (10 points).
- **I-70** (p19 §24.1) Ordre d'exécution : Sprint 0 sûreté → Sprint 4 surfaces → pilotage.
- **I-71** (p20 §24.2) 6 feature flags workspace-scoped.
- **I-72** (p20 §24.3) 8 métriques de succès.

### §25-31 Décisions et remise (p20-23)

- **I-73** (p20 §25.1) 8 décisions D-ST-01 → 08 avec recommandation.
- **I-74** (p20 §25.2) 6 vérifications repo avant code.
- **I-75** (p20 §25.3) 9 interdits.
- **I-76** (p21 §26) Prompt maître : méthode par ticket, règle de sortie (« une UI sans moteur
  n'est pas livrée »).
- **I-77** (p21 §27) Matrice de satisfaction Ludovic (13 attentes observables).
- **I-78** (p22 §28) Sources et traçabilité.
- **I-79** (p22 §29) Paquet de remise + découpage PR0 → PR9.
- **I-80** (p22-23 §30) Définition de Done globale (10 contrôles).
- **I-81** (p23 §31) Fixture canonique Stelya (payload versionné tests/démo).

## 1. Croisement avec le code (24/08, 4 agents lecture seule)

### 1.1 Corrections au diagnostic du PDF (§3 « confirmé dans le repo »)

Le PDF décrit le repo d'AVANT le merge #1022/#1023 et se trompe deux fois sur les chemins :

- Les migrations vivent dans `apps/api/src/migrations/`, pas `apps/api/src/database/migrations`.
- Le matching vit dans `apps/api/src/modules/consultants/matching/`, pas `modules/matching/`.
- Le blocage « decision_role par domaine exige un changement de contrat API↔IA » (repris de
  `dataforge-v10-plan.md:54-56`) est **caduc** : `ClassifyRequest.esn_profile` existe déjà
  (`apps/ia/app/models/classify.py:18`, résolveur `classification.py:329-332`) — ce qui manque est
  le câblage API (aucun envoi du champ) et la consommation dans `decision_role.py` /
  `contact_priority_score.py` (aucun paramètre profil).

### 1.2 LIVRÉ (preuves)

| Item                                         | Preuve                                                                                                                                                                                                             |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| I-26 taxonomie 66                            | `packages/contracts/src/schemas/consulting-domains.ts:53` (66 entrées, code/group/pack/labelFr/labelEn) + miroir `apps/ia/app/services/offer_domains/portfolio.py:27` + parité `test_consulting_domains_parity.py` |
| I-24 (partie) multi-select sans présélection | `apps/web/src/features/onboarding/lib/questions.ts:88-100` (D-DF2), refus liste vide `validation.ts:34`                                                                                                            |
| I-22 (partie) portefeuille → prisme          | `esn_profiles.offer_domains text[]` (migration `1790001573428`), `analysis.ts:451-456`, `seller_context.py:165-173`, `domain_focus.py:154-160`                                                                     |
| I-25 legacy intact                           | gate `offer_domains/__init__.py:63-76`, byte-identité `tests/test_offer_domains.py:54,120,130`                                                                                                                     |
| I-58 (partie) staging V10                    | `dataforge_accounts`/`dataforge_account_domains` (migration `1790000841267`), `priorsForSiren` `dataforge.service.ts:141` — **zéro consommateur en prod**                                                          |
| I-41 (partie) route = seed compte            | `dataforge-csv.ts:246-249` (« un seed, jamais une preuve ») — mais aucun guard `seed_only` typé                                                                                                                    |
| I-61 (modèle) confidentialité inter-tenant   | `community-facts.ts` (seuil 3 espaces, réciprocité, anonymat) — scope = `access_facts` UNIQUEMENT                                                                                                                  |
| I-71 (socle) flags workspace                 | Reflag câblé API+web (`reflag.service.ts:82`, `ReflagProvider.tsx:36`) — **zéro flag consommé à ce jour**                                                                                                          |
| I-49 (partie) cadrage organigramme           | `analysisScopeSelectionSchema` (`analysis.ts:51`), `scope_filter.py:110` (entité/géo/famille au RUN ; aucun filtre site/projet à l'écran)                                                                          |
| I-03 invariants                              | tous déjà des règles du dépôt (CLAUDE.md, GA-\*, goldens)                                                                                                                                                          |

### 1.3 ABSENT (à coder)

- **I-22/23 OfferPortfolio structuré** : aucun `offerPortfolioSchema`, aucune colonne jsonb, aucun
  `company_type` vendeur, aucun `preferred/forbidden_terms`, aucune policy site/geo/buyer.
- **I-24 onboarding cible** : pas de question type d'activité, pas de secteurs d'application
  normalisés (`target_sectors` = texte libre clients cibles), pas de critères de site, pas de
  restitution-confirmation (la carte bienvenue ne montre pas le portefeuille).
- **I-27→30 IndustrialEngineeringDomainPack** : `industrial_engineering` = 0 occurrence dans le
  repo ; les codes industriels V10 (MECHANICAL_ENGINEERING, AUTOMATION_ROBOTICS, MAINTENANCE_MRO,
  SYSTEMS_MBSE…) routent sur le pack `generic` (`portfolio.py:58-72`) — un profil Stelya résout
  aujourd'hui `generic`.
- **I-31→33 SiteContext** : `sites` = label/city/postal_code/country/siret/headcount seulement ;
  pas de site_type, activity_sectors, industrial_function_codes, headcount_confidence, provenance ;
  rien branché au scoring.
- **I-34→36 ProjectDomainContext + héritage Mission** : aucun champ domaine/secteur/site sur
  `opportunities` ni `missions` ; `missions.site_id` existe en base mais mort.
- **I-37/38 role families** : n'existent pas ; `decision_role.py` = « IT decider only » (docstring
  :1-17) ; un directeur d'usine est classé `user` (16/30) ; `contact_priority_score.py:142` a
  « usine » en STOPWORD ; aucun pattern BE/méthodes/qualité/maintenance/HSE.
- **I-39/40 signaux industriels + source policy** : aucun signal pack industriel (0 occurrence
  CAPEX/plan de charge/turnaround hors libellés taxonomie) ; sources filtrées IT EN DUR — ROME
  `M18` (`france_travail.py:88`, régleurs CN explicitement exclus :157-160), CPV `48/72`
  (`decp.py:47`, `public_tenders.py:40`) ; aucun query planner.
- **I-43/44 scoring** : `account_score_axes.py:82` lit `itJobSignals` (1 axe IT-codé sur 5) ;
  `discover_scoring.py:118` `_MAX_IT_SURFACE=20` + libellés « surface informatique » en dur ;
  `domain_demand_surface` = 0 occurrence.
- **I-46/47 matching mission-sector** : l'axe secteur lit `need.accountSector` ←
  `accounts.sector` (`matching.service.ts:308`) ; aucun secteur au niveau besoin/mission/entité.
- **I-49 coverage domain-aware** : `coverage.service.ts:62` = 11 familles hard-codées dont 6 BU IT.
- **I-51→55 contexte prompts Copilote/Laura** : `bellum_advisor.py` n'importe pas
  `resolve_domain_focus` (profil injecté en texte brut :382) ; Laura site sans contexte vendeur.
- **I-56 VerticalLexicon** : aucun mécanisme de termes par workspace (la doctrine lexicale
  `lexicon.test.ts:88` est PRODUIT, globale, compile-time).
- **I-62 feedback reuse_scope** : `beta_feedback` sans workspace_id, sans reuse_scope, sans
  consentement — et logs console/erreurs + screenshots partent vers GitHub tels quels.
- **I-67 goldens domaine** : pas de dossier `tests/golden/domains/` ; les packs non-défaut sont
  testés par assertions, pas par baselines.

### 1.4 PÉRIMÉ / arbitrages antérieurs qui contraignent l'addendum

- **« ConsultingDomainContext » comme NOUVEL objet** : refusé le 24/08
  (`dataforge-v10-plan.md:47-49` — « pas de second système de prisme »). L'intention de l'addendum
  (construire UNE fois, injecter dans 8 prompts) se livre comme EXTENSION de
  `seller_context`/`domain_focus`, pas comme objet parallèle.
- **BEL-DOM-1005 `domain_demand_surface`** : B5 requalifié le 24/08 (`dataforge-v10-plan.md:90-97`)
  — renommer le bloc au-dessus de sources filtrées IT serait « un mensonge mieux habillé » ; le
  dé-silotage des SOURCES (ROME/CPV par domaine) passe d'abord. Décision Q3 ci-dessous.
- **66 packs main / Tier D user-facing / route héritée par domaine** : refus antérieurs que
  l'addendum CONFIRME lui-même (§6, §19, §12) — aucun conflit.

### 1.5 Défauts trouvés en croisant (non demandés par le PDF)

1. **Le préremplissage réécrivait `esn_it` en silence** — CORRIGÉ (lot 0). `esn_prefill.py`
   déduisait `offer_domain = esn_it` de tout NAF 62.0x. Honnête tant que l'onboarding POSAIT la
   question (valeur visible, sourcée, corrigeable) ; redevenu la présélection silencieuse que
   D-DF2 retirait le jour où le portefeuille l'a remplacée — et elle repilote le prisme dès que
   le portefeuille est vide. La déduction part ; la clé reste dans `PREFILLABLE_ANSWER_KEYS`
   (GA-08 : une taxonomie ne rétrécit jamais) avec la raison écrite.
2. **17 colonnes créées par migration et jamais déclarées par leur entité** — CORRIGÉ (lot 0).
   Le croisement en annonçait 2 (`opportunities.entity_id`, `missions.site_id`) ; la garde écrite
   pour les attraper en a trouvé **17**, dont 7 sur `workspaces` et 4 sur `rag_documents`. Toutes
   étaient lues en SQL brut (`manager.query`) — donc invisibles de TypeORM, où un
   `where: { entity_id }` aurait été IGNORÉ en silence, et `missions.site_id` n'avait ni lecteur
   ni écrivain. Garde **GA-36** (`migration-columns-declared.spec.ts`).

### 1.7 Ce que la recette live a trouvé

**Une garde peut casser ce qu'elle protège.** GA-36 a fait déclarer
`profiles.onboarding_completed`, et cette déclaration a mis `GET /workspaces/me` et
`GET /briefing/today` en **500 pour tout le monde** — l'écran « Ma journée » disait « Le brief n'a
pas pu être chargé ». La colonne est ajoutée par une migration (`1776067200000-AuditFixes`, avec un
`IF NOT EXISTS`) et n'existe pas sur la vraie table : `profiles` est une table SUPABASE créée hors
TypeORM, l'ordre s'est appliqué sans effet, silencieusement.

La leçon est écrite dans la garde : **elle lit des migrations, pas une base**. « Une migration
ajoute la colonne » n'est pas « la colonne existe en production ». Sa liste `NOT_IN_PRODUCTION`
exige une PREUVE par entrée (un log d'erreur), et un test vérifie que la preuve est écrite — sans
quoi la liste deviendrait la porte de sortie de la garde. Corrigé par la PR #1027.

Ce défaut dit aussi quelque chose sur la méthode : les 5 812 tests étaient verts, `check-types`
aussi, et rien n'aurait pu voir le problème — parce qu'aucun test ne parle à la base de production.
Seul le balayage de navigation l'a montré.

### Deux « défauts » du croisement qui n'en sont pas

Consignés parce que l'erreur est instructive — un agent qui lit vite conclut de l'absence :

- **Parité i18n des 66 domaines** : annoncée non verrouillée, elle l'est —
  `apps/web/src/features/onboarding/lib/offer-domains-i18n.test.ts` compare libellé par libellé
  aux deux langues ET refuse les clés orphelines. Mesure directe : 66/66, 0 écart.
- **`inverse-matching` forçant `accountSector: null`** : ce n'est pas un axe débranché mais la
  sentinelle `EMPTY_NEED`, documentée (« un besoin VIDE, seulement pour vérifier qu'un talent
  existe ; il ne sert à aucun calcul »).

## 1.6 Avancement — CHANTIER CLOS le 24/08/2026

Les treize lots sont en production. Huit PR (#1025 à #1032), une recette live après chaque merge, et
un correctif de production (#1027) trouvé par le balayage de navigation.

| Lot                                         | État                  | Livré dans                                           |
| ------------------------------------------- | --------------------- | ---------------------------------------------------- |
| 0 — sûreté (GA-36, préremplissage)          | ✅ prod, vérifié live | PR #1025                                             |
| 1 — OfferPortfolio (contrat, stockage, API) | ✅ prod, vérifié live | PR #1025                                             |
| 2 — pack `industrial_engineering`           | ✅ prod               | PR #1025                                             |
| 4 — contexte partagé + copilote             | ✅ prod               | PR #1026                                             |
| 3 — écran portefeuille + restitution        | ✅ prod, vérifié live | PR #1026                                             |
| 11 — lexique (consigne de prompt)           | ✅ partiel            | PR #1026 — la DÉTECTION en sortie reste à faire (§3) |
| — correctif du 500 `/workspaces/me`         | ✅ prod, vérifié live | PR #1027                                             |
| 9 — rôles techniques industriels            | ✅ prod               | PR #1028                                             |
| — journal du portefeuille + doc             | ✅ prod               | PR #1028                                             |
| 5 — guard `seed_only` DATAFORGE (GA-37)     | ✅ prod               | PR #1031                                             |
| 6 — sources par domaine, puis Discover      | ✅ prod               | PR #1029                                             |
| 7 — SiteContext + `siteFit`                 | ✅ prod               | PR #1032                                             |
| 8 — ProjectDomainContext + héritage Mission | ✅ prod               | PR #1030                                             |
| 10 — matching mission-secteur               | ✅ prod               | PR #1030                                             |
| 12 — `reuse_scope` du feedback              | ✅ prod               | PR #1031                                             |
| 13 — goldens Stelya + fixture               | ✅ prod               | PR #1032                                             |

## 2. Lots d'implémentation (ordre = sprints du PDF §24.1)

- **Lot 0 — sûreté** : déclarer `entity_id` (ProjectEntity) + `site_id` (MissionEntity) ; retirer
  `offer_domain` de `PREFILLABLE_ANSWER_KEYS` ; verrou parité i18n 66 domaines. Défauts §1.5.
- **Lot 1 — OfferPortfolio contrat + stockage** (BEL-DOM-1001, D-ST-01) : `offer-portfolio.ts`
  contrat zod versionné, colonne `esn_profiles.offer_portfolio jsonb` NULLABLE, adapters
  (portfolio → legacy lens ; legacy → portfolio minimal lecture seule), mapping AnalysisProfileData,
  miroir seller_context.py. Absent = chemin legacy byte-identique (goldens).
- **Lot 2 — pack industrial_engineering** (BEL-DOM-1003, D-ST-02) : pack LIVE (périmètres §7.1,
  grille signaux industriels §11, plays, rôles §10 en données de pack), code 8e entrée
  `OFFER_DOMAINS`, re-mapping des codes industriels V10 `generic` → `industrial_engineering`
  (portfolio.py + consulting-domains.ts), goldens byte-identité IT, contrepartie industrielle des
  branches `it_esn` d'`entities.py` (un pack non-IT ne doit pas juste ÉTEINDRE l'override sans
  équivalent BE/usine).
- **Lot 3 — onboarding cible + restitution** (BEL-DOM-1002, selon Q2) : secteurs d'application
  normalisés (référentiel contracts), critères de site, restitution « Bellum a compris » +
  correction permanente (réglages), i18n FR/EN, démo.
- **Lot 4 — contexte partagé + Copilote** (BEL-DOM-1004/1015) : seller_context construit UNE fois
  portfolio+lexique+policies ; `bellum_advisor` consomme la lens (aujourd'hui texte brut).
- **Lot 5 — DATAFORGE guard + premier consommateur** (BEL-DOM-1012/1013) : type
  `ProcurementRouteSeed` + guard seed_only (l'API ne peut pas rendre « route confirmée » sans
  evidence scoped) ; priors branchés comme HYPOTHÈSES dans la recherche (jamais verbalisés en fait).
- **Lot 6 — sources par domaine + Discover** (BEL-DOM-1005, selon Q3) : ROME par pack (France
  Travail), CPV par pack (BOAMP/DECP), puis `domain_demand_surface` ADDITIF (`it_surface` conservé
  pour le chemin legacy — refus antérieur de renommage maintenu).
- **Lot 7 — SiteContext + ranking** (BEL-DOM-1008, D-ST-04) : colonnes sites additives (type,
  secteurs d'activité, fonctions, headcount_confidence, provenance) ; préférence site par
  workspace ; branchement Découvrir (« headcount à vérifier » ≠ 0).
- **Lot 8 — ProjectDomainContext + héritage Mission** (BEL-DOM-1009/1010, D-ST-03) : migrations
  additives opportunities/missions, UI Projet, héritage `inherited_from_project` audité.
- **Lot 9 — role families + priorité contacts + coverage** (BEL-DOM-1006/1007, D-ST-05) :
  ROLE_FAMILIES contrat (14 familles §10), `domain_role_policy.py`, câblage `esn_profile`
  API → IA, decision_role/contact_priority paramétrés (défaut = comportement actuel exact),
  coverage familles par domaine, retirer « usine » des stopwords sur le chemin industriel.
- **Lot 10 — matching mission-sector** (BEL-DOM-1011) : axe secteur lit le secteur du
  besoin/projet, repli compte NOMMÉ dans l'explication, non-contamination G2.
- **Lot 11 — VerticalLexicon** (BEL-DOM-1014) : preferred/forbidden_terms du portfolio appliqués
  aux SORTIES GÉNÉRÉES (consigne prompt + garde), golden G8. L'UI statique reste sous la doctrine
  produit globale (`lexicon.test.ts`) — pas de i18n par workspace (voir §3).
- **Lot 12 — feedback reuse_scope** (BEL-DOM-1016, D-ST-07) : colonnes additives beta_feedback
  (reuse_scope défaut `tenant_private`), règle de généralisation documentée.
- **Lot 13 — goldens Stelya + fixture + surfaces** (BEL-DOM-1017, §31, §18.1) : fixture canonique,
  goldens G1-G10, évolutions minimales Découvrir/Comptes/Projets/Matching.
- **Clôture** (BEL-DOM-1018) : recette Ludovic (3 parcours) — dépend de Louis/Théo, hors CI.

## 3. Ce qu'on ne promet pas (raison)

- **Un objet `ConsultingDomainContext` parallèle** — refus du 24/08 reconduit : extension de
  `domain_focus`/`seller_context`, pas de second système de prisme.
- **66 packs de prompts** — refus antérieur, confirmé par l'addendum lui-même (§7 « le pack ne doit
  pas dupliquer les 66 »).
- **Renommer `it_surface` sur les analyses stockées** — refus du 24/08 : `domain_demand_surface`
  est ADDITIF, la clé legacy vit pour toujours dans `raw_analysis`.
- **i18n par workspace pour l'UI statique** — le lexique tenant s'applique aux sorties GÉNÉRÉES ;
  remplacer les libellés d'interface par workspace serait un système i18n runtime entier pour
  7 substitutions dont l'essentiel est déjà couvert par la doctrine produit globale
  (`lexicon.test.ts`). Réévaluer si un 2e client verticalisé le demande.
- **Query planner complet §19.2** — la brique honnête livrable maintenant est le guard seed_only +
  la consommation des priors comme hypothèses ; un ordonnanceur de recherches par lacune suppose le
  chantier « recherche ciblée » (manual_verification_queue) qui n'a ni table ni écran — différé
  avec BEL-DOM restant, comme le refresh par decay.
- **6 feature flags Reflag** (§24.2) — la philosophie constante du dépôt est zéro-flag : l'objet
  `offer_portfolio` PRÉSENT est l'interrupteur (absent = chemin legacy byte-identique), exactement
  comme « sélectionner un domaine non-défaut EST l'interrupteur » (offer-domains.md). Reflag (zéro
  flag consommé à ce jour) n'entre pas ici ; le rollout par cohorte = qui a rempli le portefeuille.
- **Automatisation LinkedIn, scraping, écriture métier depuis apps/ia** — invariants du dépôt,
  l'addendum les confirme.
- **La RÉÉCRITURE automatique d'un terme interdit dans un texte généré.** Le lexique est une
  consigne de prompt et une donnée que le modèle reçoit ; il n'est pas appliqué par substitution
  après coup. Remplacer « régie » par « assistance technique » dans une phrase déjà écrite change
  le sens aussi souvent qu'il le corrige. Ce qui manque encore et qui EST faisable est la
  DÉTECTION (journaliser qu'un terme interdit est sorti, pour mesurer au lieu de promettre) —
  différée faute d'appelant : elle sera écrite avec le premier chemin qui la consomme, plutôt que
  livrée en code que rien n'appelle.
- **Une i18n par espace pour l'interface.** Voir plus haut : le lexique s'applique aux textes
  GÉNÉRÉS. Les libellés d'écran restent sous la doctrine produit globale (`lexicon.test.ts`).

## 4. Décisions

D-ST-01→08 : recommandations du PDF suivies telles quelles sauf D-ST-08 (flags → zéro-flag, voir
§3 : l'objet `offer_portfolio` présent est l'interrupteur).

Tranchées par Louis le 24/08 (AskUserQuestion) :

- **Périmètre** : TOUT l'addendum, lots 0→13 en séquence, PRs mergées au fil de l'eau sur suite
  verte. Recette Ludovic = étape à part organisée par Louis.
- **company_type** : DÉRIVÉ du pack dominant du portefeuille, stocké dans `offer_portfolio`,
  nommé dans la restitution, corrigeable en réglages. Pas de question d'onboarding supplémentaire
  (le multi-select 66 EST la réponse).
- **Découvrir** : lot 6 COMPLET — dé-silotage des sources d'abord (ROME par pack France Travail,
  CPV par pack BOAMP/DECP), puis `domain_demand_surface` additif. La requalification B5 est
  respectée dans l'ordre, pas annulée.
