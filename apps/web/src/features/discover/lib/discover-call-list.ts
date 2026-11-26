import type { BuyerRoleFamilyKey, ContactListItem, CoverageLevel, DiscoverCallListCompany } from '@bellum/contracts'
import { normalizeCompanyNameKey, resolveBuyerRoleFamilyFromTitle, resolveContactLevel } from '@bellum/contracts'
import { toCsv } from '@/lib/csv'
import { isExcludedByQualification } from './discover-presentation'
import type { DiscoverCandidate, DiscoverCoverage, DiscoverPortfolioState, DiscoverSignal } from './discover-types'

/* ------------------------------------------------------------------ */
/*  #2545.1 — LE TABLEAU D'APPELS.                                      */
/*                                                                     */
/*  Retour client (Ludovic Marx, 17/09/2026, #2545) : « zone géo ou      */
/*  type de société : doit ressortir des boîtes qui ont des signaux,    */
/*  et dans chacune 10 mecs à appeler ». Ce n'est pas une carte de plus  */
/*  à ouvrir : c'est le CROISEMENT de deux lectures que Découvrir sait   */
/*  déjà produire — les entreprises de la recherche (`accounts`) et les  */
/*  personnes déjà connues de l'espace (`contacts`, #2165.7) — dans un   */
/*  seul tableau, une ligne par personne.                                */
/*                                                                     */
/*  ⚠️ Même règle que `discover-result-rows.ts` : une projection ne      */
/*  FABRIQUE jamais de ligne, et ce qu'elle écarte est COMPTÉ. Une       */
/*  entreprise qualifiée sans contact connu reste une LIGNE — la         */
/*  masquer ferait disparaître une boîte à signal juste parce que        */
/*  personne n'y est encore identifié.                                  */
/* ------------------------------------------------------------------ */

/** Recette 21/10 D.1 (LC.3) — 3 personnes par entreprise : 10 contacts d'une seule boîte (STILL) occupaient
 *  toute la liste. L'ordre de pertinence est gardé DANS chaque entreprise ; l'excédent est compté, jamais
 *  tu (`DiscoverCallListProjection.truncatedCompanies`). */
export const MAX_CONTACTS_PER_CALL_LIST_COMPANY = 3

/**
 * Clé de rapprochement ENTREPRISE ↔ CONTACT, par NOM — heuristique, pas une
 * identité légale. #3819 — la règle vit désormais dans `@bellum/contracts`
 * (`normalizeCompanyNameKey`) : la route `POST /contacts/call-list` rapproche
 * avec la MÊME (GA-26).
 */
export function normalizeCompanyKey(name: string): string {
  return normalizeCompanyNameKey(name)
}

/** La personne d'une ligne : ce que la liste de contacts ET la route
 *  `call-list` portent toutes deux (une seule forme lue, deux sources). */
type CallListPerson = Pick<
  ContactListItem,
  'id' | 'full_name' | 'title' | 'decision_role' | 'email' | 'phone' | 'location'
> & {
  email_verified?: boolean | null
}

/** #2545.1 — ce qu'une ligne de personne ne sait pas, nommé. Distinct du
 *  `DiscoverContactUnknown` de `discover-contact-rows.ts` : ce tableau ne
 *  porte pas de localisation PERSONNE (colonne « localisation » = celle de
 *  l'ENTREPRISE, déjà connue, jamais devinée du siège vers la personne). */
type CallListPersonUnknown = 'person' | 'title' | 'level' | 'expertise' | 'email' | 'phone'

export interface DiscoverCallListRow {
  /** Stable et unique : le SIREN + l'identifiant du contact, ou `none`. */
  key: string
  siren: string
  accountId: string | null
  portfolioState: DiscoverPortfolioState
  /** Colonne « entreprise ». */
  company: string
  /** Colonne « site ». */
  website: string | null
  /** Colonne « raison » — l'angle SUGGÉRÉ par le modèle (#2165), jamais un fait. */
  reason: string | null
  /** Colonne « signal » — le plus RÉCENT de l'entreprise. `null` = aucun signal daté. */
  signal: { type: DiscoverSignal['type']; label: string; date: string } | null
  /** Le SITE de l'ENTREPRISE (registre) — identique sur toutes les lignes d'une même entreprise : il
   *  s'affiche UNE fois par entreprise (« Site : … »), jamais comme le lieu de la personne. */
  city: string | null
  department: string | null
  /** LUDOVIC-F F.3 (LC.1, Ludovic 20/10) — le lieu de travail du CONTACT, quand on le connaît (`location`
   *  collecté). `null` = inconnu : aucune ligne, jamais le siège de l'entreprise rabattu sur la personne. */
  contactLocation: string | null
  /** Colonne « confiance » — même second axe que la carte compte
   *  (`DiscoverCandidate.dataConfidence`), jamais recalculé ici. */
  confidence: number | null
  /** `null` = aucune personne connue dans l'espace pour cette entreprise. */
  contactId: string | null
  /** Colonne « nom ». */
  fullName: string | null
  /** Colonne « fonction ». */
  title: string | null
  level: CoverageLevel | null
  expertise: BuyerRoleFamilyKey | null
  /** Colonne « e-mail » — la VALEUR, contrairement à la liste de navigation
   *  (`DiscoverContactRow.channels`, booléen) : ce tableau EXISTE pour être
   *  appelé et exporté, la coordonnée en est le point. */
  email: string | null
  /** Colonne « téléphone ». */
  phone: string | null
  /** #3819 — l'adresse a été VÉRIFIÉE par une source ; `null` = jamais vérifiée. */
  emailVerified?: boolean | null
  unknown: CallListPersonUnknown[]
}

interface DiscoverCallListProjection {
  rows: DiscoverCallListRow[]
  /** Entreprises qualifiées dont plus de dix contacts existaient dans
   *  l'espace — l'excédent est COMPTÉ, jamais silencieusement coupé. */
  truncatedCompanies: number
  /** Entreprises écartées par le conseil de qualification (#2165) : ni
   *  rangées ici, ni dites « pertinentes » — même règle que `unresolvedNaf`. */
  excludedCompanies: number
}

/** Le signal le plus récent d'un candidat, ou `null` — même ordre que
 *  `sortSignalsByDate` (`discover-normalize.ts`), sans lui importer. */
function latestSignal(signals: readonly DiscoverSignal[]): DiscoverCallListRow['signal'] {
  // #3819 — un signal COMMERCIAL (AO, recrutement, projet…) passe avant la vie
  // juridique, quelle que soit sa date : la vie juridique reste affichée sur la
  // carte, mais elle n'est pas la raison d'appeler.
  let latest: DiscoverSignal | null = null
  for (const signal of signals) {
    if (Number.isNaN(Date.parse(signal.date))) continue
    if (!latest) {
      latest = signal
      continue
    }
    const commercial = signal.type !== 'legal'
    const latestCommercial = latest.type !== 'legal'
    if (commercial !== latestCommercial) {
      if (commercial) latest = signal
      continue
    }
    if (signal.date > latest.date) latest = signal
  }
  return latest ? { type: latest.type, label: latest.label, date: latest.date } : null
}

function foldName(value: string | null | undefined): string {
  return (value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, ' ')
}

/**
 * LUDOVIC-E LC.4 — « Claudie Grossetete » (avec e-mail) ET « Claudie » (même fonction, sans nom) chez
 * ENEDIS : un prénom seul + la même fonction + le même compte désignent la même personne. À
 * l'AFFICHAGE seulement : on garde la fiche la plus complète, rien n'est fusionné en base (une fusion
 * se PROPOSE, doctrine). Sans fonction de part et d'autre, on ne devine rien : les deux restent.
 */
function withoutFirstNameDuplicates(people: readonly CallListPerson[]): readonly CallListPerson[] {
  const coordinates = (person: CallListPerson) => Number(Boolean(person.email)) + Number(Boolean(person.phone))
  const dropped = new Set<string>()
  for (const alone of people) {
    const first = foldName(alone.full_name)
    const title = foldName(alone.title)
    if (!first || first.includes(' ') || !title) continue
    const twin = people.find(
      other =>
        other.id !== alone.id &&
        !dropped.has(other.id) &&
        foldName(other.title) === title &&
        foldName(other.full_name).startsWith(`${first} `),
    )
    // Le nom complet gagne à égalité de coordonnées ; des coordonnées en plus sur le prénom seul gagnent.
    if (twin) dropped.add(coordinates(alone) > coordinates(twin) ? twin.id : alone.id)
  }
  return dropped.size === 0 ? people : people.filter(person => !dropped.has(person.id))
}

/**
 * #2545.1 — construit le tableau, à partir de ce que l'écran a DÉJÀ chargé :
 * les candidats VISIBLES (déjà filtrés par le rail et la barre) et les
 * personnes connues. Aucune ligne inventée.
 *
 * #3819 (démo Ludovic 08/10) — `known` est la SOURCE UNIQUE servie par
 * `POST /contacts/call-list` : pour chaque candidat rapproché d'un compte de
 * l'espace, ses dix contacts CLASSÉS et leur total. Quand elle est fournie, la
 * liste d'espace (`contacts`) n'est PLUS lue — c'est elle qui joignait les 50
 * derniers contacts de l'espace par nom et faisait dire à l'onglet Contacts
 * « 0 » pendant que ce tableau montrait dix prénoms d'une autre entreprise.
 */
export function buildCallListRows(
  candidates: readonly DiscoverCandidate[],
  contacts: readonly ContactListItem[],
  known?: ReadonlyMap<string, DiscoverCallListCompany>,
): DiscoverCallListProjection {
  const byCompanyKey = new Map<string, CallListPerson[]>()
  if (!known) {
    for (const item of contacts) {
      if (!item.company_name) continue
      const key = normalizeCompanyKey(item.company_name)
      if (key === '') continue
      const bucket = byCompanyKey.get(key)
      if (bucket) bucket.push(item)
      else byCompanyKey.set(key, [item])
    }
  }

  const rows: DiscoverCallListRow[] = []
  let truncatedCompanies = 0
  let excludedCompanies = 0

  for (const candidate of candidates) {
    // « Pertinent » (#2545.4) exclut le verdict EXCLU du conseil de
    // qualification : une boîte écartée n'est pas une boîte à appeler, mais
    // elle reste comptée — jamais fondue en silence dans le total affiché.
    // #2614.1 — même prédicat que la liste principale (`discover-presentation.ts`,
    // GA-26) : un seul endroit décide qui est une ligne exploitable.
    if (isExcludedByQualification(candidate)) {
      excludedCompanies += 1
      continue
    }

    const served = known?.get(candidate.siren)
    const base = {
      siren: candidate.siren,
      accountId: candidate.accountId ?? served?.accountId ?? null,
      portfolioState: candidate.portfolioState,
      company: candidate.name,
      website: candidate.website ?? null,
      reason: candidate.angle,
      signal: latestSignal(candidate.signals),
      city: candidate.city,
      department: candidate.department,
      confidence: candidate.dataConfidence,
    }

    const matched: readonly CallListPerson[] = withoutFirstNameDuplicates(
      known ? (served?.contacts ?? []) : (byCompanyKey.get(normalizeCompanyKey(candidate.name)) ?? []),
    )
    if (matched.length === 0) {
      rows.push({
        ...base,
        key: `${candidate.siren}:none`,
        contactId: null,
        fullName: null,
        title: null,
        level: null,
        expertise: null,
        email: null,
        phone: null,
        emailVerified: null,
        contactLocation: null,
        unknown: ['person'],
      })
      continue
    }

    const total = known ? (served?.contactsTotal ?? matched.length) : matched.length
    if (total > MAX_CONTACTS_PER_CALL_LIST_COMPANY) truncatedCompanies += 1

    for (const item of matched.slice(0, MAX_CONTACTS_PER_CALL_LIST_COMPANY)) {
      const level = resolveContactLevel({ title: item.title, decisionRole: item.decision_role })
      const expertise = resolveBuyerRoleFamilyFromTitle(item.title)
      const unknown: CallListPersonUnknown[] = []
      if (!item.title) unknown.push('title')
      if (level === null) unknown.push('level')
      if (expertise === null) unknown.push('expertise')
      if (!item.email) unknown.push('email')
      if (!item.phone) unknown.push('phone')

      rows.push({
        ...base,
        key: `${candidate.siren}:${item.id}`,
        contactId: item.id,
        fullName: item.full_name,
        title: item.title,
        level,
        expertise,
        email: item.email,
        phone: item.phone,
        emailVerified: item.email ? (item.email_verified ?? null) : null,
        contactLocation: item.location?.trim() || null,
        unknown,
      })
    }
  }

  return { rows, truncatedCompanies, excludedCompanies }
}

/**
 * #3819 — les personnes de la source unique, pour l'onglet « Contacts » :
 * celles des entreprises AFFICHÉES, dans leur ordre, sans doublon. La même
 * réponse que la liste d'appels — les deux lectures ne peuvent plus se
 * contredire (recette 07/10 : « 10 contacts » ici, « 0 » là).
 */
export function callListPeople(
  candidates: readonly DiscoverCandidate[],
  known: ReadonlyMap<string, DiscoverCallListCompany>,
): DiscoverCallListCompany['contacts'] {
  const seen = new Set<string>()
  const people: DiscoverCallListCompany['contacts'] = []
  for (const candidate of candidates) {
    if (isExcludedByQualification(candidate)) continue
    for (const person of known.get(candidate.siren)?.contacts ?? []) {
      if (seen.has(person.id)) continue
      seen.add(person.id)
      people.push(person)
    }
  }
  return people
}

/** #2545.2 — les cinq filtres exprimables sur ce tableau : même vocabulaire
 *  que `DiscoverContactFilters` (`discover-contact-rows.ts`), sur la portion
 *  personne de la ligne jointe. */
export interface DiscoverCallListFilters {
  company: string
  title: string
  reachableOnly: boolean
  level: CoverageLevel | 'any'
  expertise: BuyerRoleFamilyKey | 'any'
}

export function emptyCallListFilters(): DiscoverCallListFilters {
  return { company: '', title: '', reachableOnly: false, level: 'any', expertise: 'any' }
}

/** Insensible à la casse, sous-chaîne — même règle que `includesLoose`
 *  (`discover-contact-rows.ts`) : vide = aucune contrainte. */
function includesLoose(haystack: string | null, needle: string): boolean {
  if (!needle.trim()) return true
  return (haystack ?? '').toLocaleLowerCase().includes(needle.trim().toLocaleLowerCase())
}

export function filterCallListRows(
  rows: readonly DiscoverCallListRow[],
  filters: DiscoverCallListFilters,
): DiscoverCallListRow[] {
  return rows.filter(row => {
    if (!includesLoose(row.company, filters.company)) return false
    if (!includesLoose(row.title, filters.title)) return false
    if (filters.reachableOnly && !row.email && !row.phone) return false
    if (filters.level !== 'any' && row.level !== filters.level) return false
    if (filters.expertise !== 'any' && row.expertise !== filters.expertise) return false
    return true
  })
}

/**
 * #2545.4 — LA CHUTE EXPLIQUÉE : détectés → vérifiés → pertinents → enrichis.
 *
 * `detected`/`verified` relisent `DiscoverCoverage`, déjà câblé à cet écran
 * (`CoverageNotice.tsx`) — measuré une fois, jamais recalculé. `coverage` à
 * `null` (backend antérieur) rend les deux étapes NON MESURÉES, jamais 0 :
 * un « 0 détecté » se lirait comme un fait de marché, alors que c'est un
 * défaut de version.
 *
 * `relevant`/`enriched` sont calculés ICI, sur ce que le tableau vient de
 * construire — aucune source neuve : `relevant` = entreprises qui ont
 * traversé le conseil de qualification (une ligne en porte au moins une),
 * `enriched` = celles qui portent EN PLUS une personne réellement identifiée.
 */
export interface DiscoverCallListFunnel {
  detected: number | null
  verified: number | null
  relevant: number
  enriched: number
}

export function callListFunnel(
  coverage: DiscoverCoverage | null,
  projection: DiscoverCallListProjection,
): DiscoverCallListFunnel {
  const relevantSirens = new Set(projection.rows.map(row => row.siren))
  const enrichedSirens = new Set(projection.rows.filter(row => row.contactId !== null).map(row => row.siren))
  return {
    detected: coverage?.candidatesFound ?? null,
    verified: coverage?.resolved ?? null,
    relevant: relevantSirens.size,
    enriched: enrichedSirens.size,
  }
}

/* ------------------------------------------------------------------ */
/*  #2545.3 — export CSV, même patron que `discover-export.ts` : les       */
/*  colonnes exactement affichées, `null`/non mesuré rendu VIDE (jamais 0), */
/*  jamais un champ de plus que ce que l'écran a montré.                   */
/* ------------------------------------------------------------------ */

export const DISCOVER_CALL_LIST_COLUMNS = [
  'company',
  'website',
  'reason',
  'signal',
  'fullName',
  'title',
  'location',
  'email',
  'phone',
  'confidence',
  'action',
] as const
type DiscoverCallListColumn = (typeof DISCOVER_CALL_LIST_COLUMNS)[number]

export type DiscoverCallListLabels = Record<DiscoverCallListColumn, string> & {
  /** Rendu de `portfolioState` — même vocabulaire que l'export compte
   *  (`DiscoverExportLabels.portfolioState`), jamais recopié différemment. */
  portfolioState: Record<DiscoverPortfolioState, string>
}

function locationOf(row: DiscoverCallListRow): string {
  if (row.city && row.department) return `${row.city} (${row.department})`
  return row.city ?? row.department ?? ''
}

function callListRow(row: DiscoverCallListRow, labels: DiscoverCallListLabels): string[] {
  return [
    row.company,
    row.website ?? '',
    row.reason ?? '',
    row.signal ? `${row.signal.label} — ${row.signal.date}` : '',
    row.fullName ?? '',
    row.title ?? '',
    locationOf(row),
    row.email ?? '',
    row.phone ?? '',
    row.confidence === null ? '' : String(row.confidence),
    labels.portfolioState[row.portfolioState],
  ]
}

/** Liste rendue → CSV, dans l'ordre exact où elle est affichée. */
export function discoverCallListCsv(rows: readonly DiscoverCallListRow[], labels: DiscoverCallListLabels): string {
  const headers = DISCOVER_CALL_LIST_COLUMNS.map(column => labels[column])
  return toCsv([headers, ...rows.map(row => callListRow(row, labels))])
}

/** `liste-appels-2026-09-18.csv` — daté, comme l'export compte. */
export function callListExportFilename(prefix: string, nowMs: number = Date.now()): string {
  return `${prefix}-${new Date(nowMs).toISOString().slice(0, 10)}.csv`
}
