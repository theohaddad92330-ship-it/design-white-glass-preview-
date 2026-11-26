# V2 Knowledge Pack — business rules & classifier feed

Source: Google Drive, `theo@bellum-it.com` — `BELLUMAI_Product_Knowledge_System_V2`
(2026-07-02, supersedes the 2026-07-01 `BELLUMAI_Knowledge_System_Pack`) + Théo's
raw method PDFs. Read-only extract; this file is the in-repo, versioned reference
so the pipeline's deterministic classifiers and Claude prompts can converge on the
client's own taxonomy. **Nothing here is auto-applied — it's the spec + backlog.**

## Source docs (Drive file ids)

- `03_BUSINESS_RULES.md` `1zLsGhSYjYbwEzhejRJoH1FZBwioJiM73` — scoring grids, 8 roles, no-go rules, profile-personalization.
- `02_CONTACT_TAXONOMY.md` `1AyS-vH6hr5vE4Tw9Yq4PcDpCUhO1VP_t` — richest classifier doc: 8 roles + titles, 6 hierarchy levels, priority score, filter buckets.
- `06_SYSTEM_PROMPTS.md` `1U-iEaXaK6dyMAq_4opZjeJecOQnOi4Lw` — 10 modular V2 Claude prompts.
- `07_AGENT_ARCHITECTURE_AND_SYSTEM_PROMPTS.md` `1zdjU_QnvphtFuVNymB75S5MlCKoaj4z6` — 14 agent prompts (adds BATTLECARD, WEEKLY-PLANNER, SOURCE-CONFIDENCE-JUDGE).
- `03_MESSAGE_LIBRARY.md` `1i40xB2u8TsDzORSGUBTeyVpct_wFNAOm` — persona leviers, LinkedIn/email/call templates, objection scripts.
- `Les 250 intitulés de poste à cibler (1).pdf` `1tQwVrTTzJeCDF98W6jdrw1Y_GQG9ASOE` — **250 titles / 9 families. Gold source for title regexes.**
- `METHODE-PLAN-DE-COMPTE-ESN.pdf` `1yoW2yfT1oPX_3QItZqrXdSr74mThEs0a` — Power/Interest matrix, 5-role SalesConnect taxonomy, scoring, sector verticals.
- `Pitch SALES ESN - SalesConnect.pdf` `10N0rPx3uzEUrnIwX-NhhUSrnkf9w2lna` — phone objection playbook.

## Decision-role taxonomy (canonical = 8 roles)

Pipeline today: `technical | economic | user | champion | influencer | blocker`
(DB CHECK + contracts enum; `blocker` == gatekeeper). The pack's canonical set:

| Canonical       | Pipeline role        | Typical titles                                                                                 |
| --------------- | -------------------- | ---------------------------------------------------------------------------------------------- |
| ECONOMIC_BUYER  | economic             | CIO/DSI, CTO, CDO, Dir. Transformation, Dir. BU, Dir. programme, Dir. achats IT                |
| TECHNICAL_BUYER | technical            | Head of Engineering, Architecte, RSSI/CISO, Head of Data, Cloud/Platform Lead, Resp. infra     |
| USER_BUYER      | user                 | Product Owner, Delivery/Project Manager, Tech Lead, Data Lead, Ops Manager, Resp. métier       |
| CHAMPION        | champion             | _indices, not titles_: ex-consultant, très actif LinkedIn, rôle transverse, manager accessible |
| PROCUREMENT     | economic _(routed)_  | IT Procurement, Vendor Manager, Resp. achats prestations, Supplier Manager                     |
| INFLUENCER      | influencer           | expert, architecte senior, responsable technique, lead domaine                                 |
| BLOCKER         | blocker              | _indices_: achats sans sponsor métier, vendor mgmt verrouillé, filtre RH/PMO sans pouvoir      |
| TO_VERIFY       | _(bucket, not role)_ | impossible à classer → a_verifier                                                              |

SalesConnect 5-role alias (method PDF): Sponsor≈economic/champion@C-level ·
Décideur≈economic@direction · Prescripteur≈influencer/technical · Utilisateur≈user
· Gatekeeper≈procurement/blocker. **RSSI is dual** — technical on cyber plays,
gatekeeper otherwise.

Applied so far (2026-07-02): PROCUREMENT titles → `economic` (see `decision_role.py`).

## Hierarchy levels (6)

`c_level | direction | management | expert | operationnel` (+ add **`unknown`**).
Anchors: C_LEVEL=CEO/CIO/CTO/CDO/CISO/CFO/DG · DIRECTOR=Directeur/VP/Head of ·
MANAGER=Manager/Lead/Responsable/Chef de dépt · EXPERT=Architecte/Expert senior/Tech
Lead · OPERATIONAL=PO/PM/Scrum/Analyste/Ingénieur. Complementary axis: relative
`Niveau (C / N-1 / N-2)`.

## Out-of-scope / bruit

Current: interns/apprentices/trainees only (`is_out_of_scope`). Pack adds (fuzzier,
NOT yet coded — need signal context, not just title):

- Legal-entity noise: holdings, **SCI, GIE**, établissements, magasins, admin. légal
  purement juridique (confirms #275 SG "98 SCI" gap → filter to `itEntities` /
  `meaningfulSubsidiaries`).
- Contact bruit: RH/talent _unless tech recruitment_; Finance/contrôle/risk _unless IT
  signal_; pure gatekeeper without sponsor; contact with no link to recommended perimeter.
- Filter buckets (never hard-delete on doubt): `keep_top`→cible · `keep_secondary`/`verify`→relai · `exclude`→bruit. Score <40 = bruit.

## Accessibility / influence → zone matrix (Power/Interest)

- **Q1 Pouvoir↑ Intérêt↑ = CHAMPIONS** — decide AND want it; weekly.
- **Q2 Pouvoir↑ Intérêt↓ = À SATISFAIRE** — can block/validate, indifferent; monthly milestones.
- **Q3 Pouvoir↓ Intérêt↑ = RELAIS TERRAIN** — surface needs, influence deciders; bi-weekly.
- **Q4 Pouvoir↓ Intérêt↓ = MONITOR** — passive; quarterly.

Contact tiers: **A** N-1 deciders w/ budget + N-2 users w/ pain + prescripteurs +
any relationship · **B** C-level sponsors (referral) + procurement gatekeepers ·
**C** off-topic / no power / inaccessible.

Priority score /100 — **two competing formulas, reconcile before coding**:

- 02_CONTACT_TAXONOMY: Fit persona 25 · Pouvoir 20 · Proximité signal 20 · Accessibilité 15 · Séniorité 10 · Source 10.
- 03_BUSINESS_RULES: Rôle 30 · Proximité sujet 20 · Niveau 15 · Accessibilité 15 · Fit angle 10 · Fraîcheur 10.

## Sector decision patterns

- **Banque/Assurance**: DSI, RSSI/CISO, Head of Risk IT, Data Lead; plays = data/risk, PMO réglementaire, cloud sécurisé.
- **Retail/E-commerce**: e-commerce platform, data analytics; Head of Data Platform.
- **Pharma/Santé**: compliance, data security, R&D.
- **Énergie/Public**: infra modernization; public tenders (BOAMP/TED) = budget signal.
- **Industrie 4.0**: IoT/automation; Dir. industriel/usine, Resp. production, Ing. automatisme.

Profile-dependent: same account scores differently per ESN. Vinci → data ESN targets
DSI/data platform, cyber ESN targets RSSI/NIS2, ERP ESN targets finance/supply. Scoring
MUST be `f(profileData, userContext)`, not a fixed account attribute.

## careerLevers / implicitFears (per tier — ESN-specific seed)

Origin: ORION prompts (`3_decider_analysis` / `DECIDER_PROFILING`). Lexicon to seed:

- **Décideur stratégique (CTO/DSI/VP/Head of)**: levers = transformation, roadmap, budget, arbitrage, capacité d'exécution. Fear = gap roadmap↔capacité réelle; mobiliser les bons renforts sans 3 mois de sourcing.
- **Manager opérationnel (Eng./Delivery Mgr)**: levers = charge équipe, staffing, delivery, vélocité. Fear = valider trop lentement (bon consultant positionné en 48-72h), onboarding culturel.
- **Opérationnel/expert (Tech Lead)**: levers = stack, problèmes concrets, retour terrain. Fear = déséquilibre build/run, profils qui ne comprennent pas la stack. Tone = technique, non-commercial.

## Objection / discovery playbooks (message-layer)

Rule: valider l'objection → rebondir avec une question → identifier la vraie raison.
Client objections w/ scripted replies: "déjà des prestataires" (→ échelle 1-10),
"pas de besoin", "passez par les achats", "TJM trop élevé" (→ coûts cachés
recrutement/turnover). 6 techniques (silence, reformulation miroir, cadrage, ancrage,
preuve sociale, sortie élégante). Discovery signature Q: _"Quel type de profil détestez-vous
qu'on vous propose constamment mais qui ne correspond jamais à votre besoin réel?"_
Value-prop = PROMESSE (KPI/livrable 6 sem) + PREUVE (réf même stack/secteur) + ACTION (atelier 45 min).

## Integration backlog (prioritised)

1. **[high] 250-title regex expansion** — ingest the PDF's 9 families verbatim into
   `decision_role.py` + `hierarchy_level.py`. Biggest deterministic quality win.
   Own TDD pass (needs verbatim titles, one family per commit).
2. ~~**[med] Zone-matrix cadence**~~ — DONE (2026-07-02). `prioritization.py`
   `ZONE_ENGAGEMENT` maps each zone → Power/Interest quadrant + cadence + contact
   tier + action; rides on `entities_exhaustive[].engagement` (schema + /contract +
   dashboard entity table updated).
3. **[med] Priority score /100** — reconcile the two grids, then a deterministic scorer.
4. **[med] careerLevers/implicitFears seed** — per-tier defaults the LLM refines (pairs
   with the P2 persistence work).
5. **[low] Objection/discovery library** — feed BELLUM-MESSAGES + a battlecard field.
6. **[low] `unknown` hierarchy bucket + `to_verify` contact status.**
7. **[low] SCI/GIE entity exclusion** — tighten `meaningfulSubsidiaries` (#275).
