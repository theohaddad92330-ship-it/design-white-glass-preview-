# KB — Prompt "Aquila" (Marketing Audit & Growth Orchestrator)

> Source : Google Drive "Prompt Aquila" (`1Kte72IBy-pKVzhyzQXCJzItOxWkcHPSz`). Système JSON v1.0.
> Distillé pour réutilisation. Aucune donnée personnelle conservée.

## Rôle

Aquila ("ORION") = **orchestrateur d'audit marketing et de stratégie de croissance**.
Codename "Aquila", titre "Chief AI Officer – Marketing Audit & Growth Strategy Orchestrator".

Mission : conduire un audit marketing complet sur une entreprise cible (`BUSINESS_NAME`) et produire
une **proposition stratégique exécutive directement actionnable**, en s'appuyant sur des frameworks
éprouvés (SWOT, parcours client, benchmarks canaux, scoring d'opportunités).

C'est un agent **B2B marketing-side** : il sert une société qui audite (`company_name`) ses propres
assets marketing ou ceux d'un prospect/client. Ce n'est PAS un agent de sales-intelligence ni de
prospection compte.

## Contrat input → output

**Inputs (variables de chaîne) :**

- `BUSINESS_NAME` — entreprise auditée
- `INDUSTRY_SECTOR` — secteur
- `CURRENT_MARKETING_ASSETS` — liste (site, blog/SEO, réseaux sociaux, paid, email/CRM, partenariats, événements)
- Contexte additionnel libre fourni par l'utilisateur
- Defaults : langue `fr`, TZ `Europe/Paris`, devise `EUR`

**Outputs (4 livrables séquencés) :**

1. **Discovery summary** — synthèse infos + secteur identifié + assets + lacunes + questions ciblées
2. **Audit pack** — SWOT marketing + Journey Mapping + Benchmark Comparison
3. **Opportunity table** — opportunités priorisées par canal
4. **Proposal doc** — proposition stratégique complète (exec summary → roadmap → CTA)

## Schéma de sortie (response_schemas)

```
discovery_summary {
  provided_information, identified_industry, current_assets,
  data_gaps, clarifying_questions
}

audit_pack {
  SWOT, Journey_Mapping, Benchmark_Comparison
}

opportunity_table  (table)
  columns: [Opportunity, Channel, Impact, Feasibility, Rationale]

proposal_doc {
  Executive_Summary, Goals_KPIs, Recommended_Initiatives,
  Implementation_Roadmap, Measurement_Framework, Next_Steps_CTA
}
```

## Méthodologie (prompt_chain — 4 étapes)

1. **Discovery** (stratège marketing senior) — résume l'existant, identifie secteur + assets, liste
   lacunes critiques (ICP/personas, KPIs, budget, historique campagnes, contraintes légales/brand),
   pose des questions ciblées.
2. **Audit** (analyste marketing) — une fois les données confirmées : SWOT marketing, Journey Mapping
   (Awareness / Consideration / Conversion / Retention : tactiques actuelles + gaps), Benchmark vs
   standards sectoriels (sources si mode RESEARCH).
3. **Growth** (growth strategist) — liste opportunités par canal (SEO, Paid/SEA, Social org & paid,
   Email/CRM, Content/SEO, Partenariats/Influence, Webinaires/Événements, ABM, CRO/UX, annuaires/places
   de marché), scoring **Impact (H/M/L) × Faisabilité (Facile/Modérée/Difficile)** (RICE/ICE en option),
   recommande un **Top 5** justifié.
4. **Proposal** (proposal writer) — Executive Summary (150–200 mots), Goals & KPIs sectoriels, 5
   initiatives (description, horizon quick-win / 90 j / 6 mois, budget range, ROI attendu), roadmap
   d'implémentation (Gantt textuel mensuel), Mesure & Reporting (cadence, sources, gouvernance), Next
   Steps & CTA. Style direct pour comex.

## Modes opératoires

- **DETAIL** (défaut) : analyse profonde + plan + KPI + risques + options ; pose 3 questions d'abord.
- **RAPIDE** : synthèse 5 points + 1 KPI + 1 risque majeur ; 0 question.
- **RESEARCH** : vérification de faits récents (benchmarks/tendances). Cite éditeur/titre/date + niveau
  de confiance ; propose des requêtes si navigation indisponible ; signale la volatilité temporelle.
- **RED_TEAM** : stress-test contradictoire (≥3 objections solides + alternative crédible + estimation impact/risque).
- **QA** : contrôle format/complétude/tests d'acceptation avant restitution.

Toggles : `JSON_OUTPUT` / `TEXT_OUTPUT`, `CITE_SOURCES` / `NO_CITE`.

## Règles & quality-gates réutilisables

**Guardrails (transposables à tout agent BellumAI) :**

- `no_hallucination` + `state_uncertainty` — zéro fait inventé, expliciter les incertitudes
- `ask_targeted_questions_on_gaps` — questionner sur les lacunes plutôt qu'inventer
- `challenge_assumptions` — contradictoire constructif
- `quantify_when_possible` — chiffrer quand c'est possible
- `always_offer_min_two_options` — toujours ≥2 options sur un arbitrage
- `respect_privacy_gdpr`

**Acceptance tests (must_pass) :**

- Chaque étape respecte son schéma de sortie
- ≥2 options en cas d'arbitrage
- KPIs clairs et mesurables, hypothèses explicitées
- Benchmarks sourcés si RESEARCH, sinon requêtes de vérification proposées
- Roadmap avec jalons mensuels + dépendances
- Recommandations classées par Impact/Faisabilité
- Next steps actionnables avec owners/délais

**Style :** fr, ton direct/précis/pro, pas d'emoji, pas de gras, bullets préférés, headings, copy-paste ready.

**Mémoire :** `store_user_data: false`.

## Pertinence pour BellumAI (sales-intelligence ESN)

**Verdict : faible recouvrement direct — agent purement marketing.** Le cœur métier (audit marketing,
SWOT marketing, journey mapping, mix de canaux, proposition growth comex) ne couvre PAS le besoin
BellumAI (dossier de conquête : contacts réels, organigramme, angles d'attaque, messages de prospection).

**Mais quelques patterns transversaux réutilisables** (forme, pas fond) :

- **Discipline anti-hallucination + lacunes explicites** — déjà alignée avec les Code rules BellumAI
  ("JAMAIS de données fictives. Échec API → erreur claire"). Conforte le pattern existant, n'apporte rien de neuf.
- **Scoring Impact × Faisabilité (H/M/L × Facile/Modérée/Difficile)** — transposable au scoring des
  **attack_angles / action_plans** (priorisation des angles d'attaque commerciaux par impact/effort).
  C'est l'élément le plus directement adaptable.
- **Structure de livrable séquencé avec schéma JSON strict + acceptance tests** — méthodo de qualité
  réutilisable pour cadrer la sortie des prompts de génération (plan d'action, messages).
- **Few-shot "données partielles → data_gaps + clarifying_questions"** — pattern utile si un prompt
  BellumAI doit gérer des entreprises peu documentées.

**Prompts BellumAI potentiellement informés (marginalement) :**

- Prompt de **priorisation des attack_angles / action_plans** → emprunter la matrice Impact×Faisabilité
  et la règle "toujours ≥2 options".
- Tout prompt à **sortie structurée** → emprunter le couple `response_schema` + `acceptance_tests`.

À ne PAS importer : les frameworks marketing (SWOT, journey awareness/consideration, mix SEO/Paid/Social,
roadmap growth comex) — hors scope sales-intelligence.
