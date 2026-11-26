# Lots dispatchables — Audit moteur+restitution (22/416) + Entitlement (5/117) + Garde-fous activation (5/123)

Source : `python3 tools/issues/digest.py --label beta-feedback --limit 300` (digest complet, filtré aux 32
issues des 3 sujets) + manifeste `manifeste-onboarding-2001-2091.md`. Vérifié en code le 14/09/2026,
`origin/main` = `600f5da55`. Découpage par FICHIER : deux lots qui touchent le même fichier ne partent
jamais ensemble.

## Table des lots

| lot | issues | demandes(pts) | fichiers principaux | déjà là ? (appelant) | arrêt/doctrine | taille |
|---|---|---|---|---|---|---|
| **L1 — État canonique du parcours (SQL + backend)** | #2004, #2014, #2084 (partiel) | 25+9+~20 | `apps/api/src/database/entities/user-onboarding-state.entity.ts:1-8` ; migration `apps/api/src/migrations/1780000000000-OnboardingProfilesSchema.ts:127` ; `apps/api/src/architecture/check-constraints-additive.spec.ts` (GA-08/11) ; `apps/api/src/architecture/check-constraints-cover-enums.spec.ts` (GA-12) | **Existe, insuffisant.** Enum actuel `not_started\|in_progress\|completed` (`OnboardingStatus`, entity.ts:4 ; CHECK SQL migration:127). #2004 demande 10 états (`not_started…refresh_required`). Appelant du champ : `UserOnboardingStateEntity` lu/écrit par le module onboarding (à identifier précisément côté service avant de coder). | **ARRÊT doctrine directe** : la contrainte CHECK doit être élargie AVANT le code qui écrit (GA-11/GA-12) et l'enum ne perd ni ne réordonne de valeur (GA-08) — les 3 valeurs actuelles restent, les 7 nouvelles s'AJOUTENT, jamais insérées au milieu. Guides : `check-constraints-additive.spec.ts`, `check-constraints-cover-enums.spec.ts`. | **gros** (migration + guard + service) |
| **L2 — Stepper : ✅ positionnel → état réel** | #2004, #2084 | inclus ci-dessus | `apps/web/src/features/onboarding/components/OnboardingStepper.tsx:6,12-13` (appelant : `apps/web/src/features/onboarding/view/OnboardingWizard.tsx`) | **Défaut déjà documenté** `chantiers-livres.md:957-960` : `done = i < currentStageIndex` est positionnel, pas un état réel — exactement ce que #2004/#2084 redemandent. Ne pas recoder le stepper, câbler le nouvel état de L1. | — | **petit** (une fois L1 posé) |
| **L3 — Séparer entitlement commercial / compréhension métier** | #2003 | 23 | `apps/web/src/features/onboarding/view/OnboardingCompanyPage.tsx:144,168` ; modules backend `apps/api/src/modules/{stripe,credits,plan-features}` (existants, à recouper) | Pas de module "entitlement" dédié trouvé — à construire sur `credits`/`plan-features`/`stripe` existants. Recoupement direct avec #2002 (constat prod : « un seul forfait affiché au lieu de démo/199€/devis », `apps/web/src/App.tsx:96,113`). | **ARRÊT obligatoire — facturation/abonnement** (manifeste §6). Ne se code pas sans validation Louis. | **gros** |
| **L4 — Modèle Entreprise / BU / Utilisateur** | #2005 | 4 | `apps/web/src/features/onboarding/view/OnboardingCompanyPage.tsx:144` ; profil entreprise existant à identifier côté `apps/api/src/modules/esn-profile/` | Le "profil entreprise canonique + overlay personnel" est cité comme existant par #2005 lui-même ("CONSERVER"). Couche BU/agence NEUVE — aucune trace trouvée dans `esn-profile`. | **ARRÊT obligatoire — cloisonnement `workspace_id`/rôles** dès que la couche BU introduit un niveau d'accès intermédiaire (manifeste §6, recoupe #2084 "droits BU"). | **gros** |
| **L5 — Profiler : élargir la charge utile (sortir des 10 champs)** | #2007 | 15 | `apps/api/src/modules/ia/ia.client.ts:728-756` (`generateProfile`) ; `apps/ia/app/routers/profiler.py:17-28` (`OnboardingAnswers`) | **Preuve directe en code que le défaut existe** : `OnboardingAnswers` (profiler.py:19-28) a EXACTEMENT les 10 champs anciens (esn_name, consultant_size, sales_team_size, expertise_areas, positioning, staffing_model, target_sectors, target_company_types, geo_zones, main_sales_pain) — le "goulot" décrit par #2007 est visible dans la signature de l'appelant `IaClient.generateProfile`, pas une supposition. | — | **gros** |
| **L6 — Une seule génération par version (idempotence)** | #2008, #2009 | 9+20 | `apps/api/src/modules/profile-context/profile-context.service.ts:59-78` (`triggerGeneration`) | **Confirmé manquant** : `triggerGeneration` fait `setStatus('generating')` puis `iaClient.generateProfile(...).then(...)` sans aucune clé d'idempotence ni vérification "génération déjà en cours" — le docblock de `generateProfile` dit lui-même "fire-and-forget" (`ia.client.ts:727`). Appelant de `triggerGeneration` : contrôleur onboarding à identifier avant de coder. | — | **moyen** |
| **L7 — Workflow de validation (generated→validated) + versions/provenance** | #2010, #2011, #2061 | 18+12+20 | `apps/web/src/features/profile-context/{api.ts, hooks/useProfileContext.ts, components/ProfileContextVersions.tsx}` | **Existe partiellement.** `ProfileContextVersions.tsx` gère déjà des versions. `useProfileContext` a **8 consommateurs réels vérifiés** : `Discover.tsx`, `DiscoverSidebar.tsx`, `WelcomeScreen.tsx`, `Search.tsx`, `ProfileContextSection.tsx`, `ProfileContextSubPage.tsx`, `routes/__root.tsx`, `ProfileContextVersions.tsx`. #2061 demande de faire de `ProfileContext` une PROJECTION d'un `CommercialAuditContext` neuf — ces 8 appelants sont l'impact réel, pas une supposition. États `generated/to_review/corrected/validated/superseded/failed` (#2010) : aucune trace trouvée dans `profile_context_status` actuel (colonne `ProfileContextStatus` limitée, à vérifier). | — | **gros** (8 appelants) |
| **L8 — Prompt système + anti-hallucination + contradictions + scoring par axe** | #2062, #2063, #2064, #2065 | 20+13+17+22 | `apps/ia/app/prompts/bellum_profiler.py` ; `apps/ia/app/models/profile_context.py` ; `apps/ia/app/agents/profiler.py` | Prompts profiler existants, à réécrire selon les 4 issues. | **⚠️ DOCTRINE — voir §Doctrine ci-dessous, item D1/D2.** | **gros** |
| **L9 — Aucun nom d'entreprise inventé** | #2069 | 15 | `apps/ia/app/models/profile_context.py:424-435` (`FirstAnalysisSuggestion` / `first_analysis_suggestions`) ; appelant : `apps/web/src/features/profile-context/components/FirstAnalysisSuggestionsGrid.tsx` | **PAS de garde existante — vérifié.** Le prompt actuel dit littéralement "Privilégie des noms français bien connus (CAC40/SBF120…)" : c'est le modèle qui invente les noms depuis sa connaissance générale, pas Market Memory/DataForge. Aucun `_SCORING_PROMPTS`/`_RANKING_SOURCES` (GA-06, `test_protected_criteria_scoring.py`) ni autre garde ne couvre ce champ. | **⚠️ DOCTRINE — voir §Doctrine, item D3.** | **moyen** |
| **L10 — Corpus de non-régression multi-persona** | #2070 | 22 | nouveau : `apps/ia/tests/` (golden set 15 cas) | Aucun corpus équivalent trouvé pour le profiler/audit. Chantier neuf. | — | **moyen** |
| **L11 — Page restitution "Voici ce que BellumAI a compris" + 3 colonnes de décision + conséquences produit** | #2071, #2072, #2073, #2074, #2075 | 8+4+10+25+30 | nouveau : `apps/web/src/features/welcome/view/` (ou nouvelle feature `commercial-audit`) — aucun composant existant trouvé | Pas de doublon identifié (confirmé par grep sur `chantiers-livres.md` + code : rien qui affiche "Arrêter/Garder/Renforcer" ou un hero "voici ce que BellumAI a compris"). Chantier neuf. | **⚠️ DOCTRINE — voir §Doctrine, item D4 (scoring nu), D5 (couverture).** | **gros** (5 issues, même écran — NE PAS diviser plus car un même fichier d'écran naîtrait) |
| **L12 — Contact/charge active/priorités hebdo/paliers/sortie opérationnelle** | #2066, #2067, #2068 | 34+30+40 | nouveau : moteur d'audit + `apps/ia/app/prompts/bellum_plan.py` (existant, sortie plan) | `bellum_plan.py` existe pour la génération de plan (autre chantier livré) — #2068 ("trois priorités par semaine") recoupe potentiellement ce module : **à vérifier avant de coder**, non prouvé dans cette passe. | **ARRÊT — vocabulaire "probabilité de closing" déjà interdit dans `bellum_plan.py:372`, cohérent, à réutiliser comme modèle pour L8/L9.** | **gros** |
| **L13 — Première preuve connue / checklist intégrée à Laura+Aujourd'hui / débloque-avant-connecter / ne jamais bloquer / mesurer frictions** | #2076, #2077, #2078, #2083, #2085 | 10+12+36+16+49 | `apps/web/src/features/welcome/view/WelcomeScreen.tsx` (écran unique, mêmes locators pour les 5) | Checklist actuelle non identifiée dans cette passe (à chercher côté "Aujourd'hui"/Laura avant de coder #2077). | Golden set (#2085, "rejouer les 15 audits de référence") recoupe directement L10 (#2070) — **même corpus, deux issues différentes : à fusionner en un seul artefact, pas deux.** | **gros** (5 issues, même écran) |

## Doctrines touchées — à trancher, règle citée (livrable prioritaire)

**D1 — #2065 "Scoring explicable par axe" et #2011/#2075 (score jamais nu).**
Conforme à première lecture ("Ne pas afficher un score global de réussite", "un score classe l'attention,
il ne promet pas un résultat" — texte de l'issue elle-même). ⚠️ **À trancher : GA-18/GA-19 sont des
CLIQUETS, pas des interdits** — `packages/contracts/src/schemas/doctrine-registry.ts:689` : « trente-deux
notes nues et quatre-vingt-sept `?? 0` subsistent dans les écrans ». Rien ne garantit que le nouvel écran
d'audit (L11) respecte GA-18/19 sans relecture manuelle au moment du code — la garde ne les empêche pas
d'apparaître, elle empêche seulement leur nombre de CROÎTRE.

**D2 — #2062 (prompt système) : aucune garde automatique sur le TEXTE du verdict.**
`doctrine-registry.ts:1730` (gap de `c26_probabilite`) : « aucun test ne garde que le TEXTE du verdict
reste une trace de raisonnement et non une probabilité déguisée — la limite tient par RELECTURE, pas par
une garde automatique. » Le nouveau prompt système Sales Connect × BellumAI (L8) doit être relu à la main
sur ce point précis, comme l'ont été `bellum_advisor.py:401` et `reply_formats.py:50` (qui, eux, interdisent
explicitement "probabilité", "chance de signer", "pourcentage de réussite").

**D3 — mesure de production confirmée : `scoring_personalization` peut produire une probabilité déguisée.**
`apps/ia/app/models/profile_context.py:417-423` — le champ qui alimente `WelcomeSummary.scoringPersonalization`
(consommé par `apps/web/src/features/welcome/view/WelcomeScreen.tsx:33` via `PERSONALIZATION_ITEMS`) demande
au modèle « 1 phrase qui explique ce que le scoring évaluera […] Cite un critère métier précis » — **sans
aucun interdit sur le mot "probabilité"**, contrairement à `bellum_advisor.py:401`, `bellum_plan.py:372` et
`reply_formats.py:50` qui l'interdisent explicitement. C'est la preuve en code du texte de production signalé
dans la mission (« le scoring évaluera la probabilité d'un besoin urgent »). **Candidat direct pour L8** :
aligner ce champ sur l'interdit déjà écrit ailleurs dans le dépôt.

**D4 — #2069 "aucun nom d'entreprise inventé" : violation actuelle confirmée, pas seulement une demande future.**
`apps/ia/app/models/profile_context.py:428-431` — le prompt actuel dit « Privilégie des noms français bien
connus (CAC40/SBF120 si target='Grand compte'…) » : c'est une génération LIBRE par le modèle, pas un tirage
depuis Market Memory/DataForge/Entity Resolver comme le prescrit #2069. Aucune garde ne couvre ce champ :
vérifié dans `apps/ia/tests/test_protected_criteria_scoring.py:101-115` (`_RANKING_SOURCES`/`_SCORING_PROMPTS`
ne le listent pas — logique, ce n'est pas un classement de personnes) et aucun autre fichier de garde IA
trouvé sur "invent" ou "hallucin" côté profiler. **Ce champ heurte frontalement « JAMAIS de donnée fictive »**
(craft rule, doctrine racine) : à corriger, pas seulement à discuter.

**D5 — #2072/#2085 (taux de connexion, couverture) : risque GA-259, hors du périmètre gardé.**
`doctrine-registry.ts:1815` (gap de `c65_couverture_nest_pas_un_fait_de_marche`) : GA-259 ne lit QUE les
catalogues `marketMemory` et `apps/web/src/features/market-memory/` — un nouveau bloc de couverture écrit
dans le futur écran d'audit (L11) ou dans les métriques de friction (#2085 : "taux de connexion") lui
échapperait TOTALEMENT tant qu'il n'est pas déplacé dans ce namespace. **À trancher avant de coder L11/L13** :
soit le nouveau bloc vit dans le namespace gardé, soit GA-259 doit être élargie en même temps (pas après).

**D6 — #2005/#2084 (couche BU, "droits BU") : cloisonnement, arrêt obligatoire déjà signalé §6 du manifeste,
confirmé — aucun module "BU" trouvé dans `apps/api/src/modules` à ce jour, donc c'est un modèle d'accès
ENTIÈREMENT neuf, pas une extension d'un module existant.**

**D7 — Critères protégés : rien trouvé qui viole c58 dans les 3 sujets.** `#2005` (rôle, expérience,
portefeuille, habitudes, objectifs, préférences, autorisations — aucun champ protégé). GA-06
(`apps/api/src/architecture/protected-criteria.spec.ts`) et `test_protected_criteria_scoring.py` notent
explicitement que `bellum_scorer` (score d'entreprise, pas de personne) est HORS PÉRIMÈTRE par construction
— cohérent avec #2065 qui score une entreprise, pas une personne. **Constaté propre, pas un « à trancher ».**

## Arrêts obligatoires (vérifiés en plus du manifeste §6)

- **Facturation** : #2002 (constat), #2003, #2004 (retour Stripe dans sa RECETTE), #2014 — confirmé,
  modules `apps/api/src/modules/{stripe,credits,plan-features}` existent et seraient les points d'entrée.
- **Cloisonnement `workspace_id`/rôles** : #2005 (couche BU neuve), #2081 (hors sujet ici, sujet
  Collaboration), #2084 ("isolation workspace ; droits BU" cité littéralement dans le corps de l'issue,
  `digest-3sujets.md:224-237`).
- Aucun autre arrêt (suppression en masse, migration rétrécissante, auth) identifié dans ces 32 issues —
  cohérent avec le manifeste.

## Contradictions internes

- **#2070 et #2085 demandent le même golden set** ("corpus de non-régression multi-persona, 15 cas" vs
  "rejouer les quinze audits de référence") — pas une contradiction de fond mais un **doublon d'artefact** :
  à fusionner en un seul chantier (L10), sinon deux équipes le construisent deux fois.
- **#2008 vs #2009** : #2008 fixe une liste FERMÉE de 5 déclencheurs de génération ; #2009 demande un AUDIT
  de "tous les appels actuels" avant de fixer une clé d'idempotence — l'ordre de traitement compte : auditer
  (#2009) doit précéder la liste fermée (#2008), pas l'inverse, sinon la liste fermée est écrite avant de
  savoir ce qu'elle doit fermer.
- Pas d'autre contradiction frontale trouvée dans les 32 issues (cohérent avec le manifeste §3).

## Tailles — récapitulatif

Petit : L2. Moyen : L6, L9, L10. Gros : L1, L3, L4, L5, L7, L8, L11, L12, L13.
