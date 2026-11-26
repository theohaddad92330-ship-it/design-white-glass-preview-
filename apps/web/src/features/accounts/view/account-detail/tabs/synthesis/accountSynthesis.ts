import type { AccountAnalysis, RecentSignal, TechnologyEntry } from '@bellum/contracts'

/**
 * #3499 — LA SYNTHÈSE D'UN COMPTE SE COMPREND EN UN SCROLL.
 *
 * Retours du 01/10/2026 (Louis, Théo) : « la première page c'est devenu un
 * bordel sans nom », « la majorité des éléments sont vides, inconnus, non
 * renseignés ». Les dérivations ci-dessous décident CE QUI S'AFFICHE ; les
 * composants ne font que rendre. Toutes pures, testées sans monter l'écran.
 *
 * Doctrine « On n'affiche pas ce qu'on n'a pas » (Louis 20/09/2026) : un fait
 * absent est OMIS — jamais « non renseigné », jamais « 0 », jamais deviné.
 */

const COUNTRY_SUFFIXES = new Set(['france', 'fr'])

/**
 * La VILLE du siège, lue sur `accounts.headquarters` (le registre, ou ce que le
 * commercial a saisi) — jamais sur un site ou une filiale. Deux formes en base :
 * l'adresse complète (« 29 boulevard Haussmann, 75009 Paris ») ou la ville seule.
 * `null` quand le siège n'est pas connu : la ligne d'identité l'omet.
 */
export function headquartersCity(headquarters: string | null | undefined): string | null {
  const parts = (headquarters ?? '')
    .split(',')
    .map(part => part.trim())
    .filter(Boolean)
  while (parts.length > 1 && COUNTRY_SUFFIXES.has((parts[parts.length - 1] ?? '').toLowerCase())) parts.pop()
  const last = parts[parts.length - 1]
  if (!last) return null
  const city = last.replace(/^\d{4,5}\s+/, '').trim()
  return city.length > 0 && !/^\d+$/.test(city) ? city : null
}

function filled(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim()
  return trimmed.length > 0 ? trimmed : null
}

/** La taille du compte : l'effectif, sinon le chiffre d'affaires — `null` sans l'un ni l'autre. */
export function accountSizeFact(account: {
  employees: string | null
  revenue: string | null
}): { kind: 'employees' | 'revenue'; value: string } | null {
  const employees = filled(account.employees)
  if (employees) return { kind: 'employees', value: employees }
  const revenue = filled(account.revenue)
  if (revenue) return { kind: 'revenue', value: revenue }
  return null
}

/**
 * Le signal à mettre en tête : un signal qui dit QUELQUE CHOSE (texte non vide),
 * de préférence en cours de validité, daté et sourcé — ce qui permet de dire au
 * commercial ce qui s'est passé, d'où ça vient et quand.
 */
export function rankSignals(signals: readonly RecentSignal[]): RecentSignal[] {
  const usable = signals.filter(signal => filled(signal.signal))
  const weight = (signal: RecentSignal): number =>
    (signal.freshness === 'archive' || STALE_STATUSES.has(signal.temporal_status ?? '') ? 0 : 4) +
    (filled(signal.sales_implication) ? 2 : 0) +
    (filled(signal.source) ? 1 : 0) +
    (filled(signal.date) ? 1 : 0)
  return usable
    .map((signal, index) => ({ signal, index, score: weight(signal) }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(entry => entry.signal)
}

const STALE_STATUSES = new Set(['STALE', 'SUPERSEDED', 'HISTORICAL'])

type TechPresence = 'high' | 'medium' | 'low'

type TechPill = {
  name: string
  presence: TechPresence | null
  /** Le détail chiffré tel que l'analyse l'a écrit — rendu SEULEMENT derrière « Voir le détail ». */
  detail: string | null
}

/** Le premier nombre d'une ligne d'usage (« Pondération 42 sur… », « Citée sur 7 besoins… »). */
function usageWeight(usage: string | null | undefined): number | null {
  const match = /(\d+)/.exec(usage ?? '')
  return match ? Number(match[1]) : null
}

export const TECH_PILLS_LIMIT = 8

/**
 * #3499 — « Technologies en place : pondération etc. on sait pas ce que ça veut
 * dire ». Les huit technologies les plus présentes, chacune avec un libellé
 * HUMAIN relatif à la plus présente du compte (≥ 2/3 très présente, ≥ 1/3
 * présente, sinon ponctuelle). Sans chiffre lisible, aucun libellé — jamais un
 * niveau deviné.
 */
export function buildTechPills(stack: readonly Pick<TechnologyEntry, 'name' | 'usage'>[]): TechPill[] {
  const seen = new Set<string>()
  const rows = stack.flatMap(row => {
    const name = filled(row.name)
    if (!name || seen.has(name.toLowerCase())) return []
    seen.add(name.toLowerCase())
    return [{ name, weight: usageWeight(row.usage), detail: filled(row.usage) }]
  })
  const max = Math.max(0, ...rows.map(row => row.weight ?? 0))
  return rows
    .map((row, index) => ({ ...row, index }))
    .sort((left, right) => (right.weight ?? -1) - (left.weight ?? -1) || left.index - right.index)
    .slice(0, TECH_PILLS_LIMIT)
    .map(row => ({
      name: row.name,
      detail: row.detail,
      presence:
        row.weight === null || max === 0
          ? null
          : row.weight / max >= 2 / 3
            ? 'high'
            : row.weight / max >= 1 / 3
              ? 'medium'
              : 'low',
    }))
}

/** Le nombre d'actions du plan, toutes phases confondues (le plan vit sous `plan.action_plan`, d'anciens dossiers à la racine). */
export function countPlanActions(analysis: Pick<AccountAnalysis, 'plan' | 'action_plan'>): number {
  const phases = analysis.plan?.action_plan?.phases ?? analysis.action_plan?.phases ?? []
  return phases.reduce((total, phase) => total + (phase.actions ?? []).filter(item => filled(item.action)).length, 0)
}

export const SYNTHESIS_SECTION_ORDER = [
  // #3674.1 — la stratégie de compte ouvre la synthèse : pourquoi, où commencer, que faire.
  'strategy',
  'plan',
  'contacts',
  'angles',
  'meeting',
  'technologies',
  'sources',
  'history',
] as const

export type SynthesisSectionId = (typeof SYNTHESIS_SECTION_ORDER)[number]

export type SynthesisPresenceInput = {
  planActions: number
  offers: number
  risk: boolean
  contacts: number
  angles: number
  meetingMaterial: number
  strategyMaterial: number
  technologyMaterial: number
  sourcesMaterial: number
  analysed: boolean
}

/**
 * Les sections REPLIÉES de la synthèse, dans l'ordre d'utilité commerciale —
 * et SEULEMENT celles qui ont un contenu réel. Une section sans contenu n'a
 * pas d'en-tête : un repli qui ouvre sur du vide s'apprend à ne pas cliquer.
 */
export function visibleSynthesisSections(input: SynthesisPresenceInput): SynthesisSectionId[] {
  const present: Record<SynthesisSectionId, boolean> = {
    plan: input.planActions > 0 || input.offers > 0 || input.risk,
    contacts: input.contacts > 0,
    angles: input.angles > 0,
    // #3673 (réfuté en prod le 07/10, Société Générale) — `WhyNowSection` (R8)
    // nomme désormais l'absence (« Non évalués ») plutôt que de la taire, mais
    // ce repli la portait : masqué dès que pains+enjeux+signaux valaient 0, le
    // correctif de R8 n'avait jamais l'occasion de s'afficher. Une fois le
    // compte ANALYSÉ, le repli reste ouvert même sans matière, pour que
    // l'absence puisse se nommer — jamais analysé, rien à y préparer (même
    // exception que `strategy` ci-dessous, #3674.5).
    // #3666.k — une source de signaux en échec n'est PAS une raison de masquer la section :
    // c'est elle qui NOMME ce qui n'a pas été consulté (« Recherche incomplète : … »), et une
    // absence qu'on cache est une absence qu'on ne peut plus lire (doctrine : ce qui n'a pas
    // pu être évalué reste nommé).
    meeting: input.meetingMaterial > 0 || input.analysed,
    strategy: input.strategyMaterial > 0,
    technologies: input.technologyMaterial > 0,
    sources: input.sourcesMaterial > 0,
    history: input.analysed,
  }
  return SYNTHESIS_SECTION_ORDER.filter(id => present[id])
}
