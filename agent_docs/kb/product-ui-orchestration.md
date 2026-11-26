# Product UI & Orchestration — distilled from Google Drive diagrams

Source: Google Drive folders `IMAGE ORCHESTRATION` (5 architecture diagrams: ÉTAT
ACTUEL, SYSTEM 1–4) and `IMAGES PRODUITS V2 2EME PACK` (UI mockups). This file
distils (1) the agent orchestration pipeline and (2) the target output sections /
fields the prompts must produce. Demo screenshots contain placeholder names — none
are transcribed here as real people; all example values are genericised.

---

## 1. Orchestration pipeline

The product takes a **company name + ESN user profile** and returns a complete
"dossier de conquête". An **Orchestrator** (BellumAI) routes tasks between agents,
mutualises facts (single source of truth), then personalises interpretation per the
ESN profile. Core product rule: _mutualise the facts, personalise the
interpretation_.

### End-to-end journey (SYSTEM 2 — "Parcours d'une recherche")

1. **Onboarding** — questionnaire → build ESN profile (ICP / ideal clients, offers
   & services, geographic zone, tone & positioning, priorities & objectives).
2. **Snapshot contexte** — consolidate the profile into a reusable, stable context
   (stored once, then sliced/specialised per task).
3. **Choix de recherche** — two modes:
   - **Recherche rapide** = showable overview (synthetic summary, key data,
     priority signals/insights, main decision-makers, ready-to-use messages).
   - **Recherche enrichie** = deep dive on a priority account (full + historical
     data, detailed org chart, all contacts & emails, advanced signals & fine
     scoring, hyper-targeted strategy & sequences).
4. **Collecte API** — Pappers (company/SIRET, subsidiaries, directors, revenue,
   headcount, sector), Firecrawl + Brave (web scraping: site/pages, job posts,
   projects, activity signals, public content), Apollo/SalesQL (pro emails, job
   titles, LinkedIn profile URLs, people data), other sources.
5. **Normalisation** — fusion, cleaning & standardisation, dedup, provenance/source,
   freshness, confidence score.
6. **Dispatch agents** — this is where the **system prompts** intervene (dispatch +
   structured restitution). Can be written once inputs/outputs/data contracts are
   stable.
7. **Restitution** — complete account dossier in the UI.
8. **Actions** — copy personalised message, qualify account (score & tags), launch
   next steps (outreach/call), enrich further.

The ESN **user context** influences the scoring, strategy, messages and
recommendation agents specifically.

### Agent cartography (SYSTEM 3 — clusters & order)

Clusters run roughly in sequence; the orchestrator manages dependencies. **V1 =
clusters 1–4**; cluster 5 is V2/V3.

**Cluster 1 — AMONT / CONTEXTE**

- **Agent Profiler** — questionnaire + ESN profile → exploitable, stable context.
- **Agent Resolver entreprise** — company name + zone → resolves & stabilises the
  target company identity (disambiguation).
- _Cluster output: exploitable context + stabilised company identity._

**Cluster 2 — COLLECTE & ENRICHISSEMENT**

- **Agent données société** — collects structured company data (Pappers-type).
- **Agent scraping web & pages** — scrapes site / key pages → extracted facts &
  public content.
- _Cluster output: normalised, enriched, time-stamped facts (verified facts)._

**Cluster 3 — INTELLIGENCE & INTERPRÉTATION** (consumes facts + user context)

- **Agent contacts** — extracts & structures key contacts.
- **Agent organigramme** — reconstructs org chart, roles & links.
- **Agent signaux (achat/projet/finance)** — detects activity/project/buying/finance
  signals + signal context.
- **Agent scoring GO/NO-GO** — evaluates opportunity → score + executive summary +
  justification.
- **Agent stratégie / plan de compte** — defines approach, priorities, action plan.
- **Agent messages / pitch** — generates personalised messages + adapted pitch.
- **Agent recommandations** — proposes next best actions + reasons.
- _Cluster output: interpreted insights, strategies & deliverables._

**Cluster 4 — RESTITUTION PRODUIT**

- **Assemblage & formatage** — assembles, structures & formats the product output:
  GO/NO-GO scoring, org chart & key contacts, detected signals, messages/pitch, next
  steps, recommendations, sources & links.
- **Agent synthèse exécutive** — synthesises insights & key decisions.
- **Agent chat IA / Copilote** — advanced dialogue over context, insights, actions.
- _Cluster output: complete dossier ready to use._

**Cluster 5 — V2/V3 (future)**: Agent automatisations/outbound (email/LinkedIn
sequences, follow-ups), Agent audit stratégique (risks, competitors, positioning),
Agent mémoire (history, preferences, continuous learning).

### Design rules (SYSTEM 3)

Mutualise facts (single source of truth) · personalise interpretation to user
context · trace sources (cite + time-stamp every fact/reco) · version outputs
(history, compare, restore) · avoid tech debt (modular, tested, observable). Each
agent is modular, reusable, measurable; flows are iterative with learning feedback.

### Technical architecture (SYSTEM 1 & 4)

Layers: (1) Experience/marketing site & app shell, (2) Frontend app UI, (3) Backend
& orchestration (API gateway, orchestration service, normalisation, Agent Runner
(LLM), scoring, recommendation, billing, queues/jobs), (4) Data & memory (Postgres,
file storage, audit/logs, cache, contextual memory, RAG vector store e.g. pgvector,
analysis snapshots), (5) Providers & integrations behind a provider-abstraction
layer (Pappers, Firecrawl, Brave, Apollo/SalesQL, future CRM/email/calendar/LinkedIn,
Stripe, analytics/monitoring).

**Points to lock (SYSTEM 4):** cost per request (per search type & per agent);
**stable output JSON contracts (schemas) per response type**; error handling &
retries (backoff, idempotence, dead-letter, alerts); data freshness & provenance
(time-stamp, source, version, traceability); V1-sellable demo criteria (use case,
quality, stability, response time). Objective: a testable, showable, sellable
product before adding complexity.

### "ÉTAT ACTUEL" notes (work-in-progress board)

Confirms the API ordering as built: **Pappers (1st)** → **Firecrawl + Brave (2nd)** →
**Apollo (3rd, + look at SalesQL)**. Agents noted: profiler/résumé → contacts,
organigramme → messages, signaux, plan d'actions ("Claude sous-agent dispatch").
TODO captured on the board: improve system prompts, give agents more interpretation
freedom, define the **output schema** (directors, revenue, headcount, sector,
address / geographic catchment area), and define all new agents from the new product
pages.

---

## 2. Target output — sections & fields per key screen

These are the surfaces the prompts must fill. Field lists below = what the UI
renders.

### A. Account dossier shell (account header, shared by all tabs)

- Company name, sector/industry label, **monitoring status** (e.g. "Surveillé"),
  **fit score X/10**.
- Tabs: **Vue d'ensemble · Signaux · Contacts · Actualités · Technos · Appels
  d'offres / Documents · Fichiers · Activités**.
- Per-fact provenance: "Données vérifiées / à confirmer" + "Voir le détail des
  sources" (sources / freshness / confidence everywhere).

### B. Contacts page + org chart ("page contact mes comptes")

Per-company **prioritised contacts table**, columns:

- **Contact** (name + initials avatar)
- **Rôle Bellum** = sales-role classification: _Décideur · Influenceur · Sponsor
  potentiel · Opérationnel_
- **Fonction** (short title) + full job title
- **Entité** (which entity/subsidiary)
- **Statut enrichissement**: _Email trouvé · Téléphone disponible · À confirmer · À
  enrichir_
- **Priorité**: _Élevée / Moyenne / Faible_
- **Action**: Enrich / Ouvrir l'analyse
- Filters: Tous · Décideurs · IT · Achats · RH · À enrichir.

**"Chemin d'accès recommandé"** (entry-path, 3 steps) — the prompt must output an
ordered approach path:

1. **Contact d'entrée** (Influenceur) — ideal entry door + why.
2. **Relais opérationnel** (Décideur) — align IT/operational needs.
3. **Décideur final** (Décideur) — validate budget, contractual frame, calendar.
   Each step: name, function, Bellum role, one-line rationale. CTAs: Générer message,
   Ajouter au plan.

### C. Contact profile fiche ("meilleur fiche contact profil")

The richest per-contact output. Fields:

- Identity: name, seniority tag (e.g. C-Level), function/title, company + department.
- Coordinates with status: **Email professionnel** (Disponible/À confirmer),
  **Téléphone professionnel** (À confirmer), **LinkedIn** (voir profil) — each marked
  Vérifié / À confirmer.
- **Confiance globale** = overall confidence label (Élevée) + **%** + "Basée sur N
  signaux vérifiés"; **Dernier enrichissement** timestamp.
- **Pourquoi ce contact est prioritaire** — bullet rationale (key decision-maker,
  scope, involvement in projects, recurring needs).
- **Recommandation BellumAI** — tailored approach paragraph (angle to use).
- **Signaux liés à ce contact** (last 30 days) — list of events, each with: title,
  source, **intensity Fort/Moyen/Faible**, recency ("Hier / Il y a N jours"). "Voir
  tous les signaux (N)".
- **Rôle dans le processus d'achat** — Décideuse/role label + bullets (Définit les
  besoins · Évalue les solutions · Participe au choix final · Arbitre budget &
  contrats).
- **Actions rapides**: Enrichir les coordonnées, Générer email, Générer LinkedIn,
  Préparer script d'appel, + Ajouter au plan d'actions.
- **Données vérifiées / à confirmer** block (name/function/company = Vérifiées;
  périmètre & rôle; email/phone = À confirmer; LinkedIn = Vérifié).

### D. Messages & pitch ("page messages et pitch")

- **Generated messages list** — each item typed by channel + persona + account:
  e.g. "Message LinkedIn – {ROLE} – {Company}", "Email – {ROLE} – {Company}", with
  channel icon, account, persona/role, recency. Filters: Générés / Templates · all
  accounts · all personas · call scripts.
- **Message detail** — header line stating the message was personalised per the
  interlocutor's profile + the company context (enjeux, actualités, projets
  identifiés). Body = salutation + context-anchored opener (their role/pressures) +
  value proposition + soft CTA (15-min ask) + signature. Actions: **Copier ·
  Modifier · Enregistrer**.
- **Templates réutilisables recommandés** — reusable templates: Intro LinkedIn
  (découverte), Email prise de contact, **Script d'appel 15 min**, each with a one-
  line purpose + "Utiliser".
- Note: outputs must be per **persona × channel** (LinkedIn message, email, call
  script) and per role (DSI, CTO, RSSI, DRH, CFO, Directeur innovation, Responsable
  data…).

### E. Signals / watchlist ("Page watchlist : signaux en temps réel")

- **Watchlist table** of monitored accounts, columns: **Compte suivi** (logo +
  sector), **Dernier signal** (title), **Date du signal**, **Score** (value + delta
  e.g. `7.6  +0.8`), **Propriétaire**, **Prochaine action** (Relancer / Analyser /
  Qualifier / Surveiller + date).
- Top KPIs: comptes suivis (+N this month), nouveaux signaux (+% vs last week),
  comptes en hausse, comptes à relancer.
- **Signal detail panel** — title, "Nouveau signal {date/time}", impact paragraph
  explaining why the score moved, **Score actuel** + **Évolution (delta)**, and
  **Éléments clés** = bullet list of the concrete facts behind the signal (e.g.
  internal programme launched, cloud partnerships, key hires). CTAs: Ouvrir le
  dossier, Créer un rappel, + Ajouter à la watchlist.
- Signal typing = buying/project/finance/security/leadership-change events with an
  intensity and a score impact.

---

## 3. What the prompts must produce (contract summary)

Across screens, the agent prompts must emit, with **per-fact source + freshness +
confidence**:

- **GO/NO-GO score** (X/10) + executive summary + justification.
- **Company structured data**: directors, revenue, headcount, sector, address /
  geographic catchment, subsidiaries.
- **Contacts** with sales-role classification (Décideur/Influenceur/Sponsor/
  Opérationnel), function, entity, enrichment status, priority, and coordinates
  (email/phone/LinkedIn) each flagged vérifié/à confirmer.
- **Org chart** (roles & links) + **recommended 3-step entry path** with rationale.
- **Signals** (buying/project/finance/security/leadership) each with title, source,
  intensity (Fort/Moyen/Faible), recency, and score impact + "éléments clés".
- **Per-contact priority rationale**, **buying-process role**, **tailored approach
  recommendation**.
- **Messages/pitch** personalised per persona × channel (LinkedIn / email / 15-min
  call script) anchored on the company context + interlocutor profile.
- **Strategy / account plan + next-step recommendations** with reasons.
- **Executive synthesis** assembling all of the above into a ready-to-use dossier.
