import type { AccountSignalLine, AnalysisScopeSelection, SignalLinePeriod, SignalLineType } from '@bellum/contracts'
import { SIGNAL_LINE_TYPES, groupSignalReformulations } from '@bellum/contracts'
import type { LineNature } from '@/features/accounts/model/lineNature'
import { normalizeEventText } from '@/features/accounts/model/watchEvents'
import type { MissionContact } from './account-missions'
import { proposeContactsForSignal, type ContactReason, type ProposableContact } from './signal-contacts'

/**
 * #4755 / #4756 (lot 761) — le MODÈLE du tableau « Signaux et besoins » : ce que l'écran calcule sur les lignes
 * déjà lues (`GET /accounts/:id/signal-lines`). Pur, aucune lecture. Les deux périodes ont la MÊME présentation :
 * mêmes filtres par type avec compteurs, même recherche texte (décision 1 du lot).
 */

/** Lignes montrées à l'ouverture, puis « voir plus » du même pas — jamais une coupe silencieuse (décision 3). */
export const SIGNAL_TABLE_PAGE = 20

export type SignalTableFilter = { type: SignalLineType | null; query: string }

function fold(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

export function linesOfPeriod(lines: readonly AccountSignalLine[], period: SignalLinePeriod): AccountSignalLine[] {
  return lines.filter(line => line.period === period)
}

/** Le compte par type, pour les puces. Un type absent n'a PAS de clé (aucune puce « 0 », GA-18 / GA-19). */
export function countsByType(lines: readonly AccountSignalLine[]): Map<SignalLineType, number> {
  const counts = new Map<SignalLineType, number>()
  for (const type of SIGNAL_LINE_TYPES) {
    const count = lines.filter(line => line.type === type).length
    if (count > 0) counts.set(type, count)
  }
  return counts
}

/** Le texte où la recherche lit : intitulé, détail, technologies, lignes regroupées. */
function searchable(line: AccountSignalLine): string {
  return fold(
    [line.title, line.detail ?? '', ...(line.technologies ?? []), ...(line.merged ?? []).map(row => row.title)].join(
      ' ',
    ),
  )
}

export function filterLines(lines: readonly AccountSignalLine[], filter: SignalTableFilter): AccountSignalLine[] {
  const words = fold(filter.query).split(/\s+/).filter(Boolean)
  return lines.filter(line => {
    if (filter.type && line.type !== filter.type) return false
    if (words.length === 0) return true
    const text = searchable(line)
    return words.every(word => text.includes(word))
  })
}

/** Ce qu'on passe à la sélection des contacts pour UNE ligne : l'intitulé ET les noms qu'elle cite. */
export function contactSignalOf(line: AccountSignalLine): {
  text: string
  role: string | null
  location: string | null
  posting: boolean
} {
  return {
    text: [line.title, ...line.people_hints.names].join(' — '),
    role: line.people_hints.roles[0] ?? null,
    location: line.people_hints.location,
    posting: line.type === 'recrutement',
  }
}

/** « Qui revient le plus » : les personnes proposées sur le plus de lignes, trois au plus, jamais à zéro ligne. */
export function mostRecurringPeople(
  proposals: ReadonlyMap<string, readonly ProposableContact[]>,
  limit = 3,
): Array<{ contact: ProposableContact; lines: number }> {
  const tally = new Map<string, { contact: ProposableContact; lines: number }>()
  for (const contacts of proposals.values()) {
    for (const contact of contacts) {
      const entry = tally.get(contact.id) ?? { contact, lines: 0 }
      entry.lines += 1
      tally.set(contact.id, entry)
    }
  }
  return [...tally.values()]
    .sort(
      (left, right) =>
        right.lines - left.lines || (left.contact.full_name ?? '').localeCompare(right.contact.full_name ?? ''),
    )
    .slice(0, limit)
}

/** Les TJM observés : bornes min–max. `null` = aucun TJM connu (rien à afficher, jamais « 0 € »). */
export function observedTjmRange(
  lines: readonly AccountSignalLine[],
  extra: readonly number[] = [],
): { min: number; max: number } | null {
  const values = [...lines.map(line => line.tjm_eur), ...extra].filter(
    (value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0,
  )
  if (values.length === 0) return null
  return { min: Math.min(...values), max: Math.max(...values) }
}

/** Les issues des besoins passés. Une issue absente n'est comptée nulle part. */
export function outcomeCounts(lines: readonly AccountSignalLine[]): { won: number; lost: number; none: number } {
  return {
    won: lines.filter(line => line.outcome === 'won').length,
    lost: lines.filter(line => line.outcome === 'lost').length,
    none: lines.filter(line => line.outcome === 'none').length,
  }
}

/** Le thème récurrent : la technologie citée par au moins DEUX lignes, la plus fréquente. `null` sinon. */
export function recurringTheme(lines: readonly AccountSignalLine[]): { label: string; lines: number } | null {
  const tally = new Map<string, { label: string; lines: number }>()
  for (const line of lines) {
    for (const tech of new Set((line.technologies ?? []).map(value => value.trim()).filter(Boolean))) {
      const key = fold(tech)
      const entry = tally.get(key) ?? { label: tech, lines: 0 }
      entry.lines += 1
      tally.set(key, entry)
    }
  }
  const best = [...tally.values()].sort((left, right) => right.lines - left.lines)[0]
  return best && best.lines >= 2 ? best : null
}

/**
 * La phrase de Laura : une SYNTHÈSE des lignes déjà là (aucun appel modèle neuf). `null` = rien à synthétiser,
 * la bande ne s'affiche pas. Le type dominant n'est nommé que s'il porte au moins deux lignes.
 */
export function lauraSynthesis(
  lines: readonly AccountSignalLine[],
  period: SignalLinePeriod,
): { total: number; topType: SignalLineType | null; topCount: number; leads: number } | null {
  if (lines.length === 0) return null
  const [top] = [...countsByType(lines).entries()].sort((left, right) => right[1] - left[1])
  const leads = period === 'now' ? lines.filter(line => line.lead_id).length : 0
  return {
    total: lines.length,
    topType: top && top[1] >= 2 ? top[0] : null,
    topCount: top && top[1] >= 2 ? top[1] : 0,
    leads,
  }
}

/** « Établissement fermé » (Sirene) / « Fermeture d'établissement » (RNE) : une annonce légale, sans contact à proposer. */
function isClosedEstablishment(line: AccountSignalLine): boolean {
  return line.type === 'annonce_legale' && /^(etablissement ferme|fermeture d'etablissement)/.test(fold(line.title))
}

/** « Comptes annuels et rapports » (lot 766) : un dépôt de comptes, sans phrase de besoin. */
function isAccountsFiling(line: AccountSignalLine): boolean {
  return (
    line.type === 'annonce_legale' && !line.lead_id && /^(comptes annuels|depot des comptes)/.test(fold(line.title))
  )
}

export type SignalGroupKind = 'closed' | 'accounts'

export type SignalTableRow = {
  line: AccountSignalLine
  /** Présent = ligne de GROUPE : tous les membres, le plus récent d'abord. Rien n'est supprimé (on archive). */
  closed?: { kind: SignalGroupKind; members: AccountSignalLine[] }
  /** Lot 773 — présent = UN fait lu dans N formulations (≥ 2), la plus récente en `line`. Affichage seulement. */
  reformulations?: AccountSignalLine[]
}

const GROUPS: ReadonlyArray<{ kind: SignalGroupKind; test: (line: AccountSignalLine) => boolean }> = [
  { kind: 'closed', test: isClosedEstablishment },
  { kind: 'accounts', test: isAccountsFiling },
]

/**
 * #5031 (lot 763, recette Viveris : 4 lignes « Établissement fermé » sur 12) puis lot 766 (« Comptes annuels et
 * rapports ») — plusieurs annonces de même famille forment UNE ligne repliable « N établissements fermés » /
 * « N dépôts de comptes », datée de la plus récente et placée où se trouvait la première. Une annonce seule reste
 * une ligne ordinaire. Se calcule APRÈS filtre et recherche : le décompte ne ment pas.
 */
export function groupClosedEstablishments(lines: readonly AccountSignalLine[]): SignalTableRow[] {
  const groups = GROUPS.map(group => ({
    ...group,
    members: lines.filter(group.test).sort((left, right) => right.date.localeCompare(left.date)),
  })).filter(group => group.members.length >= 2)
  if (groups.length === 0) return lines.map(line => ({ line }))
  const placed = new Set<SignalGroupKind>()
  const rows: SignalTableRow[] = []
  for (const line of lines) {
    const group = groups.find(candidate => candidate.test(line))
    if (!group) rows.push({ line })
    else if (!placed.has(group.kind)) {
      placed.add(group.kind)
      const [latest] = group.members
      rows.push({
        line: { ...latest!, id: `${group.kind}-group:${latest!.id}`, url: null },
        closed: { kind: group.kind, members: group.members },
      })
    }
  }
  return rows
}

/**
 * Lot 773 — les lignes du tableau : établissements fermés / dépôts de comptes d'abord (#5031), puis les reformulations
 * d'un même fait repliées en UNE ligne « ×N sources » (règle unique : `groupSignalReformulations`, contrats). Le décompte
 * se lit sur le résultat : une ligne regroupée compte pour un.
 */
export function groupTableRows(lines: readonly AccountSignalLine[], companyName?: string | null): SignalTableRow[] {
  const closedRows = groupClosedEstablishments(lines)
  const loose = closedRows.filter(row => !row.closed).map(row => row.line)
  const groups = new Map(
    groupSignalReformulations(loose, { companyName }).map(group => [group.line.id, group.members] as const),
  )
  const absorbed = new Set([...groups.values()].flatMap(members => members.slice(1).map(member => member.id)))
  return closedRows.flatMap(row => {
    if (row.closed) return [row]
    if (absorbed.has(row.line.id)) return []
    const members = groups.get(row.line.id)
    return [members && members.length > 1 ? { ...row, reformulations: members } : row]
  })
}

/**
 * Les contacts proposés pour UNE ligne et la raison de chacun : les personnes que la ligne NOMME (identifiants
 * portés par la collecte) d'abord, puis la sélection `proposeContactsForSignal` — deux au plus.
 */
export function proposalForLine(input: {
  line: AccountSignalLine
  /** Les contacts du compte : l'entité complète (l'onglet) ou le minimum (l'Historique global) — la règle est la même. */
  contacts: readonly MissionContact[]
  perimeter: AnalysisScopeSelection | undefined
  accountName?: string | null
}): { people: ProposableContact[]; reasons: Map<string, ContactReason> } {
  const { line, contacts, perimeter, accountName } = input
  const named = (line.contact_ids ?? [])
    .map(id => contacts.find(contact => contact.id === id))
    .filter((contact): contact is MissionContact => Boolean(contact))
  // Lot 768 — le prescripteur d'un besoin PASSÉ (mémoire marché / CRM), quand c'est un contact du compte : il passe
  // en tête, « a porté ce besoin ». Rapprochement par le nom entier, jamais par un mot.
  const prescriber = line.period === 'past' ? normalizeEventText(line.people_hints.names[0] ?? '') : ''
  const carriers = prescriber
    ? contacts.filter(
        contact =>
          normalizeEventText(contact.full_name ?? '') === prescriber && !named.some(known => known.id === contact.id),
      )
    : []
  const proposal = proposeContactsForSignal({ contacts, signal: contactSignalOf(line), perimeter, accountName })
  const head = [...named, ...carriers]
  const people = [...head, ...proposal.contacts.filter(contact => !head.some(known => known.id === contact.id))].slice(
    0,
    2,
  )
  const reasons = new Map<string, ContactReason>()
  for (const person of people) {
    const reason = named.some(known => known.id === person.id)
      ? { kind: 'named' as const }
      : carriers.some(known => known.id === person.id)
        ? { kind: 'carried' as const }
        : proposal.reasons?.[person.id]
    if (reason) reasons.set(person.id, reason)
  }
  return { people, reasons }
}

/**
 * Lot 773 (e) — « N besoins sur M entités du groupe » : seulement quand la base commune a rendu des besoins d'AUTRES
 * entités que le compte (sinon rien à dire). L'entité du compte lui-même compte pour une.
 */
export function groupEntitiesSummary(lines: readonly AccountSignalLine[]): { needs: number; entities: number } | null {
  const shared = lines.filter(line => line.origin_kind === 'memoire' && line.type === 'besoin_passe')
  if (!shared.some(line => line.entity)) return null
  return { needs: shared.length, entities: new Set(shared.map(line => line.entity ?? '')).size }
}

/**
 * #5004.1 — la NATURE d'une ligne, en français simple (mêmes libellés que la file de qualification) : une affaire
 * ouverte est une demande confirmée, un projet possible une piste à explorer, un fait actuel un signal récent, un
 * fait passé de l'historique. Une « vision » du site n'entre jamais dans le tableau (garde API, #5004.2).
 */
export function lineNatureOf(line: Pick<AccountSignalLine, 'period' | 'type'>, hasLead: boolean): LineNature {
  if (line.period === 'past') return 'history'
  if (line.type === 'affaire') return 'confirmedDemand'
  if (hasLead) return 'leadToExplore'
  return 'recentSignal'
}
