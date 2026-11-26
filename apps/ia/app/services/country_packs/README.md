# Country packs — how to add a country

BellumAI is FR-first. A **country pack** bolts an extra, self-contained set of
public-registry + local-signal sources onto the research pipeline for **one** foreign
country, **without touching the French path**. It is the direct sibling of the FR
`DataGateway.collect_fr_signals` consolidation.

> **This is the single extension point.** "Se brancher sur le pays qu'on veut" =
> implement the `CountryPack` interface below and register it. **Zero-flag policy:**
> targeting the country IS the switch — no env flag. Everything else (prompt
> injection, web-block enrichment, no-op safety) is already wired in
> `phase1_research`.

## Hard invariants (never break these)

1. **FR default untouched.** A pack contributes data ONLY when its non-FR country is
   explicitly targeted. `country="FR"` (default) or an unregistered country ⇒ every
   entry point is a strict no-op: **no network call, no prompt change, nothing
   added**. FR behaviour stays byte-identical.
2. **Additive.** A pack only ever APPENDS deduped hits to the web block and an optional
   vocabulary fragment to the prompt. It never removes a French source.
3. **Graceful per-source failure.** A missing credential or a provider outage degrades
   that source to its empty value (`None` / `[]`) — never a fake, never an exception
   that sinks the run.
4. **Never invent data or endpoints.** Only wire an endpoint you have **verified**
   (real URL, real response shape). No free/verifiable source? Ship the pack in
   **`beta` (degraded)** mode — vocabulary + ontology only — and document the gap.
   (See `lu.py` for a worked degraded example.)

## The interface — `CountryPack` (see `base.py`)

Subclass `CountryPack` and set **six class attributes** (pure data, no I/O):

| attribute          | example                    | purpose                                   |
| ------------------ | -------------------------- | ----------------------------------------- |
| `code`             | `"CH"`                     | ISO-ish 2-letter country code             |
| `identifier_label` | `"UID"`                    | human label of the national identifier    |
| `country_name`     | `"Suisse"`                 | human country name                        |
| `languages`        | `("fr", "de", "it")`       | business/registry languages (ISO-639-1)   |
| `registry_name`    | `"Zefix"`                  | official registry name                    |
| `status`           | `"live"` / `"beta"` / `"planned"` | maturity (see `PackStatus`)        |

Then implement **four abstract methods**:

- `entity_ontology() -> dict` — static local ontology (legal forms, holding vs
  operating, regional axis, shells to filter). **Pure data — no network.**
- `local_vocabulary() -> dict` — static vocabulary + a ready-to-inject
  `prompt_fragment` string (registry name, identifier, languages, local caveats).
  **Pure data — no network.** This is injected into the research prompt and is the
  minimum value even a `beta` pack delivers.
- `async registry_lookup(query, *, client=None) -> RegistryEntity | None` — resolve a
  company **name or national identifier** to a normalized `RegistryEntity`. `None`
  when unresolved/disabled/error. **No network when disabled or a credential is
  missing.** A `beta` pack returns `None` with zero network.
- `async collect_signals(company, *, ident=None, client=None) -> CountrySignals` —
  consolidated signals (registry entity + legal signals + jobs + additive URL-deduped
  `hits`). Returns `empty_signals(code)` when a required credential is missing or the
  pack is degraded — no network.

`metadata()` is provided by the base class (derived from the six attributes) — you
do not override it.

## Registration

Add one entry to `COUNTRY_PACKS` in `__init__.py`:

```python
from app.services.country_packs.xx import XxPack
COUNTRY_PACKS = {
    ...,
    XxPack.code: XxPack(),
}
```

`get_active_pack(country)` and `collect_country_signals(...)` then pick it up
automatically; `list_supported_countries()` lists it (network-free, for a UI). The
pipeline (`phase1_research`) already:

- injects `local_vocabulary()["prompt_fragment"]` into the user context, and
- appends `collect_signals(...)["hits"]` to the web block (deduped by URL),

both gated on `get_active_pack` being non-`None`.

## Rate limiting

If the pack calls a registry, add a conservative bucket in
`app/services/rate_limiter.py` (`_DEFAULTS`, e.g. `"zefix": {"rpm": 30,
"concurrency": 5}`) and wrap requests in `async with throttle("<bucket>")`. A `beta`
pack that makes no call needs no bucket.

## COMPLIANCE

Add a country section to `COMPLIANCE.md`: **transfer basis** (GDPR / adequacy /
local law), **source** + access terms (free / paid / credential), **data collected**
(minimisation), and any **known gaps** (no invention). Free-but-gated sources you
chose not to wire go under the documented list, with the reason.

## Tests + golden accounts

Every pack needs pytest coverage in `tests/test_country_packs.py`:

- **FR no-op** — the FR path makes **zero** network calls (arm the pack's
  `httpx.AsyncClient` with a bomb and assert it is never constructed); a
  credential-gated source (Zefix) makes zero calls without its creds;
- resolution parsing (or, for `beta`, that lookup returns `None` with no network);
- vocabulary/ontology sanity (identifier + registry present in the fragment);
- `list_supported_countries()` includes the new code with the right `status`;
- **golden accounts** — a `tests/golden/country/<code>.json` fixture with **3–5 real,
  verified** companies (name + national identifier + source citation + verification
  date). The golden test asserts the identifiers are well-formed and canonical (format
  non-regression) — it does **not** hit the live registry.

Record HTTP fixtures (real registry payloads) under `tests/golden/country/` and drive
lookups against them with a mocked client — no real network in tests.

## Statuses

- **`live`** — resolution wired against a verified free endpoint (CH via Zefix, BE via
  KBO Public Search, US via SEC EDGAR, CA via Canada's Business Registries).
- **`beta`** — usable (vocabulary + ontology injected) but resolution is degraded: no
  free structured endpoint exists (LU — the RCS API is restricted/paid). Documented in
  the pack docstring + `COMPLIANCE.md`.
- **`planned`** — a reserved code with no implementation yet.

See `agent_docs/international/rapport-initial.md` for the per-country registry map,
go/no-go and the 9-deliverable "pack pays" checklist.
