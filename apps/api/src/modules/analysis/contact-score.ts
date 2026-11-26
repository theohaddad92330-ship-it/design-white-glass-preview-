import { angleThemeTokens, computeAngleMatchFromTokens, type ContactApolloDetails } from '@bellum/contracts'

// ── Shared contact-scoring context — the deterministic inputs to Théo's
// Contact Priority Score /100 (03_BUSINESS_RULES §3, `computeContactScore` in
// @bellum/contracts). Extracted from the dashboard telemetry so the SAME grid
// feeds BOTH the operator monitoring view AND the customer-facing contacts API
// (a P1-perimeter decision-maker must score identically wherever it's shown).
// Pure functions, no I/O — the caller loads `account.raw_analysis` and passes it.

/** Deck source tag for a contact, derived deterministically from its origin:
 *  registry / verified directories are PUBLIC, AI/web-inferred are HYPOTHÈSE,
 *  CRM-owned is INTERNE. */
function contactSourceTagBySource(source: string | null): string {
  switch ((source ?? '').toLowerCase()) {
    case 'apollo':
    case 'linkedin_apify':
    case 'pappers':
      return 'PUBLIC'
    case 'crm':
    case 'manual':
      return 'INTERNE'
    default:
      // ai_generated / web / brave / unknown → inferred, not verified.
      return 'HYPOTHÈSE'
  }
}

// Legal suffixes / group words dropped before comparing company names, so
// "Société Générale S.A." and "SOCIETE GENERALE" read as the same company.
const COMPANY_LEGAL_NOISE = /\b(sas|sasu|sarl|sca|snc|gie|groupe?|holding|company|corp|inc|ltd|cie)\b/g

function normalizeCompany(name: string | null | undefined): string {
  return (name ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(COMPANY_LEGAL_NOISE, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function companiesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizeCompany(a)
  const nb = normalizeCompany(b)
  if (!na || !nb) return false
  return na === nb || na.includes(nb) || nb.includes(na)
}

/** `manual`/`crm` — the entity/company on this row was entered by a HUMAN
 *  (same classification `contactSourceTagBySource` already uses for
 *  `INTERNE`), never inferred by a provider. */
function isHumanSource(source: string | null): boolean {
  const normalized = (source ?? '').toLowerCase()
  return normalized === 'manual' || normalized === 'crm'
}

/** The employer a provider's signal (Apollo) currently reports, when it
 *  matches neither the account nor the stored entity — `null` when there is
 *  no confident positive mismatch (no current org known, or it matches). */
function providerReportedEmployer(
  apolloDetails: ContactApolloDetails | null | undefined,
  companyName: string,
  entity: string | null,
): string | null {
  const ongoing = ongoingEntries(apolloDetails?.employmentHistory)
  const atAccount = (organization: string | undefined): boolean =>
    companiesMatch(organization, companyName) || (!!entity && companiesMatch(organization, entity))
  // #4465 — une personne encore en cours chez le compte y est, même si une autre expérience en cours existe ailleurs.
  if (ongoing.some(e => atAccount(e.organization))) return null
  const current = ongoing[0]?.organization ?? apolloDetails?.organization
  if (!current) return null
  if (atAccount(current)) return null
  return current
}

type HistoryEntry = NonNullable<ContactApolloDetails['employmentHistory']>[number]

/** #4465 — une expérience est EN COURS quand le fournisseur la dit courante ET qu'elle n'a pas de date de fin. Les plus
 *  récentes d'abord (début le plus récent ; sans début en dernier ; à égalité, l'ordre du fournisseur). */
function ongoingEntries(history: readonly (HistoryEntry | null | undefined)[] | undefined): HistoryEntry[] {
  return (history ?? [])
    .map((entry, index) => ({ entry, index }))
    .filter(
      (pair): pair is { entry: HistoryEntry; index: number } =>
        !!pair.entry && !pair.entry.end_date?.trim() && pair.entry.current === true,
    )
    .sort((a, b) => {
      const sa = a.entry.start_date?.trim() ?? ''
      const sb = b.entry.start_date?.trim() ?? ''
      if (sa === sb) return a.index - b.index
      if (!sa) return 1
      if (!sb) return -1
      return sa < sb ? 1 : -1
    })
    .map(pair => pair.entry)
}

/** #4465 — LA fonction d'un contact : l'expérience EN COURS la plus récente chez l'employeur du compte. Jamais une
 *  expérience terminée ; aucune en cours chez ce compte ⇒ `null` (inconnu — l'appelant garde ce qu'il avait). */
export function currentPositionTitle(
  history: ContactApolloDetails['employmentHistory'],
  employerNames: readonly (string | null | undefined)[],
): string | null {
  const names = employerNames.filter((n): n is string => !!n?.trim())
  if (names.length === 0) return null
  const found = ongoingEntries(history).find(
    e => !!e.title?.trim() && names.some(n => companiesMatch(e.organization, n)),
  )
  return found?.title?.trim() || null
}

/**
 * #4465 — la fonction à poser après un enrichissement : l'expérience en cours chez le compte (historique riche,
 * `organization_name`), seulement si elle diffère de la fonction connue. `null` ⇒ ne rien écrire : ligne humaine
 * (`manual`/`crm` — une correction humaine gagne), expérience introuvable, ou déjà la bonne.
 */
export function enrichmentPositionTitle(input: {
  source: string | null
  currentTitle: string | null
  history:
    | ReadonlyArray<{
        organization_name?: string | null
        title?: string | null
        start_date?: string | null
        end_date?: string | null
        current?: boolean
      }>
    | null
    | undefined
  employerNames: readonly (string | null | undefined)[]
}): string | null {
  if (isHumanSource(input.source)) return null
  const light = (input.history ?? []).map(e => ({
    title: e.title ?? undefined,
    organization: e.organization_name ?? undefined,
    current: e.current,
    start_date: e.start_date ?? undefined,
    end_date: e.end_date ?? undefined,
  }))
  const title = currentPositionTitle(light, input.employerNames)
  return title && title !== (input.currentTitle ?? '').trim() ? title : null
}

/** #4465 — départ PROUVÉ par l'historique : plus aucune expérience en cours, et une expérience TERMINÉE (date de fin
 *  écrite) chez le compte. Sans date de fin, ou sans historique, on ne conclut pas. */
function leftTheAccount(
  apolloDetails: ContactApolloDetails | null | undefined,
  companyName: string,
  entity: string | null,
): boolean {
  const history = apolloDetails?.employmentHistory
  if (!history?.length || ongoingEntries(history).length > 0) return false
  return history.some(
    e =>
      !!e?.end_date?.trim() &&
      (companiesMatch(e.organization, companyName) || (!!entity && companiesMatch(e.organization, entity))),
  )
}

/** RISQUE (deck's 4th source tag — «obsolète») — a provider's signal says the
 *  contact's CURRENT employer matches neither the account nor their stored
 *  entity, i.e. they've moved on and this row is stale. Conservative on
 *  purpose: it only fires on a confident positive mismatch (no current org
 *  known → not RISQUE), so a still-employed subsidiary contact never gets
 *  false-flagged.
 *
 *  #2296.10/.36/.37 — never fires on a HUMAN-sourced row (`manual`/`crm`) :
 *  « une correction humaine gagne toujours, quelle que soit sa date ». Before
 *  this guard, a contact entered by a human (its company/entity a human
 *  fact) was silently overridden to RISQUE — and with it, `lifecycle_state`
 *  flipped to `historique` and active outreach sequences were auto-stopped —
 *  the instant a provider's signal disagreed, exactly the override the
 *  doctrine forbids. The disagreement itself is never silenced: see
 *  {@link employerConflict}, which names it instead of hiding it. */
function isObsoleteContact(
  apolloDetails: ContactApolloDetails | null | undefined,
  companyName: string,
  entity: string | null,
  source: string | null,
): boolean {
  if (isHumanSource(source)) return false
  return (
    providerReportedEmployer(apolloDetails, companyName, entity) !== null ||
    leftTheAccount(apolloDetails, companyName, entity)
  )
}

/** #2296.10/.36/.37 — the conflict {@link isObsoleteContact} now REFUSES to
 *  silence for a human-sourced row: two sources disagree (the human-entered
 *  company/entity vs. a provider's signal), and the human fact wins, but the
 *  disagreement is named rather than hidden. `null` ⇒ no conflict (either the
 *  row isn't human-sourced, or the provider agrees / knows nothing current).
 *  Never names the provider itself (`agent_docs/doctrine.md` — « nos
 *  fournisseurs ne se nomment jamais à l'écran »), only the employer it
 *  reports — a real, verifiable fact. */
export function employerConflict(
  source: string | null,
  apolloDetails: ContactApolloDetails | null | undefined,
  companyName: string,
  entity: string | null,
): { detectedEmployer: string } | null {
  if (!isHumanSource(source)) return null
  const detectedEmployer = providerReportedEmployer(apolloDetails, companyName, entity)
  return detectedEmployer ? { detectedEmployer } : null
}

/** #3219 (#190.2 côté contact, 11/10/2026) — l'écart d'EMPLOYEUR entre la fiche
 *  et une source, pour le contrôle avant action (`contact-preflight.ts`), quelle
 *  que soit l'origine de la ligne : {@link employerConflict} ne le nomme que sur
 *  une ligne humaine (la machine l'a déjà marquée RISQUE sinon) ; ici les deux
 *  cas se nomment, et `recordKeptByHuman` dit lequel garde la main. MÊME
 *  détecteur ({@link providerReportedEmployer}), jamais un second. */
export function employerDifference(
  source: string | null,
  apolloDetails: ContactApolloDetails | null | undefined,
  companyName: string,
  entity: string | null,
): { detectedEmployer: string; recordKeptByHuman: boolean } | null {
  const detectedEmployer = providerReportedEmployer(apolloDetails, companyName, entity)
  return detectedEmployer ? { detectedEmployer, recordKeptByHuman: isHumanSource(source) } : null
}

/** #3219 — la ligne a-t-elle été saisie par un humain (`manual`/`crm`) ? La MÊME
 *  règle que {@link employerConflict}, exposée pour le contrôle avant action. */
export function isHumanEnteredContact(source: string | null): boolean {
  return isHumanSource(source)
}

/** #2632.1 — miroir de {@link isObsoleteContact} : Apollo montre un employeur
 *  ACTUEL qui correspond au compte (ou à l'entité), précédé dans l'historique
 *  d'un employeur DIFFÉRENT — cette personne vient d'y arriver. Déterministe,
 *  à partir des mêmes données déjà collectées (aucune date inventée, aucun
 *  appel externe neuf) : une seule entrée d'historique (rien avant le poste
 *  actuel) ou un employeur précédent identique (promotion interne) ne
 *  déclenchent rien. */
function isNewArrival(
  apolloDetails: ContactApolloDetails | null | undefined,
  companyName: string,
  entity: string | null,
): boolean {
  const history = apolloDetails?.employmentHistory
  if (!history?.length) return false
  const currentEntry = ongoingEntries(history)[0]
  const current = currentEntry?.organization
  if (!current) return false
  const matchesAccount = companiesMatch(current, companyName) || (!!entity && companiesMatch(current, entity))
  if (!matchesAccount) return false
  return history.some(e => {
    if (!e || e === currentEntry || e.current || !e.organization) return false
    if (companiesMatch(e.organization, companyName)) return false
    if (entity && companiesMatch(e.organization, entity)) return false
    return true
  })
}

/** Full deck source tag: RISQUE (stale) wins over the origin-based tag,
 *  ARRIVEE (nomination récente) vient ensuite — voir {@link isNewArrival}. */
export function contactSourceTag(
  source: string | null,
  apolloDetails: ContactApolloDetails | null | undefined,
  companyName: string,
  entity: string | null,
): string {
  if (isObsoleteContact(apolloDetails, companyName, entity, source)) return 'RISQUE'
  if (isNewArrival(apolloDetails, companyName, entity)) return 'ARRIVEE'
  // #3911.1 — la recherche qui a trouvé ce contact n'avait aucune ancre EXACTE
  // (id Apollo / domaine du compte), seulement le nom en texte libre : deux
  // entités homonymes la passent toutes les deux (comme sur Découvrir — le
  // nom seul ne distingue jamais deux sociétés qui le partagent). PUBLIC
  // (annuaire vérifié) devient alors HYPOTHÈSE (inféré, à revérifier) — jamais
  // sur une ligne humaine : une correction humaine gagne toujours (#2296.10).
  if (apolloDetails?.employerUnverified && !isHumanSource(source)) return 'HYPOTHÈSE'
  return contactSourceTagBySource(source)
}

/** Normalize an entity name so a contact's ``entity`` matches the account's
 *  cartography: lowercase, drop any parenthetical, collapse whitespace. Lets
 *  "ASF (Autoroutes du Sud de la France)" match a contact tagged just "ASF". */
function normalizeEntityName(name: unknown): string {
  return String(name ?? '')
    .replace(/\(.*?\)/g, ' ')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '') // "VINCI Énergies" === "VINCI Energies" — else the
    .toLowerCase() //                   cartography lookup misses and the /100 score flatlines
    .replace(/\s+/g, ' ')
    .trim()
}

type EntityScoreContext = { relevance?: string; perimeterTier?: string }

/** Map each account entity (by normalized name) to its S2 relevance + B.1
 *  perimeter tier, read from the ``raw_analysis`` cartography. A contact then
 *  inherits the zone of the entity it sits in — the signal that SPREADS the
 *  /100 contact score (a P1-perimeter contact outscores a secondary or
 *  out-of-sector one). Without it every contact scored a flat neutral. Keys are
 *  read snake_case (persisted blob) with a camelCase fallback. */
export function buildEntityScoreContext(rawAnalysis: Record<string, unknown> | null): Map<string, EntityScoreContext> {
  const ctx = new Map<string, EntityScoreContext>()
  if (!rawAnalysis) return ctx
  const upsert = (name: unknown, patch: EntityScoreContext) => {
    const key = normalizeEntityName(name)
    if (!key) return
    ctx.set(key, { ...ctx.get(key), ...patch })
  }
  const entities = (rawAnalysis.entities_exhaustive ?? rawAnalysis.entitiesExhaustive) as
    | Array<Record<string, unknown>>
    | undefined
  for (const e of entities ?? []) {
    if (e && typeof e === 'object' && typeof e.relevance === 'string') upsert(e.name, { relevance: e.relevance })
  }
  // Priority perimeters carry the authoritative P1/P2 tier — applied last so it
  // wins over any tier a relevance entry might have set.
  const perimeters = (rawAnalysis.priority_perimeters ?? rawAnalysis.priorityPerimeters) as
    | Array<Record<string, unknown>>
    | undefined
  for (const p of perimeters ?? []) {
    if (p && typeof p === 'object' && typeof p.tier === 'string') upsert(p.name, { perimeterTier: p.tier })
  }
  return ctx
}

/** Resolve a contact's entity zone, tolerating BU-name drift. Ports
 *  ``_entity_matches`` (phase4_plan.py): exact normalized match first, else a
 *  whole-word prefix in either direction, but only when the shorter name has ≥2
 *  tokens. Without it a contact tagged "VINCI Energies Digital" missed the
 *  cartography entity "VINCI Energies" and its proximité /20 flatlined to
 *  neutral; the ≥2-token guard stops a bare "VINCI" from grabbing every
 *  "VINCI …" contact across BUs. On multiple prefix matches the most specific
 *  (longest) entity name wins, so a contact inherits its narrowest known zone. */
export function lookupEntityZone(
  entityContext: Map<string, EntityScoreContext>,
  contactEntity: unknown,
): EntityScoreContext {
  const e = normalizeEntityName(contactEntity)
  if (!e) return {}
  const exact = entityContext.get(e)
  if (exact) return exact
  let best: EntityScoreContext | null = null
  let bestLen = -1
  for (const [name, zone] of entityContext) {
    if (!name) continue
    const shorter = name.length <= e.length ? name : e
    if (shorter.split(' ').length < 2) continue
    if ((e.startsWith(name + ' ') || name.startsWith(e + ' ')) && name.length > bestLen) {
      best = zone
      bestLen = name.length
    }
  }
  return best ?? {}
}

// A contact row as it lands from the DB — the subset of `ContactEntity` the
// score reads. Kept structural (not the entity class) so the customer contacts
// service and the operator telemetry service both feed it without coupling.
type ContactScoreRow = {
  title?: string | null
  decision_role?: string | null
  email?: string | null
  email_verified?: boolean | null
  linkedin_url?: string | null
  source?: string | null
  entity?: string | null
  raw_data?: unknown
}

// The per-account context, built ONCE per account then reused for every contact
// (the entity cartography + angle themes are identical across the account's rows).
type ContactScoreContext = {
  entityContext: Map<string, EntityScoreContext>
  themeTokens: Set<string>
  companyName: string
}

/** Build the per-account scoring context from the persisted ``raw_analysis``
 *  blob (cartography entities/perimeters + recommended angles). Call once per
 *  account, then {@link buildContactScoreInput} per contact. */
export function buildContactScoreContext(
  rawAnalysis: Record<string, unknown> | null,
  companyName = '',
): ContactScoreContext {
  const angles = (Array.isArray(rawAnalysis?.angles) ? rawAnalysis?.angles : []) as Array<{ title?: string | null }>
  return {
    entityContext: buildEntityScoreContext(rawAnalysis),
    themeTokens: angleThemeTokens(angles),
    companyName,
  }
}

/** Assemble the exact ``computeContactScore`` input for one contact row: its
 *  role + reachability + provenance, plus the inherited entity zone (proximité
 *  périmètre) and fit-angle match. Feed the result straight to
 *  ``computeContactScore`` / ``computeContactRelevanceScore`` /
 *  ``computeContactAccessibilityScore`` from @bellum/contracts. */
export function buildContactScoreInput(row: ContactScoreRow, ctx: ContactScoreContext) {
  const zone = lookupEntityZone(ctx.entityContext, row.entity ?? null)
  const apolloDetails = ((row.raw_data ?? {}) as { apolloDetails?: ContactApolloDetails }).apolloDetails ?? null
  const sourceTag = contactSourceTag(row.source ?? null, apolloDetails, ctx.companyName, row.entity ?? null)
  return {
    title: row.title ?? null,
    role: row.decision_role ?? null,
    email: row.email ?? null,
    emailVerified: row.email_verified ?? null,
    linkedinUrl: row.linkedin_url ?? null,
    source: row.source ?? null,
    entityRelevance: zone.relevance ?? null,
    perimeterTier: zone.perimeterTier ?? null,
    angleMatch: computeAngleMatchFromTokens({ title: row.title ?? null }, ctx.themeTokens),
    // Apollo employer mismatch = the contact LEFT the company → stale row, which
    // collapses fraîcheur (#20) and drags the /100 down.
    employerMismatch: sourceTag === 'RISQUE',
  }
}

/**
 * L'étiquette de source d'une ligne de contact, telle que l'écran l'affiche.
 *
 * Même calcul que celui qui alimente le score — un seul, pour que le badge et
 * la note ne puissent pas se contredire.
 */
export function sourceTagForRow(row: ContactScoreRow, ctx: ContactScoreContext): string {
  const apolloDetails = ((row.raw_data ?? {}) as { apolloDetails?: ContactApolloDetails }).apolloDetails ?? null
  return contactSourceTag(row.source ?? null, apolloDetails, ctx.companyName, row.entity ?? null)
}
