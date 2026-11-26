import {
  groupSignalReformulations,
  isNeedLineType,
  parseSignalDate,
  signalSortMs,
  type AccountSignalLine,
  type HistoryContact,
  type WorkspaceSignalHistory,
} from '@bellum/contracts'
import {
  isRecruitmentItem,
  itemNeedKind,
  recruitmentFirst,
  type WatchlistItem,
} from '@/features/watchlist/model/watchlist'
import { placeOfTitle } from '@/lib/zones/place-region'
import { i18n } from '@/i18n'
import { lineSourceLabel } from '@/features/accounts/view/account-detail/tabs/opportunities/SignalLineBody'

/** #4755 — ce qui est PASSÉ : le signal n'est plus le fait actuel (archive, ancien, remplacé). */
const PAST_STATUSES: ReadonlySet<string> = new Set(['HISTORICAL', 'STALE', 'SUPERSEDED'])

/** Lot 773 — un besoin à l'écran : sa ligne de tête (la mieux rangée) et toutes ses formulations (≥ 1). */
export type NeedGroup = { head: WatchlistItem; members: WatchlistItem[] }

/**
 * Lot 773 — REGROUPEMENT D'AFFICHAGE : la règle vit à côté du dédoublonnage (`groupSignalReformulations`, contrats) ;
 * ici on l'applique aux éléments de l'Historique en gardant leur ordre. Un élément sans ligne API reste seul.
 */
export function groupNeedItems(items: readonly WatchlistItem[]): NeedGroup[] {
  const byLine = new Map<string, WatchlistItem>()
  const lines = items.flatMap(item => {
    if (!item.signalLine) return []
    byLine.set(item.signalLine.id, item)
    return [item.signalLine]
  })
  const grouped = new Map(
    groupSignalReformulations(lines, { companyName: items[0]?.companyName }).map(
      group => [group.line.id, group.members] as const,
    ),
  )
  const inGroup = new Set([...grouped.values()].flat().map(member => member.id))
  const out: NeedGroup[] = []
  for (const item of items) {
    const id = item.signalLine?.id
    if (!id) out.push({ head: item, members: [item] })
    else if (grouped.has(id))
      out.push({ head: item, members: grouped.get(id)!.flatMap(member => byLine.get(member.id) ?? []) })
    else if (!inGroup.has(id)) out.push({ head: item, members: [item] })
  }
  return out
}

export type AccountHistoryRow = {
  accountId: string
  companyName: string
  /** Les offres passées du compte. 0 = aucune : la ligne ne l'écrit pas (jamais « 0 offre »). */
  offerCount: number
  /** Tous les BESOINS passés (offres comprises, faits exclus) : de quoi dire quelque chose d'un compte sans offre.
   *  Lot 773 — compté en LIGNES regroupées : trois phrases du même fait = 1. */
  needCount: number
  /** Lot 773 — les besoins tels que l'écran les range : une reformulation = un groupe `×N`, dans l'ordre de `items`. */
  groups: NeedGroup[]
  /** Lot 767 — les faits passés (annonces légales, équipe, descriptions) : visibles, jamais comptés comme besoins. */
  factCount: number
  /** Les compétences lues dans les offres rattachées, les plus fréquentes d'abord. Jamais devinées. */
  skills: string[]
  /** Le dernier besoin vu ; `null` quand aucune date n'est lisible — la ligne ne l'écrit pas. */
  lastNeedMs: number | null
  /** Les besoins passés du compte, du plus récent au plus ancien — le contenu du dépli. */
  items: WatchlistItem[]
  /** Lot 767 — « Autres faits (N) » : sous les besoins, dans un groupe replié. */
  facts: WatchlistItem[]
}

/**
 * Lot 764 — `GET /accounts/signal-history` (la MÊME lecture que l'onglet « Signaux et besoins » de chaque compte,
 * toutes familles) → les besoins passés que cette page sait ranger, filtrer et compter. Rien n'est recalculé ici :
 * la période, la fusion et le tri des familles sont déjà faits par l'API (GA-26).
 *
 * La date garde la précision que la source porte (un mois reste « 2024-05 »). Le lien de la ligne est la seule
 * « source » : il pointe l'outil que l'espace a branché ou la page publique du fait — une ligne sans lien ne
 * nomme rien (doctrine : on ne nomme jamais nos fournisseurs).
 */
/** Ce que l'adaptateur sait du compte d'une ligne : l'identité et le lieu, rien d'autre. */
export type SignalLineAccount = {
  id: string
  companyName: string
  sector?: string | null
  logoUrl?: string | null
  website?: string | null
  headquarters?: string | null
  address?: string | null
}

/**
 * #5191 — ADAPTATEUR PUR : une ligne du lecteur unique des signaux d'un compte → l'élément que `WatchlistSignalDetail`
 * sait rendre. UN seul adaptateur (GA-26) pour l'Historique de Signaux et la modale d'un besoin (onglet Veille, /signals).
 * Rien n'est inventé : une absence reste `null`, jamais « 0 ».
 */
export function signalLineToWatchlistItem(line: AccountSignalLine, account: SignalLineAccount): WatchlistItem {
  return {
    accountId: account.id,
    companyName: account.companyName,
    id: `${account.id}:${line.id}`,
    sector: account.sector ?? '',
    signalDate:
      line.date_precision === 'day'
        ? line.date
        : line.date_precision === 'month'
          ? line.date.slice(0, 7)
          : line.date.slice(0, 4),
    signalLabel: line.title,
    // La source en mot générique, avec le site d'emploi public quand il est connu (décision 02/11) — jamais un fournisseur.
    signalSource: lineSourceLabel(i18n.getFixedT(null, 'projects'), line),
    sourceUrl: line.url,
    sourceKind: null,
    offerAttachment:
      (line.technologies?.length ?? 0) > 0
        ? { status: 'attached', fact_type: null, skills: line.technologies!, job_family: null, extract: line.detail }
        : null,
    // Lot 769 — le lieu de la ligne ; lot 772 — sinon le lieu que son intitulé dit (« … à Villeurbanne/Lyon »), sinon le
    // siège ou l'adresse du compte : une absence reste une absence (jamais devinée).
    location: line.people_hints.location ?? placeOfTitle(line.title) ?? account.headquarters ?? account.address ?? null,
    accountLocation: [account.headquarters, account.address].filter(Boolean).join(', ') || null,
    signalType: line.type,
    signalLineType: line.type,
    signalLine: line,
    score: null,
    status: 'new',
    archived: line.period === 'past',
    firstDetectedAt: null,
    firstDetectionExact: false,
    lastSeenAt: null,
    changeCount: 0,
    resolved: false,
    resolvedAt: null,
    importance: null,
    triggeredActionLabel: null,
    lastVerifiedAt: null,
    temporalStatus: line.period === 'past' ? 'HISTORICAL' : null,
    salesImplication: line.detail,
    impact: null,
    logoUrl: account.logoUrl ?? null,
    website: account.website ?? null,
  }
}

export function historyItemsOf(history: WorkspaceSignalHistory): WatchlistItem[] {
  return history.accounts.flatMap(account =>
    account.lines.map((line): WatchlistItem => ({
      ...signalLineToWatchlistItem(line, {
        id: account.account_id,
        companyName: account.company_name,
        sector: account.sector,
        logoUrl: account.logo_url,
        website: account.website,
        headquarters: account.headquarters,
        address: account.address,
      }),
      // L'Historique ne range que du PASSÉ, quelle que soit la période de la ligne.
      archived: true,
      temporalStatus: 'HISTORICAL',
    })),
  )
}

/**
 * Lot 768 — les personnes proposables de chaque compte de l'Historique, lues AVEC l'historique (une requête pour
 * tous les comptes). Un compte sans contact connu n'a pas d'entrée : l'écran propose alors « Trouver qui contacter ».
 */
export function historyContactsOf(history: WorkspaceSignalHistory): Map<string, HistoryContact[]> {
  return new Map(
    history.accounts
      .filter(account => (account.contacts?.length ?? 0) > 0)
      .map(account => [account.account_id, account.contacts!] as const),
  )
}

/** Un besoin passé : du lecteur unique (déjà trié par l'API), ou un signal de la Veille qui dit un besoin. */
const isPastNeed = (item: WatchlistItem): boolean =>
  Boolean(item.temporalStatus && PAST_STATUSES.has(item.temporalStatus)) &&
  (item.signalLineType !== undefined || itemNeedKind(item) !== null)

/** Une offre d'emploi passée : le type de ligne quand l'API l'a posé, sinon la classification de la Veille. */
const isFact = (item: WatchlistItem): boolean =>
  item.signalLineType !== undefined &&
  !isNeedLineType(item.signalLineType) &&
  // Lot 775 — une mission observée sur le marché n'est pas un fait replié : elle est une ligne de la liste.
  item.signalLineType !== 'mission_observee'

const isOffer = isRecruitmentItem

const dateMsOf = (item: WatchlistItem, nowMs: number): number | null =>
  signalSortMs(parseSignalDate(item.signalDate), nowMs)

/** La date la plus récente d'une liste (rangée ou non) ; `null` quand aucune ne se lit. */
const newestMs = (entries: readonly { ms: number | null }[]): number | null =>
  entries.reduce<number | null>(
    (best, entry) => (entry.ms !== null && (best === null || entry.ms > best) ? entry.ms : best),
    null,
  )

/** Le plus récent d'abord ; une date illisible passe après toutes les autres. */
const byRecency = (a: number | null, b: number | null): number => {
  if (a === b) return 0
  if (a === null) return 1
  if (b === null) return -1
  return b - a
}

/**
 * #4755 — L'ONGLET « HISTORIQUE » : ce que MES comptes ont montré par le passé, UNE ligne par compte.
 *
 * Le flux d'entrée est l'Historique de l'espace (`GET /accounts/signal-history`, lot 764, via {@link historyItemsOf}) :
 * il ne contient que les comptes de l'espace — suivis, analysés ou importés du CRM. L'onglet ne ratisse donc pas le marché (c'est le métier de
 * Découvrir). Un compte sans besoin passé ne fait AUCUNE ligne (« on n'affiche pas ce qu'on n'a pas »).
 */
/** Lot 790 — la clé d'un compte à l'Historique : le nom sans casse, sans accents, sans espaces en trop. La réponse de
 *  l'API ne porte pas de SIREN : sans lui, deux comptes au même nom normalisé sont la même entreprise. */
const accountKeyOf = (name: string): string =>
  name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

/** Le plus fréquent d'une liste (à égalité : le premier rencontré). */
const mostFrequent = (values: readonly string[]): string => {
  const counts = new Map<string, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  return [...counts.entries()].reduce((best, entry) => (entry[1] > best[1] ? entry : best))[0]
}

export function buildAccountHistory(items: readonly WatchlistItem[], nowMs: number = Date.now()): AccountHistoryRow[] {
  const byAccount = new Map<string, WatchlistItem[]>()
  for (const item of items) {
    if (!isPastNeed(item)) continue
    const key = accountKeyOf(item.companyName) || item.accountId
    byAccount.set(key, [...(byAccount.get(key) ?? []), item])
  }

  const rows = [...byAccount.values()].map((accountItems): AccountHistoryRow => {
    const sortedByRecency = (list: WatchlistItem[]) =>
      list.map(item => ({ item, ms: dateMsOf(item, nowMs) })).sort((a, b) => byRecency(a.ms, b.ms))
    const needItems = accountItems.filter(item => !isFact(item))
    // #5191 — ORDRE par défaut : les recrutements en tête, le reste dans l'ordre de date (jamais un filtre).
    const dated = recruitmentFirst(sortedByRecency(needItems), entry => isOffer(entry.item))
    const groups = groupNeedItems(dated.map(entry => entry.item))
    const datedFacts = sortedByRecency(accountItems.filter(isFact))
    const offers = needItems.filter(isOffer)
    const skillCounts = new Map<string, number>()
    for (const offer of offers) {
      if (offer.offerAttachment?.status !== 'attached') continue
      for (const skill of new Set(offer.offerAttachment.skills)) {
        skillCounts.set(skill, (skillCounts.get(skill) ?? 0) + 1)
      }
    }
    // Lot 790 — les besoins se cumulent sous le libellé le plus fréquent ; le lien va au compte qui en porte le plus.
    const companyName = mostFrequent(accountItems.map(item => item.companyName))
    const accountId = mostFrequent(
      accountItems.filter(item => item.companyName === companyName).map(item => item.accountId),
    )
    return {
      accountId,
      companyName,
      offerCount: offers.length,
      needCount: groups.length,
      groups,
      factCount: datedFacts.length,
      skills: [...skillCounts.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([skill]) => skill),
      lastNeedMs: newestMs(dated.length > 0 ? dated : datedFacts),
      items: dated.map(entry => entry.item),
      facts: datedFacts.map(entry => entry.item),
    }
  })

  // #5191 — les comptes qui ont des offres d'abord (ordre, pas filtre), puis la date, puis le nom.
  return rows.sort(
    (a, b) =>
      Number(b.offerCount > 0) - Number(a.offerCount > 0) ||
      byRecency(a.lastNeedMs, b.lastNeedMs) ||
      a.companyName.localeCompare(b.companyName),
  )
}

/**
 * #5191 — le sens inverse : un élément du flux de la Veille (sans ligne du lecteur unique) lu comme une ligne, pour que
 * « À contacter » applique la MÊME règle (`proposalForLine`) partout. Rien n'est inventé : le lieu, les compétences et le
 * type viennent de l'élément ; une date illisible reste à l'année 1970 mais ne s'affiche jamais (le détail porte la sienne).
 */
export function watchlistItemToSignalLine(item: WatchlistItem): AccountSignalLine {
  if (item.signalLine) return item.signalLine
  const day = /^(\d{4})-(\d{2})-(\d{2})/.exec(item.signalDate)
  const skills = item.offerAttachment?.status === 'attached' ? item.offerAttachment.skills : []
  return {
    id: item.id,
    date: day ? day[0] : '1970-01-01',
    date_precision: day ? 'day' : 'year',
    period: item.archived ? 'past' : 'now',
    type: isRecruitmentItem(item) ? 'recrutement' : (item.signalLineType ?? 'projet'),
    title: item.displayLabel ?? item.signalLabel,
    detail: item.salesImplication,
    url: item.sourceUrl ?? null,
    ...(skills.length > 0 ? { technologies: skills } : {}),
    people_hints: { names: [], roles: [], location: item.location ?? null },
  }
}
