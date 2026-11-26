# CRM Data Inventory — Skaizen / Bellum source spreadsheets

> **CLASSIFICATION: PII + COMMERCIAL — DO NOT COMMIT RAW DATA.**
> The four source spreadsheets contain real personal data (names, emails, phones,
> LinkedIn URLs, CV links, postal addresses) and sensitive commercial data (client
> deals, TJM rates, margins, win/loss pipeline). This document captures **structure,
> volumetry, and aggregate distributions ONLY** — no row-level personal data and no
> named individual deals. The raw files are destined for the **RAG-ingestion track**
> (chunk + embed in `rag_documents`, RLS-scoped per user), and must never be checked
> into the repo. Anonymise / pseudonymise on ingest; respect GDPR (lawful basis,
> retention, right-to-erasure) per `agent_docs/security.md`.

Source: Google Drive folder owned by `theo@bellum-it.com`. Inventoried 2026-06-23.
Files are XLSX exports flattened to CSV-like text; some role/skill buckets below are
keyword-derived and approximate (free-text columns with unquoted commas).

---

## 1. CONTACTS_MERGES_HUBSPOT.xlsx — B2B contact database

- **Type:** Merged HubSpot / Sales Connect + Bellum AI contact list (ESN ecosystem decision-makers).
- **Row count:** **983 unique contacts** (sheet title: "330 Sales Connect • 620 Bellum AI • 33 dans les deux").
- **Schema (8 columns):** `N°`, `Prénom`, `Nom`, `Email`, `Téléphone`, `Fonction`, `Entreprise`, `Source`.
  - PII columns (NOT aggregated/transcribed): `Prénom`, `Nom`, `Email`, `Téléphone`.

**`Fonction`** — controlled vocabulary (13 labels), bucketed into role families:

| Role family                                                                      | Count |
| -------------------------------------------------------------------------------- | ----- |
| Direction / Fondateur / Management                                               | 419   |
| Commercial / Sales (incl. Business Manager, Business Developer, Dir. commercial) | 394   |
| Freelance / Indépendant                                                          | 122   |
| Recrutement / RH (incl. RPO)                                                     | 31    |
| OPS / Fonction support                                                           | 14    |
| (vide)                                                                           | 1     |

**`Source`:** Bellum AI 620 · Sales Connect 327 · Les deux 33 · (blank) 1.

**`Entreprise`:** 877 distinct companies, 3 blank. 73 companies have >1 contact;
max ~7 contacts/company; the long tail is single-contact firms.

---

## 2. CRM Julien France.xlsx — France missions / AO recruitment pipeline

- **Type:** ESN staffing pipeline (one record per mission/need "NE-xxxx").
- **Row count:** **175 mission records** (1 truncated trailing record excluded).
- **Schema (positional, no header row; 9 columns):**
  1. AO ref (mostly blank; occasional external ref e.g. "AO10675")
  2. `Statut` — Abandonné / Perdu / Gagné
  3. `NE-id` — need identifier (unique per row)
  4. `Candidatures` — application count "N (M actives)"
  5. `TJM` — daily rate, EUR/day
  6. `Titre` — mission title (role / skill / location)
  7. `Intermédiaire` — sourcing channel (company)
  8. `Client` — end client (company)
  9. `Date` — DD/MM/YYYY
  - PII: none in the row schema itself (channel/client are companies).

**`Statut`:** Abandonné 84 (48%) · Perdu 79 (45%) · Gagné 12 (7%).
Win-rate ≈ 7% of all; ≈13% of decided (won+lost) missions. Abandonment is the dominant outcome.

**Top end `Client`s:** Carrefour (29), Accor (22), CNAM (13), Action Logement Services (11),
SMC-CIT (11), BPCE (9), Devoteam (9), MAIF (8), Pand'Ores (6), Chanel (5), AFD (4), Cora (4),
France TV (3), CAGIP (3), Sanofi (3), SNCF (2), Banque de France (2).

**Top `Intermédiaire`s:** Devoteam-family ~90 combined (Devoteam by Beteam 42, Devoteam 24,
Beteam/Beteam Client 4), Carrefour 27, Accor 22, SMC-CIT 11, Action Logement 10, Pand'Ores 6, CNAM 6.

**`TJM`** (166 values): min 200 · median 500 · mean ~519 · max 1000. ~67% in the 400–599 band (mode 500–599).

**Role/skill families (`Titre`, approx, each mission once):**
Admin/Infra/Prod/DBA ~42 · Fonctionnel/Métier/Support 25 · Chef de projet/PMO 24 ·
Développeur 24 · Architecte 20 · Data/BI 18 · DevOps/SRE/Cloud 11 · Cybersécurité ~6 · QA/Test 5.

---

## 3. CRM Benjamin Luxembourg.xlsx — candidate pool (consultants / freelances)

- **Type:** Candidate intake database (NOT tenders) — "Compilation candidat", recruiting form with CVs.
- **Row count:** **~1,906 candidates** (~1,904 parse cleanly; ~20 rows drift by 1–2 cols due to unquoted commas).
- **Schema (single sheet, 26 named columns):**
  `Prénom`, `Nom`, `Téléphone`, `Adresse email`, `Adresse Linkedin`, `comment m'avez vous rencontré`,
  `Cv`, `Métier`, `environnement technique`, `années d'expérience`, `Salaire actuel`, `Langue parlé`,
  `Situation professionnelle`, `Autorisé à travailler en Europe (YES/NO)`, `Disponibilité`,
  `Nom de la référence`, `Prénom de la référence`, `Téléphone de la référence`,
  `Comment puis je améliorer le questionnaire`, `Date de soumission`, `Adresse postale`,
  `Mobilité géographique`, `Recap entretien` (plus a row-index col).
  - **Heavy PII** (NOT aggregated): names, phone, email, LinkedIn URL, CV link, reference contact, postal address.

**`Mobilité géographique`:** France/Luxembourg 1028 · Luxembourg 353 · Luxembourg/France 307 · (tail: nationality labels).

**Source (`comment rencontré`):** LinkedIn publication ~763 (534+229) · Réseau/Network ~74 · Autres 14.

**`Disponibilité`:** Immediate ~175 (variants) · 1 mois ~183 (FR+EN) · "No prior notice" 136 · 2 mois 35 · 3 mois 41.

**`Métier` (free-text keyword buckets):** dev 244 · fullstack ~179 · business analyst ~177 · java 172 ·
test/QA ~125 · consultant 110 · chef de projet/PM ~108 · manager 102 · data 101 · support 77 ·
product 46 · devops 36 · architect 30 · scrum 29.

**`environnement technique` (tech keyword counts, 1042 filled):** java 208 · angular 200 · sql 162 ·
spring 126 · python 105 · node 100 · react 95 · jira 80 · javascript 76 · git 76 · docker 56 · oracle 52 ·
typescript 51 · mysql 48 · .net 47 · power bi 47 · jenkins 42 · azure 40 · linux 38 · aws 37 · postgres 36 ·
php 34 · kubernetes 28.

**`années d'expérience`** (1095 parsed): min 0 · median 5 · max 40. Bands: 0–2 ans 302 · 3–5 ans 331 ·
6–10 ans 297 · 11–15 ans 112 · 16+ ans 53.

**`Salaire actuel`:** heterogeneous (mixes daily/monthly/annual, multiple currencies) — a single
range is not meaningful. Band shape: <1k (likely TJM) 218 · 1k–3k 110 · 3k–5k 57 · 5k–8k 19 ·
8k–60k (likely annual) 114 · 60k+ 34.

---

## 4. Liste besoins AO FRANCEJu.xlsx — France tenders / "besoins AO"

- **Type:** Active staffing tender list (one record per AO/need), richer commercial schema than file #2.
- **Row count:** **58 tender records** (all parse cleanly).
- **Schema (18 columns):** `Client`, `Intermédiaire`, `Old`, `Titre`, `Numéro AO`, `Statut`, `Qualifié`,
  `Shoot`, `Agrega`, `Collective`, `Propriétaire`, `Commercial`, `Opérationnel`, `AO`, `Date Ajout`,
  `TJM achat`, `TJM vente`, `Marge potentiel`.
  - PII: `Commercial` (sales rep) and `Opérationnel` (client contact + phone/email) — NOT aggregated.

**`Statut`:** 5-Perdu 49 · 1-En cours 3 · 2-Fin du sourcing 2 · 4-Gagné 2 · 3-Entretien/soutenance 1 ·
1-Candidat/Sourcing 1. (~84% lost; only 2 won.)

**`Qualifié`:** Non 35 · Oui 10 · (blank) 13.

**Top `Client`s:** BPCE IT (9), Accor (6), Carrefour (5), CAGIP (5), SNCF (4), EDF (3), Airbus (3),
BNP CIB (2), Mgen (2); long tail of 1-offs (Bordeaux Métropole, L'Occitane, CACIB, Betclic, Engie,
Edenred, CNAM, Idemia, Thales, Renault-Mobilize, Fnac Darty, Suez, Natixis, Cora, RTE, etc.).

**`Propriétaire` (owning ESN/partner):** Devoteam 34 · Beteam 16 · Oostaoo 5 · others 1 each.
**`Intermédiaire`** holds labels not companies: "Intermédiaire" 29 · "Direct" 2 · blank 27.

**Numeric:**

- `TJM achat` (52): min 360 · median 500 · mean ~535 · max 1000 (mode ~450).
- `TJM vente` (50): min 440 · median ~610 · mean ~643 · max 1200 (bulk 500–750).
- `Marge potentiel` (57): min **−675** · median 54 · max ~200 (5 negative rows; positives cluster 50–55).

**Role/skill families (`Titre`, primary bucket):** Admin/Prod/Infra/Middleware 13 · Chef de projet/
PMO/Dir. programme (incl. Manager de transition) 12 · Développeur 9 · QA/Test 8 · Data/BI 6 ·
DevOps/Cloud/SRE 5 · Cybersécurité 2 · Architecte 2 · Autre 1.

---

## Cross-file summary & usage

| File                      | Records | Nature                      | Key PII                              |
| ------------------------- | ------- | --------------------------- | ------------------------------------ |
| CONTACTS_MERGES_HUBSPOT   | 983     | B2B decision-maker contacts | name/email/phone                     |
| CRM Julien France         | 175     | mission/AO pipeline (FR)    | none in schema                       |
| CRM Benjamin Luxembourg   | ~1,906  | candidate pool (LU/FR)      | name/email/phone/LinkedIn/CV/address |
| Liste besoins AO FRANCEJu | 58      | active tenders (FR)         | Commercial + Opérationnel contacts   |

**Aggregate signal across the corpus:** demand concentrates on a handful of large French
end-clients (Carrefour, Accor, BPCE, CNAM, SNCF, EDF, MAIF, Action Logement) routed mostly
through Devoteam/Beteam; the role mix skews to Infra/Production/Admin, PMO/Chef de projet, and
Development, with a growing Data/BI + DevOps/Cloud segment. TJM (sell) clusters ~500–750 EUR/day;
margins are thin and occasionally negative. Win-rates are low (~7–13%), abandonment the main loss mode.

### (a) Contacts prompt enrichment

- The HubSpot `Fonction` taxonomy (Direction/Fondateur, Sales, Freelance, RH, OPS) is a ready-made
  **role-priority / persona map** for the contacts/org-chart prompt — weight outreach toward
  Direction + Sales decision-makers, the two dominant buckets.
- The Luxembourg `Métier` + `environnement technique` distributions give a real **skills/stack vocabulary**
  (Java/Angular/SQL/Spring/Python/React/DevOps…) to enrich candidate-matching and "profils types" prompts.
- Client/intermédiaire frequency tables give a **named-account graph** (who buys, via which ESN) to seed
  account-context and "angles d'attaque" prompts — companies only, no individuals.

### (b) RAG ingestion

- Pipeline → embed into `rag_documents` (pgvector), RLS-scoped per `user_id`. Anonymise PII before/at
  ingest (drop or hash names/emails/phones/LinkedIn/CV/addresses); keep role, skill, TJM band, status,
  client/sector as retrievable structured metadata.
- High-value RAG content: mission titles + skill families + TJM bands (pricing intelligence), win/loss
  status by client (deal-pattern retrieval), candidate stack/experience bands (sourcing match) — all as
  aggregated or pseudonymised chunks, never raw rows.
- Retention & lawful basis must be set before ingest (GDPR / `agent_docs/security.md`).

**No personal data (names, emails, phones, LinkedIn/CV links, addresses, named deals) is recorded in this file.**
