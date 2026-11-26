import {
  DISCOVER_NEED_RECENT_MONTHS,
  type DiscoverCommonBaseCandidate,
  type DiscoverNeedFilters,
  type DiscoverNeedNature,
  type DiscoverNeedPeriod,
  type DiscoverResponse,
} from '@bellum/contracts'

/**
 * #5203 (lot 782) — LES BESOINS PASSÉS DE L'ESPACE comme source de candidats de Découvrir, et les filtres
 * « période » / « nature » des besoins.
 *
 * Fonctions PURES : les lignes arrivent DÉJÀ cloisonnées (espace + business unit) du lecteur unique
 * `AccountSignalLinesService`. Ici on apparie seulement, sans borne d'âge (décision 31/10), et on ne sort JAMAIS
 * un champ de personne ni le nom d'une source : {siren, nom, ville, secteur, besoin {libellé, date, nature}}.
 */

/** La nature d'une ligne de signaux, quand elle en a une ; sinon `undefined` (jamais devinée). */
export function natureOfLine(type: string): DiscoverNeedNature | undefined {
  switch (type) {
    case 'recrutement':
      return 'recrutement'
    case 'besoin_passe':
    case 'mission_observee':
      return 'mission'
    case 'projet':
    case 'affaire':
      return 'projet'
    default:
      return undefined
  }
}

type PastLine = { type: string; title: string; date: string }
export type SpacePastNeedAccount = {
  siren: string | null
  company_name: string
  headquarters?: string | null
  sector?: string | null
  lines: ReadonlyArray<PastLine>
}

/** « récent » = moins de 6 mois avant `now` ; la date est AAAA-MM(-JJ). */
export function isRecentNeedDate(date: string, now: Date): boolean {
  const at = Date.parse(date.length === 7 ? `${date}-01T00:00:00Z` : `${date.slice(0, 10)}T00:00:00Z`)
  if (!Number.isFinite(at)) return false
  const limit = new Date(now)
  limit.setUTCMonth(limit.getUTCMonth() - DISCOVER_NEED_RECENT_MONTHS)
  return at >= limit.getTime()
}

function periodAllows(period: DiscoverNeedPeriod | undefined, date: string, now: Date): boolean {
  if (!period || period === 'all') return true
  return period === 'recent' ? isRecentNeedDate(date, now) : !isRecentNeedDate(date, now)
}

function natureAllows(natures: readonly DiscoverNeedNature[] | undefined, nature: DiscoverNeedNature | undefined) {
  if (!natures || natures.length === 0) return true
  return nature !== undefined && natures.includes(nature)
}

const VALID_DAY = /^\d{4}-\d{2}(-\d{2})?$/

export function spacePastNeedCandidates(args: {
  accounts: ReadonlyArray<SpacePastNeedAccount>
  terms: readonly string[]
  period?: DiscoverNeedPeriod
  natures?: readonly DiscoverNeedNature[]
  now: Date
  cap: number
}): DiscoverCommonBaseCandidate[] {
  const terms = args.terms.map(t => t.trim().toLowerCase()).filter(t => t.length >= 2)
  if (terms.length === 0 || args.cap <= 0) return []
  const out: Array<{ at: string; candidate: DiscoverCommonBaseCandidate }> = []
  const seen = new Set<string>()
  for (const account of args.accounts) {
    const siren = String(account.siren ?? '').replace(/\s/g, '')
    const name = String(account.company_name ?? '').trim()
    if (!/^\d{9}$/.test(siren) || !name || seen.has(siren)) continue
    let best: { title: string; date: string; nature?: DiscoverNeedNature } | null = null
    for (const line of account.lines) {
      const nature = natureOfLine(line.type)
      // Un type sans nature (fait, marché public, annonce légale…) n'est pas un besoin du compte.
      if (!nature || !VALID_DAY.test(line.date)) continue
      const title = String(line.title ?? '').trim()
      if (!title || !terms.some(term => title.toLowerCase().includes(term))) continue
      if (!periodAllows(args.period, line.date, args.now) || !natureAllows(args.natures, nature)) continue
      if (!best || line.date > best.date) best = { title, date: line.date, nature }
    }
    if (!best) continue
    seen.add(siren)
    out.push({
      at: best.date,
      candidate: {
        siren,
        name,
        city: account.headquarters ?? null,
        sector: account.sector ?? null,
        observedNeed: { label: best.title.slice(0, 160), date: best.date, nature: best.nature },
        fromSpace: true,
      },
    })
  }
  return out
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
    .slice(0, args.cap)
    .map(item => item.candidate)
}

type FilterableCandidate = {
  qualification?: { verdict?: string } | undefined
  observedNeed?: { label: string; date: string; nature?: string } | undefined
  signals?: ReadonlyArray<{ type: string; date: string }> | undefined
}

/** Les besoins qu'un candidat PORTE : son besoin observé et ses recrutements datés (récents). */
function needFactsOf(candidate: FilterableCandidate): Array<{ date: string; nature?: string }> {
  const facts: Array<{ date: string; nature?: string }> = []
  if (candidate.observedNeed && VALID_DAY.test(candidate.observedNeed.date)) {
    facts.push({ date: candidate.observedNeed.date, nature: candidate.observedNeed.nature })
  }
  for (const signal of candidate.signals ?? []) {
    if (signal.type === 'hiring' && VALID_DAY.test(signal.date.slice(0, 10))) {
      facts.push({ date: signal.date.slice(0, 10), nature: 'recrutement' })
    }
  }
  return facts
}

/**
 * Un filtre de besoins RETIRE : le candidat reste s'il porte AU MOINS un besoin daté dans la période et de la nature
 * demandée. Un candidat sans besoin daté ne passe pas un filtre actif (une absence ne se compte pas comme un oui).
 * Sans filtre actif (`all`/absent, aucune nature) : tout passe.
 */
export function candidateMatchesNeedFilters(
  candidate: FilterableCandidate,
  filters: DiscoverNeedFilters,
  now: Date,
): boolean {
  const periodActive = !!filters.needsPeriod && filters.needsPeriod !== 'all'
  const natureActive = (filters.needsNature?.length ?? 0) > 0
  if (!periodActive && !natureActive) return true
  return needFactsOf(candidate).some(
    fact =>
      periodAllows(filters.needsPeriod, fact.date, now) &&
      natureAllows(filters.needsNature, fact.nature as DiscoverNeedNature | undefined),
  )
}

/**
 * Lot 786 (#5203, recette FAIL) — « Anciens » RETIRE les cartes sans besoin ancien ; la réponse reste une réponse :
 * les dégradations restent, et `needsFilteredOut` DIT combien de cartes le filtre a retirées (absent si aucune) pour
 * que l'écran ne confonde jamais « le filtre a tout retiré » avec « rien n'a pu être vérifié ».
 */
export function withNeedFilters(response: DiscoverResponse, filters: DiscoverNeedFilters, now: Date): DiscoverResponse {
  if ((!filters.needsPeriod || filters.needsPeriod === 'all') && !filters.needsNature?.length) return response
  const before = response?.candidates ?? []
  const candidates = before.filter(candidate => candidateMatchesNeedFilters(candidate, filters, now))
  // Lot 788 (#5203) — le compte dit ce que l'ÉCRAN aurait montré : une carte au verdict « exclu » est masquée par
  // l'écran avec ou sans filtre (`isExcludedByQualification`), elle ne fait pas partie des cartes « retirées ».
  // Lot 790 (#5203) — « 25 retirées » pour 24 cartes affichées : l'écran montre UNE carte par société. Une société en
  // double compte une fois, et une société dont une autre ligne reste affichée n'a rien perdu.
  const keptSirens = new Set(candidates.map(candidate => candidate.siren).filter(Boolean))
  const removedSirens = new Set<string>()
  let removedWithoutSiren = 0
  for (const candidate of before) {
    if (candidateMatchesNeedFilters(candidate, filters, now)) continue
    if ((candidate as FilterableCandidate).qualification?.verdict === 'excluded') continue
    if (!candidate.siren) removedWithoutSiren += 1
    else if (!keptSirens.has(candidate.siren)) removedSirens.add(candidate.siren)
  }
  const removed = removedSirens.size + removedWithoutSiren
  return { ...response, candidates, ...(removed > 0 ? { needsFilteredOut: removed } : {}) }
}
