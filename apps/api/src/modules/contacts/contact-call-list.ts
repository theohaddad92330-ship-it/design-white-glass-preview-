import {
  isSignalArchived,
  DISCOVER_CALL_LIST_CONTACTS_PER_COMPANY,
  normalizeCompanyNameKey,
  signalKindSchema,
  type DiscoverCallListContact,
  type DiscoverCallListRequest,
  type DiscoverCallListSignal,
} from '@bellum/contracts'
import type { ContactEntity } from '../../database/entities/contact.entity'
import { filterEligibleContacts, type EligibilityRow } from './contact-eligibility'
import { sortByUsableIdentity } from './contact-identity'
import { rankAccountContacts, type RankableContactRow } from './contact-ranking'
import type { PreparedTargetPersonas } from './target-persona-match'
import { sellerFocusTiers, type SellerFocus } from './contact-seller-focus'

/* ------------------------------------------------------------------ */
/*  #2545 / #2546 / #3819 — LA LISTE D'APPELS DE DÉCOUVRIR, côté serveur. */
/*                                                                     */
/*  Noyau PUR (aucune I/O) : `ContactCallListService` lit les lignes,     */
/*  ce fichier rapproche, classe et projette. Le classement est CELUI du */
/*  chemin recommandé du compte (`rankAccountContacts`, précédé de la    */
/*  même porte d'éligibilité) — jamais un second tri qui dirait autre    */
/*  chose que la fiche compte sur les mêmes personnes.                   */
/* ------------------------------------------------------------------ */

/** Les colonnes lues — jamais `raw_data` (plusieurs Ko par ligne, mesuré LOT 4). */
export const CALL_LIST_CONTACT_COLUMNS: (keyof ContactEntity)[] = [
  'id',
  'account_id',
  'full_name',
  'title',
  'entity',
  'decision_role',
  'email',
  'email_verified',
  'phone',
  'linkedin_url',
  'source',
  'user_status',
  'email_sent_at',
  'last_enrichment_at',
  'priority',
  'demo_seed_first_door',
  'hidden',
  'excluded_at',
  'lifecycle_state',
  'recommendation_authorized_reason',
  'why_contact',
  'location',
]

type CallListAccountRow = { id: string; siren: string | null; company_name: string }

/**
 * Candidat Découvrir → compte de l'espace. Ordre : identifiant (seulement s'il
 * figure parmi les comptes LUS dans l'espace — jamais un id venu du client
 * accepté tel quel), SIREN, puis nom normalisé. Un candidat sans
 * correspondance n'a PAS de clé dans le résultat.
 */
export function matchCallListAccounts(
  companies: DiscoverCallListRequest['companies'],
  accounts: readonly CallListAccountRow[],
): Map<string, string> {
  const byId = new Set(accounts.map(a => a.id))
  const bySiren = new Map<string, string>()
  const byName = new Map<string, string>()
  for (const account of accounts) {
    const siren = account.siren?.replace(/\s+/g, '')
    if (siren && !bySiren.has(siren)) bySiren.set(siren, account.id)
    const nameKey = normalizeCompanyNameKey(account.company_name ?? '')
    if (nameKey && !byName.has(nameKey)) byName.set(nameKey, account.id)
  }
  const matched = new Map<string, string>()
  for (const company of companies) {
    if (company.accountId && byId.has(company.accountId)) {
      matched.set(company.key, company.accountId)
      continue
    }
    const siren = company.siren?.replace(/\s+/g, '')
    const viaSiren = siren ? bySiren.get(siren) : undefined
    if (viaSiren) {
      matched.set(company.key, viaSiren)
      continue
    }
    const nameKey = company.name ? normalizeCompanyNameKey(company.name) : ''
    const viaName = nameKey ? byName.get(nameKey) : undefined
    if (viaName) matched.set(company.key, viaName)
  }
  return matched
}

export type CallListContactSourceRow = RankableContactRow &
  EligibilityRow & {
    account_id: string | null
    why_contact: string | null
    location: string | null
    user_status: DiscoverCallListContact['user_status']
    last_enrichment_at: Date | string | null
  }

function isoOrNull(value: Date | string | null): string | null {
  if (value === null || value === undefined) return null
  return value instanceof Date ? value.toISOString() : String(value)
}

function project(row: CallListContactSourceRow, companyName: string | null): DiscoverCallListContact {
  return {
    id: row.id,
    account_id: row.account_id,
    full_name: row.full_name,
    title: row.title,
    entity: row.entity,
    decision_role: row.decision_role as DiscoverCallListContact['decision_role'],
    email: row.email,
    email_verified: row.email_verified,
    phone: row.phone,
    why_contact: row.why_contact,
    user_status: row.user_status,
    source: row.source,
    company_name: companyName,
    last_enrichment_at: isoOrNull(row.last_enrichment_at),
    location: row.location,
  }
}

/**
 * Les dix personnes à appeler d'UN compte : porte d'éligibilité, puis le noyau
 * du chemin recommandé (sans `raw_analysis` : la liste d'appels ne choisit ni
 * périmètre ni sujet — les axes qui en dépendent restent simplement neutres).
 * `total` = contacts ÉLIGIBLES, pour que l'écran dise « 10 sur 160 ».
 */
export function buildCallListContacts(
  rows: readonly CallListContactSourceRow[],
  flaggedIncorrectContactIds: ReadonlySet<string>,
  targetPersonas?: PreparedTargetPersonas,
  companyName: string | null = null,
  /** LUDOVIC-C LC.4 — pack + zones du profil : les fonctions du pack et la zone d'abord. */
  sellerFocus: SellerFocus | null = null,
  /** Lot 758 — les mots de l'offre DÉCLARÉE de l'ESN (`profileOfferTokens`) : l'axe `offer`. */
  profileOfferTokens: ReadonlySet<string> = new Set<string>(),
): { total: number; contacts: DiscoverCallListContact[] } {
  if (rows.length === 0) return { total: 0, contacts: [] }
  const { eligible } = filterEligibleContacts(rows, null, flaggedIncorrectContactIds)
  const ranking = rankAccountContacts(
    eligible,
    null,
    { profileOfferTokens },
    DISCOVER_CALL_LIST_CONTACTS_PER_COMPANY,
    targetPersonas,
    undefined,
    sellerFocusTiers(eligible, sellerFocus),
  )
  const byId = new Map(eligible.map(r => [r.id, r]))
  // Recette 21/10 D.4 — tri stable : à rang égal d'usage, un nom complet (ou une adresse pro) passe avant un prénom
  // seul. Rien n'est retiré ; le prénom seul reste une piste, plus bas (même règle que la fiche compte).
  const contacts = sortByUsableIdentity(
    ranking.ranked.map(item => byId.get(item.contact_id)).filter((r): r is CallListContactSourceRow => r !== undefined),
  ).map(r => project(r, companyName))
  return { total: eligible.length, contacts }
}

const MONTHS: Record<string, string> = {
  janvier: '01',
  fevrier: '02',
  mars: '03',
  avril: '04',
  mai: '05',
  juin: '06',
  juillet: '07',
  aout: '08',
  septembre: '09',
  octobre: '10',
  novembre: '11',
  decembre: '12',
  january: '01',
  february: '02',
  march: '03',
  april: '04',
  may: '05',
  june: '06',
  july: '07',
  august: '08',
  september: '09',
  october: '10',
  november: '11',
  december: '12',
}

/** La date DU signal, si elle se LIT (ISO jour/mois, ou « juillet 2026 »). */
function readableSignalDate(raw: string | null): string | null {
  const text = (raw ?? '').trim()
  if (!text) return null
  const iso = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(text)
  if (iso) return iso[3] ? `${iso[1]}-${iso[2]}-${iso[3]}` : `${iso[1]}-${iso[2]}`
  const folded = text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const monthYear = /\b([a-z]+)\s+(\d{4})\b/.exec(folded)
  if (monthYear) {
    const month = MONTHS[monthYear[1]]
    if (month) return `${monthYear[2]}-${month}`
  }
  return null
}

type SignalHistorySourceRow = {
  label: string
  signal_type: string | null
  source: string | null
  signal_date: string | null
  first_detected_at: Date | string
  first_detection_exact: boolean
  /** #3928.3 — la fraîcheur posée par l'analyse (`signal_history.freshness`). */
  freshness?: string | null
}

/** `signal_history` → signal de la liste d'appels, ou `null` s'il n'est pas daté. */
export function toCallListSignal(row: SignalHistorySourceRow, url?: string | null): DiscoverCallListSignal | null {
  const label = (row.label ?? '').trim()
  if (!label) return null
  const kind = signalKindSchema.safeParse(row.signal_type)
  const eventDate = readableSignalDate(row.signal_date)
  const source = (row.source ?? '').trim() || null
  // #3928.3 — la MÊME règle d'archive que la fiche et Laura (`isSignalArchived`) :
  // Société Générale montrait dans Découvrir des signaux (droits de vote, rugby)
  // que la fiche et Laura écartaient, faute de ce filtre sur l'historique.
  if (isSignalArchived({ freshness: row.freshness, date: eventDate }, Date.now())) return null
  // #4045.1 — le lien n'existe que s'il est connu ; la clé est absente sinon.
  const link = url ? { url } : {}
  if (eventDate)
    return { kind: kind.success ? kind.data : null, label, date: eventDate, dateIsDetection: false, source, ...link }
  if (!row.first_detection_exact) return null
  const detected = isoOrNull(row.first_detected_at)?.slice(0, 10)
  if (!detected) return null
  return { kind: kind.success ? kind.data : null, label, date: detected, dateIsDetection: true, source, ...link }
}
