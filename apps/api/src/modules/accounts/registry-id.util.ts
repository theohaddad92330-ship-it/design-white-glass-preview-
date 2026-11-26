/**
 * Canonicalisation of national registry identifiers — the cross-border twin of
 * the French SIREN (dédup internationale des comptes canoniques).
 *
 * The country packs (apps/ia/app/services/country_packs/*) resolve a company to
 * its national registry identity and surface the identifier in DISPLAY form
 * (Swiss UID ``CHE-105.944.452``, Belgian BCE ``0202.239.951``…). Deduping on a
 * display form is fragile — the same company would collide or not depending on
 * dots/dashes/zero-padding — so the account columns ``registry_id`` /
 * ``registry_country`` store the CANONICAL form computed here, and the partial
 * unique index ``accounts_workspace_registry_active_uniq`` (migration
 * 1785860000000) enforces one active canonical account per workspace on it.
 *
 * Canonical forms per country (mirrors each pack's own normaliser):
 *  - US — SEC CIK: digits only, zero-padded to 10 (``1467373`` → ``0001467373``,
 *    matches ``us.py _normalize_cik``; the optional ``CIK`` prefix is accepted).
 *  - CA — Corporations-Canada / provincial corp id: separators stripped,
 *    uppercased (federal ids are plain digits; some provincial ids carry
 *    letters, e.g. ``BC1234567``).
 *  - CH — UID: dots/dashes/spaces stripped, uppercased → ``CHE`` + 9 digits
 *    (``CHE-105.944.452`` → ``CHE105944452``, matches ``ch.py _normalize_uid``;
 *    a bare 9-digit form is accepted and prefixed).
 *  - BE — BCE/KBO enterprise number: digits only, 10 digits (a legacy 9-digit
 *    form gains the leading ``0``, matches ``be.py _normalize_bce``; only
 *    enterprise numbers — first digit 0/1 — are valid, 2xxx = establishment).
 *  - LU — RCS: separators stripped, uppercased → section letter + digits
 *    (``b 19669`` → ``B19669``). A digits-only value is REFUSED — the section
 *    letter is part of the identifier and is never guessed.
 *  - FR is deliberately REFUSED here: the French pivot is (and stays) the
 *    ``siren`` column — its dedup path is strictly unchanged, and no payload
 *    may re-route it through the registry columns.
 *  - Unknown country (a future pack): generic canonicalisation — common display
 *    separators (spaces/dots/dashes/slashes) stripped, uppercased, must end up
 *    alphanumeric. Refused otherwise — an identifier is never invented/mangled.
 *
 * Every invalid/unparseable input returns ``null`` (never a fabricated id —
 * CLAUDE.md « JAMAIS de données fictives ») so callers simply skip persistence.
 */

/** A canonical (registry country, registry id) pair ready to persist. */
type RegistryRef = {
  /** Upper-case ISO-ish 2-letter registry country, e.g. "US". */
  country: string
  /** Canonical national identifier, e.g. "0001467373" / "CHE105944452". */
  id: string
}

/** Strip the common display separators (spaces, dots, dashes, slashes). */
function stripSeparators(value: string): string {
  return value.replace(/[\s./-]+/g, '')
}

function normalizeUs(raw: string): string | null {
  // "0001467373" / "1467373" / "CIK 1467373" / "CIK:1467373" — a CIK in any
  // accepted spacing (mirror of us.py _is_cik/_normalize_cik).
  const match = /^(?:CIK[\s:]*)?(\d{1,10})$/i.exec(raw)
  return match?.[1] ? match[1].padStart(10, '0') : null
}

function normalizeCa(raw: string): string | null {
  const compact = stripSeparators(raw).toUpperCase()
  return /^[A-Z0-9]{1,20}$/.test(compact) ? compact : null
}

function normalizeCh(raw: string): string | null {
  const compact = stripSeparators(raw).toUpperCase()
  if (/^CHE\d{9}$/.test(compact)) return compact
  // Bare 9-digit UID (registry payloads sometimes omit the CHE prefix).
  if (/^\d{9}$/.test(compact)) return `CHE${compact}`
  return null
}

function normalizeBe(raw: string): string | null {
  let digits = stripSeparators(raw)
  if (!/^\d+$/.test(digits)) return null
  if (digits.length === 9) digits = `0${digits}` // legacy 9-digit form
  // Enterprise numbers are 10 digits starting 0/1 (2xxx = establishment unit).
  return /^[01]\d{9}$/.test(digits) ? digits : null
}

function normalizeLu(raw: string): string | null {
  const compact = stripSeparators(raw).toUpperCase()
  return /^[A-Z]\d{1,7}$/.test(compact) ? compact : null
}

function normalizeGeneric(raw: string): string | null {
  const compact = stripSeparators(raw).toUpperCase()
  return /^[A-Z0-9]{1,64}$/.test(compact) ? compact : null
}

const NORMALIZERS: Record<string, (raw: string) => string | null> = {
  US: normalizeUs,
  CA: normalizeCa,
  CH: normalizeCh,
  BE: normalizeBe,
  LU: normalizeLu,
}

/**
 * Canonical (country, id) pair from a country pack's registry resolution, or
 * ``null`` when either half is missing/invalid — the caller then skips the
 * registry persistence entirely (exactly like an absent SIREN skips the FR one).
 */
export function normalizeRegistryRef(
  country: string | null | undefined,
  rawId: string | null | undefined,
): RegistryRef | null {
  const code = (country ?? '').trim().toUpperCase()
  if (!/^[A-Z]{2}$/.test(code)) return null
  // FR never routes through the registry columns — the SIREN path owns it.
  if (code === 'FR') return null
  const raw = (rawId ?? '').trim()
  if (!raw) return null
  const id = (NORMALIZERS[code] ?? normalizeGeneric)(raw)
  return id ? { country: code, id } : null
}
