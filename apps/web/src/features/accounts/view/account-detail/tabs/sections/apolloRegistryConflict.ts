/**
 * Là où Apollo contredit le registre légal.
 *
 * Le dossier TF1 affichait, côte à côte et sans un mot : Apollo « fondée en
 * 1987 » contre une immatriculation Pappers au 17/09/1982, et Apollo « CA 2.6B »
 * contre 1,2 Md € de comptes déposés. Le commercial lisait deux vérités.
 *
 * On ne masque pas Apollo — sa firmographie reste utile — mais sur les faits
 * LÉGAUX le registre fait foi : il est déposé, daté et opposable, là où Apollo
 * agrège des sources publiques. On signale donc la divergence et on cite la
 * valeur du registre, plutôt que de laisser le lecteur trancher à l'aveugle.
 *
 * Rien n'est comparé quand une des deux valeurs manque : pas de conflit inventé.
 */

export type RegistryFacts = {
  /** Date d'immatriculation au registre (ISO ou « 1982-09-17 »). */
  creationDate?: string | null
  /** Comptes déposés, du plus récent au plus ancien. */
  financials?: Array<{ year?: number | null; revenue?: number | null }> | null
}

type ApolloFacts = {
  foundedYear?: number | null
  /** CA annuel numérique tel qu'Apollo le renvoie (en unités). */
  annualRevenue?: number | null
}

type FieldConflict = {
  /** Ce que le registre dit — la valeur à opposer, déjà lisible. */
  registryValue: string
}

type ApolloRegistryConflicts = {
  foundedYear?: FieldConflict
  annualRevenue?: FieldConflict
}

/** Année d'un « 1982-09-17 » / « 1982 ». `null` si illisible. */
function yearOf(date: string | null | undefined): number | null {
  const match = /^\s*(\d{4})/.exec(date ?? '')
  if (!match) return null
  const year = Number(match[1])
  // #5 — 1900 est la date inconnue d'un registre, pas une année de fondation : aucun conflit n'en naît.
  return Number.isFinite(year) && year > 1901 ? year : null
}

/** Le CA déposé le plus récent, ou `null`. */
function latestRevenue(financials: RegistryFacts['financials']): { year: number; revenue: number } | null {
  const rows = (financials ?? [])
    .filter(row => typeof row?.revenue === 'number' && typeof row?.year === 'number')
    .map(row => ({ year: row.year as number, revenue: row.revenue as number }))
    .sort((a, b) => b.year - a.year)
  return rows[0] ?? null
}

/** Deux chiffres d'affaires « disent la même chose » à 20 % près — les
 *  périmètres de consolidation diffèrent légitimement d'un agrégateur à l'autre,
 *  seule une divergence FRANCHE mérite d'alerter. */
const REVENUE_TOLERANCE = 0.2

function formatRevenue(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'EUR',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)
}

/**
 * #R25 (Servier) — le CA stocké sur la fiche est un texte libre : le registre le dépose en chiffre brut
 * (« 6068010000 »). Un nombre pur se lit en euros compacts (« 6,1 Md € ») ; tout autre texte (« 6,1 Md€ »,
 * saisi à la main) reste TEL QUEL — on ne réécrit pas ce que l'humain a écrit.
 */
export function displayRecordedRevenue(raw: string | null | undefined, locale: string): string | null {
  const text = (raw ?? '').trim()
  if (!/^\d[\d\s.]*$/.test(text)) return text || null
  const value = Number(text.replace(/\s/g, ''))
  return Number.isFinite(value) && value > 0 ? formatRevenue(value, locale) : text
}

export function apolloRegistryConflicts(
  apollo: ApolloFacts,
  registry: RegistryFacts,
  locale = 'fr-FR',
): ApolloRegistryConflicts {
  const conflicts: ApolloRegistryConflicts = {}

  const registryYear = yearOf(registry.creationDate)
  if (typeof apollo.foundedYear === 'number' && registryYear !== null && apollo.foundedYear !== registryYear) {
    conflicts.foundedYear = { registryValue: String(registryYear) }
  }

  const filed = latestRevenue(registry.financials)
  if (typeof apollo.annualRevenue === 'number' && apollo.annualRevenue > 0 && filed && filed.revenue > 0) {
    const ratio = Math.abs(apollo.annualRevenue - filed.revenue) / filed.revenue
    if (ratio > REVENUE_TOLERANCE) {
      conflicts.annualRevenue = { registryValue: `${formatRevenue(filed.revenue, locale)} (${filed.year})` }
    }
  }

  return conflicts
}
