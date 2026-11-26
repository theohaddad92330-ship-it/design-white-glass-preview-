/**
 * Opportunités de missions (MCP `find_opportunities`) — logique PURE.
 *
 * Un assistant branché sur Bellum demande « quelles entreprises montrent des
 * signaux d'achat maintenant ». Cette fonction ne SÉLECTIONNE rien d'inventé :
 * elle ne fait que classer des signaux déjà observés (portefeuille de l'espace,
 * mémoire marché) et rend, pour chaque entreprise, ce qui la fait remonter.
 *
 * Règles tenues ici (doctrine) :
 *  - une entreprise sans AUCUN signal ne fait aucune ligne ;
 *  - la mémoire marché compte en PRÉSENCE, jamais en volume (GA-257 : un
 *    nombre de parcours mesurerait la taille de l'entreprise, pas l'achat) ;
 *  - jamais l'`externalization_score` brut (non calibré, GA-257) ;
 *  - aucune identité de personne, aucune date de corpus ne sort ;
 *  - un nombre absent reste absent : pas de « 0 » inventé.
 */

type SignalStrength = 'forte' | 'moyenne' | 'faible'

interface OpportunitySignal {
  type: 'portfolio_signal' | 'plan_action' | 'market_external_recourse' | 'market_stack_match' | 'market_presence'
  libelle: string
  force: SignalStrength
}

export interface Opportunity {
  company_name: string
  account_id: string | null
  score: number
  signals: OpportunitySignal[]
  why: string
  next_step: string
}

export interface PortfolioCandidate {
  account_id: string
  company_name: string
  priority_score: number | null
  primary_signal: string | null
  signal_freshness: 'current' | 'historical' | 'undated' | 'none' | null
  next_action_label: string | null
}

export interface MarketCandidate {
  company_name: string
  /** Rattachement par clé résolue (domaine / décision humaine), jamais par nom seul. */
  account_id: string | null
  /** Présence d'un recours externe observé (société de services) — un booléen, pas un volume. */
  external_recourse: boolean
  observed_stack: readonly string[]
  role_families: readonly string[]
  /** Reçu pour filtrer la couverture; ne pèse jamais dans le score. */
  market_paths: number
}

interface BuildInput {
  portfolio: readonly PortfolioCandidate[]
  market: readonly MarketCandidate[]
  skills?: readonly string[]
  q?: string
  inPortfolio?: boolean
  limit?: number
}

const MAX_SKILLS = 5
const OPPORTUNITIES_MAX_LIMIT = 50
const DEFAULT_LIMIT = 20
const WEIGHT: Record<SignalStrength, number> = { forte: 30, moyenne: 20, faible: 10 }
/** Le score de priorité du compte n'est qu'un complément : il n'invente aucun signal. */
const PRIORITY_SHARE = 0.4

/** « data, Python ; Azure » → ['data', 'Python', 'Azure'] (dédoublonné, borné). */
export function parseSkills(raw: string | undefined | null): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of (raw ?? '').split(/[,;\n/]+/)) {
    const skill = part.trim()
    const key = skill.toLowerCase()
    if (!skill || seen.has(key)) continue
    seen.add(key)
    out.push(skill)
    if (out.length === MAX_SKILLS) break
  }
  return out
}

function portfolioSignals(row: PortfolioCandidate): OpportunitySignal[] {
  const signals: OpportunitySignal[] = []
  const label = row.primary_signal?.trim()
  if (label) {
    signals.push({
      type: 'portfolio_signal',
      libelle: label,
      force: row.signal_freshness === 'current' ? 'forte' : 'moyenne',
    })
  }
  const action = row.next_action_label?.trim()
  if (action) signals.push({ type: 'plan_action', libelle: action, force: 'faible' })
  return signals
}

function marketSignals(row: MarketCandidate, skills: readonly string[]): OpportunitySignal[] {
  const signals: OpportunitySignal[] = []
  const stack = row.observed_stack.map(techno => techno.toLowerCase())
  for (const skill of skills) {
    const wanted = skill.toLowerCase()
    const hit = row.observed_stack.find((_, index) => stack[index]?.includes(wanted))
    if (hit) signals.push({ type: 'market_stack_match', libelle: `Pile observée : ${hit}`, force: 'forte' })
  }
  if (row.external_recourse) {
    signals.push({
      type: 'market_external_recourse',
      libelle: 'Recours à des sociétés de services observé',
      force: 'moyenne',
    })
  }
  if (signals.length === 0 && row.market_paths > 0) {
    signals.push({ type: 'market_presence', libelle: 'Présente dans la mémoire marché', force: 'faible' })
  }
  return signals
}

function whyOf(signals: readonly OpportunitySignal[]): string {
  const top = [...signals].sort((a, b) => WEIGHT[b.force] - WEIGHT[a.force])[0]
  const extra = signals.length - 1
  return `${top?.libelle ?? ''}${extra > 0 ? ` (+${extra} autre${extra > 1 ? 's' : ''} signal${extra > 1 ? 'aux' : ''})` : ''}`
}

function nextStepOf(accountId: string | null, signals: readonly OpportunitySignal[]): string {
  if (accountId === null)
    return 'Lancer une analyse pour obtenir contacts, angles d’attaque et plan (devis de crédits d’abord).'
  if (signals.some(s => s.type === 'plan_action')) return 'Traiter l’étape du plan déjà prévue pour ce compte.'
  return 'Ouvrir le dossier du compte et préparer la prise de contact autour de ce signal.'
}

function toOpportunity(
  name: string,
  accountId: string | null,
  priority: number | null,
  signals: OpportunitySignal[],
): Opportunity {
  const base = signals.reduce((sum, signal) => sum + WEIGHT[signal.force], 0)
  const bonus = priority === null ? 0 : Math.min(100, Math.max(0, priority)) * PRIORITY_SHARE
  return {
    company_name: name,
    account_id: accountId,
    score: Math.min(100, Math.max(0, Math.round(base + bonus))),
    signals,
    why: whyOf(signals),
    next_step: nextStepOf(accountId, signals),
  }
}

export function buildOpportunities(input: BuildInput): Opportunity[] {
  const skills = input.skills ?? []
  const limit = Math.min(Math.max(Math.trunc(input.limit ?? DEFAULT_LIMIT), 1), OPPORTUNITIES_MAX_LIMIT)
  const marketByAccount = new Map<string, MarketCandidate>()
  for (const row of input.market) if (row.account_id) marketByAccount.set(row.account_id, row)

  const out: Opportunity[] = []
  for (const row of input.portfolio) {
    const linked = marketByAccount.get(row.account_id)
    // Avec des compétences demandées, seule la mémoire marché sait y répondre :
    // un compte sans lecture marché n'est pas vérifiable, il ne se devine pas.
    if (skills.length > 0 && !linked) continue
    const market = linked ? marketSignals(linked, skills) : []
    if (skills.length > 0 && !market.some(s => s.type === 'market_stack_match')) continue
    const signals = [...portfolioSignals(row), ...market]
    if (signals.length > 0) out.push(toOpportunity(row.company_name, row.account_id, row.priority_score, signals))
  }
  const portfolioIds = new Set(input.portfolio.map(row => row.account_id))
  for (const row of input.market) {
    if (row.account_id && portfolioIds.has(row.account_id)) continue
    const signals = marketSignals(row, skills)
    if (skills.length > 0 && !signals.some(s => s.type === 'market_stack_match')) continue
    if (signals.length > 0) out.push(toOpportunity(row.company_name, row.account_id, null, signals))
  }

  const q = input.q?.trim().toLowerCase()
  return out
    .filter(o => (input.inPortfolio === undefined ? true : input.inPortfolio === (o.account_id !== null)))
    .filter(o => !q || o.company_name.toLowerCase().includes(q))
    .sort((a, b) => b.score - a.score || a.company_name.localeCompare(b.company_name))
    .slice(0, limit)
}
