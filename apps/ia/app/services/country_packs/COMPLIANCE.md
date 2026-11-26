# Country packs — legal basis & data-protection notes

Every country pack reads **only public official-registry data** (legal identity,
registered seat, legal form, status, public legal notices) and, where a free
official source exists, public IT job postings. **Data minimisation** is enforced:
no natural-person data is sought beyond what the commercial register publishes as
part of a company's legal identity, and (BE) the KBO name search deliberately
excludes natural persons (`ondNP` off, `ondRP` on).

Packs are **flag-gated and no-op by default** — no network call happens unless the
country is explicitly targeted *and* the pack's env flag is truthy. No data is ever
fabricated: a missing credential or a source outage yields an empty result.

## 🇨🇭 Suisse (pack CH)

- **Transfer basis:** EU **adequacy decision for Switzerland** (Commission,
  15 Jan 2024) + Swiss **nFADP/revDSG** (in force 1 Sept 2023). EU↔CH personal-data
  flows are covered — no additional safeguard required.
- **Source:** Zefix (Federal Registry of Commerce) Public REST API. Access is by
  **free HTTP Basic credentials** (`ZEFIX_API_USER` / `ZEFIX_API_PASSWORD`); licence
  "OGD Open use, must provide the source". Without credentials the pack is inert.
- **Data collected:** company legal identity (name, UID, legal form, seat, canton,
  status, purpose) and public SHAB/FOSC gazette notices. No annual accounts (not
  publicly filed for most Swiss SMEs).

## 🇧🇪 Belgique (pack BE)

- **Transfer basis:** Belgium is an **EU member — full GDPR**. No cross-border
  transfer barrier.
- **Source:** KBO/BCE **Public Search** (`kbopub.economie.fgov.be`) — free, no
  account, official SPF Économie portal. Reuse of KBO data is authorised under the
  portal's terms. The paid Public Search Web Service and the KBO Open Data bulk file
  are documented alternatives, not used here.
- **Data collected:** company legal identity (name, BCE number, legal form, seat,
  status, establishment count). Natural persons are excluded from the search.

## 🇱🇺 Luxembourg (pack LU) — status `live`, contract `documented` (since 11/10/2026)

> **#4016 L13a — DÉCISION LOUIS 11/10/2026.** The pack leaves `beta`: identity
> resolution goes through the **GLEIF public API** (`api.gleif.org/api/v1/lei-records`,
> documented, no key, **CC0** data, 60 req/min). A Luxembourg entity holding an LEI
> carries its **RCS number** (`registeredAs`) validated by the registration authority
> `RA000432` (RCS Luxembourg); a record from another authority, or without an RCS
> number, resolves to nothing. Coverage = LEI holders only (banks, insurers, funds,
> mid-size+ operating companies). The contract is **documented, not verified on a
> real production instance**: the entity is tagged `contract: "documented"`, the
> screen shows a badge, and nothing billed depends on it until it is verified.
> Data read: legal identity only (name, RCS, legal form when the ELF code is one we
> have seen, seat city, status) — data minimisation; no natural person.
>
> _Previous status, kept below for the record (before 11/10/2026):_

- **Transfer basis:** Luxembourg is an **EU member — full GDPR**. No cross-border
  transfer barrier. The RCS/RBE access restrictions below are *access* constraints,
  not data-protection ones.
- **Source:** RCS (Registre de Commerce et des Sociétés), operated by **LBR**
  (`lbr.lu`). Free on-screen search exists, **but** (a) the search front-end is a
  **JavaScript SPA** (not deterministically scrapeable) and (b) there is **no free
  structured company-search API** — automated/API access to the RCS is **restricted
  and paid** (reported ~5 000 €/yr from Jan 2026, to confirm on the official LBR
  tariff grid). The `data.public.lu` "Extrait RCSL" open dataset is a **one-off PDF
  dump (~2019)**, not a maintained feed.
- **Why `beta`/degraded:** no free, verifiable **name → RCS** endpoint ⇒ the pack
  makes **zero network calls** and resolves nothing — never a fabricated company. Its
  value is the injected **prompt vocabulary + entity ontology** (RCS identifier,
  SOPARFI holding-vs-operating filtering, trilingual FR/DE/LU, RESA/RBE caveats).
  Wiring live resolution requires the paid LBR API or a future free official source.
- **RBE (beneficial owners):** **closed to the general public** (CJEU ruling;
  restricted since Feb 2025) — not usable for the shareholding org chart.
- **Data (once wired):** company legal identity only (name, RCS, legal form, seat,
  status) — data minimisation.

## 🇺🇸 États-Unis (pack US) — status `live`

- **Legal basis:** the US has **no federal omnibus privacy law and no GDPR
  adequacy for B2B registry data** — the applicable regime is **state privacy law**
  (CCPA/CPRA in California, and sibling state acts), which regulates *consumer*
  personal data. This pack reads **only public corporate-registry data** (company
  identity + filings metadata from a US-government source) and seeks **no
  natural-person data**, so an EU-based user's exposure is limited to data
  minimisation, enforced by design. Cross-border note: collecting *company* data
  from a public US federal register raises no GDPR transfer issue (no personal
  data leaves the EU; public-source company facts flow inbound).
- **Source:** **SEC EDGAR** — official, free, no account. Verified live 2026-07-16:
  `https://www.sec.gov/files/company_tickers.json` (ticker/name → CIK),
  `https://data.sec.gov/submissions/CIK##########.json` (profile + filings),
  `https://data.sec.gov/api/xbrl/companyfacts/…` (XBRL facts — **wired**: factual
  annual revenues / net income / shares outstanding with their 10-K filing date),
  `https://efts.sec.gov/LATEST/search-index?q=…&ciks=…` (full-text search —
  **wired**: recent filings of the resolved registrant mentioning IT/digital/cyber
  phrases, each dated + sourced by its Archives document URL). Access terms: SEC
  **fair-access policy** — max **10 requests/second** and a **declared User-Agent**
  (403 without one; set `SEC_EDGAR_USER_AGENT="Company contact@email"`). Every
  request (submissions, companyfacts, each FTS query) rides the shared `sec_edgar`
  throttle (120 rpm).
- **Data collected:** company legal identity (name, CIK, state of incorporation,
  business address, SIC industry, tickers), dated filing metadata (8-K/10-K/
  10-Q/DEF 14A form + date + document title), company-level XBRL financial facts
  as filed (revenues, net income, shares outstanding — no extrapolation, absent
  tag = nothing), and full-text-search *metadata* of matching filings (form, date,
  document URL, matched phrase). No filing *content* is ingested; no
  natural-person data.
- **Known gaps (documented, not invented):** EDGAR covers **SEC registrants only**
  (listed companies + registered debt issuers) — **private US companies are
  invisible**. There is **no free national company registry**: the 50 state
  Secretary-of-State registries are fragmented with no unified free API (Delaware:
  no API, paid certified search); **OpenCorporates** aggregates them but its API is
  restricted/commercial (key + licence) ⇒ documented, not wired ⇒ a state-registry
  integration stays `planned`. **EIN** (IRS) is not public. **Employment signals:**
  no free per-company US job-postings API (Indeed/LinkedIn APIs retired or
  partner-gated; USAJOBS = federal government vacancies only) ⇒ `jobs` stays `[]`.
  **USAspending / SAM.gov** (free federal-procurement APIs) are documented
  candidates for a later signal source, not wired here.

## 🇨🇦 Canada (pack CA) — status `live`

- **Legal basis:** **PIPEDA** (federal) + Québec **Law 25** provincially. Canada
  holds an EU **adequacy decision** (2002, reaffirmed by the Commission on
  15 Jan 2024) for transfers to PIPEDA-covered commercial organisations — EU↔CA
  flows are covered. Only public corporate-registry identity data is read (data
  minimisation, no natural-person lookup).
- **Source:** **Canada's Business Registries** (CBR / MRAS federated search —
  Corporations Canada + participating provincial registries incl. **REQ Québec**,
  Ontario, BC, Alberta…). Verified live 2026-07-16: free JSON API, no key —
  `GET https://ised-isde.canada.ca/cbr/srch/api/v1/search?fq=keyword:{<q>} AND
  Status_State:Active&lang=en&queryaction=fieldquery&sortfield=score&sortorder=
  desc&pagesize=10&page=0` (page **0-based**). The base URL is the one the
  official SPA itself calls (from its `/cbr-rec/config.js`). Federal detail page
  verified **and parsed** (server-rendered legacy JSP, stable GC WET/Bootstrap
  markup): `https://ised-isde.canada.ca/cc/lgcy/fdrlCrpDtls.html?corpId=<id>&
  lang=eng`. Throttled at 30 rpm (`cbr`) — detail fetch included.
- **Data collected:** company legal identity (name, jurisdiction, Juri_ID —
  NEQ / federal / provincial corporation number —, BN when published, entity type,
  city/province, status, incorporation date); for federal (CC) entities, the
  detail page adds the registered-office address and governing legislation.
  Directors / individuals-with-significant-control present on that page are
  **deliberately not read** (data minimisation, no natural-person data).
- **Known gaps (documented, not invented):** **Job Bank / Guichet-Emplois** has no
  free self-serve API — the XML feed needs a signed ESDC agreement and the open
  -data export is a **monthly bulk CSV**, not a live per-company lookup ⇒ `jobs`
  stays `[]` (would slot in behind an operator-supplied feed agreement).
  Non-federal jurisdictions have no verified per-entity public detail URL ⇒ the
  hit links to the official CBR results page instead. **SEDAR+** (securities
  filings of listed issuers) and provincial gazettes are documented candidates,
  not wired. The REQ's own open-data dump (Données Québec, weekly bulk) is bulk,
  not a lookup ⇒ covered via CBR federation instead.

## Free-but-gated sources verified 2026-07-16 (documented, NOT wired — no invention)

Genuinely free official sources that we do **not** wire because each needs a
credential the pack does not carry, or an endpoint/query contract we could not verify
without an account. Wiring an unverified endpoint would violate "jamais d'endpoint
inventé"; each would slot in behind an optional env var once its schema is confirmed.

- **BE — VDAB (Flandre) job API:** official free REST API
  (`developer.vdab.be/openservices`, GET/POST `vacatures` + `vacatures/bulk`) — but
  requires a **free subscription key** and its schema is behind the portal. Would use
  an optional `VDAB_API_KEY`. (Le Forem / Actiris: no comparable documented free API.)
- **BE — BNB / Central Balance Sheet Office (annual accounts):** free human
  consultation via *Consult* (a SPA); the *authentic-data* **web services** are free
  but need a **`CLIENT_ID`** (registration + approval via `developer.cbso.nbb.be`),
  endpoints portal-gated. Would use an optional `BNB_CBSO_CLIENT_ID`.
- **BE — KBO Open Data:** free daily bulk (download/SFTP, registration). Bulk, not a
  per-company lookup ⇒ not the pack pattern.
- **BE — Moniteur belge legal notices** (`ejustice.just.fgov.be/cgi_tsv_pub`): free,
  no account, but the machine query contract (search by enterprise number) is
  undocumented/unverified ⇒ `legalSignals` stays empty rather than guess it.
- **LU — LBR RCS API:** restricted + paid (see above).
- **CH — opendata.swiss / LINDAS Zefix:** free but bulk RDF, not per-company.

## Out of scope (known gaps, not invented)

- **Employment signals:** CH (jobs.ch/jobup.ch — no free API) has a documented
  ABSENCE; BE (VDAB — free API but subscription-key-gated) and LU (Moovijob/ADEM — no
  verified free API) are documented above; US (no free per-company job-postings API)
  and CA (Job Bank — agreement-gated XML feed / monthly bulk CSV) idem. `jobs` stays
  empty until a *verified* free source is wired — never invented.
- **Cross-border dedup:** the `accounts` dedup schema stays FR-shaped; the registry
  identifier (UID / BCE / RCS / CIK / Juri_ID-BN) travels in the analysis result/raw
  payload only — no new DB column, no migration.

## 🇩🇪 Allemagne (pack DE) — status `beta`, contract `documented` (#4736, lot G)

- **Transfer basis:** Germany is an **EU member — full GDPR** (+ BDSG). No cross-border
  transfer barrier.
- **Source:** none wired. The Handelsregister portal is a stateful web app (session,
  token, CAPTCHA) and structured access is paid; no free, verifiable "name → HRB"
  endpoint exists. The pack makes **zero network calls**.
- **Collectable:** nothing from a registry. The pack only injects a prompt vocabulary
  (legal forms, Mittelstand, remote wording). **Not collectable:** natural-person data
  (managing directors, shareholders) — never read, never inferred.
- **Remote:** `derive_remote_policy` recognises "vollständig / komplett remote" and
  "100 % remote" as full remote; "Homeoffice möglich" is NOT a policy (stays unset).

## 🇬🇧 Royaume-Uni / Angleterre (pack GB) — status `beta`, contract `documented` (#4736, lot G)

- **Transfer basis:** EU **adequacy decision for the United Kingdom** (UK GDPR / DPA 2018).
- **Source:** none wired yet. **Companies House** offers a free API that requires an API
  key (HTTP Basic); wiring it needs a key name documented in `agent_docs/env-reference.md`,
  a `rate_limiter` bucket and a contract verified on a real instance — out of this lot's
  perimeter. Without a key the pack stays a strict no-op (zero network).
- **Collectable (when wired):** company identity only (name, company number, legal form,
  registered office, status). **Not collectable:** officers' / PSC personal data.
- **Remote:** "fully remote", "remote-first", "100% remote" = full remote; "hybrid
  working" and "flexible working" are not.

## 🇪🇸 Espagne (pack ES) — status `beta`, contract `documented` (#4736, lot G)

- **Transfer basis:** Spain is an **EU member — full GDPR** (+ LOPDGDD). No cross-border
  transfer barrier.
- **Source:** none wired. Registro Mercantil consultation is paid (nota simple /
  certificates) with no free name search API. The pack makes **zero network calls**.
- **Collectable:** nothing from a registry. **Not collectable:** natural-person data
  (administrators, shareholders); an *autónomo* is a natural person, not a company.
- **Remote:** "100 % remoto", "totalmente remoto", "teletrabajo total" = full remote;
  "híbrido", "teletrabajo parcial" and "posibilidad de teletrabajo" are not.
