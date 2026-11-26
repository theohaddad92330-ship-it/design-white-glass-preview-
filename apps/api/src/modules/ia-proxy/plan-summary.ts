import { readPlanEntryRoute } from '@bellum/contracts'

/** Marqueur lu côté IA (`entry_route_turn_block`) : la voie d'entrée de l'onglet Plan. */
export const PLAN_ENTRY_ROUTE_PREFIX = "VOIE D'ENTRÉE DU PLAN : "

const PLAN_DIGEST_MAX_CHARS = 2000

/** Le nom des sections laissées de côté, rendu dans le digest pour que Laura sache qu'il y en a plus. */
const OMITTED_SECTIONS_KEY = '_sections_omises'

/**
 * LOT (15/10) DATA-B.7 — tronquer PAR SECTION, jamais au milieu d'un JSON : l'ancien
 * `JSON.stringify(...).slice(0, 2000)` rendait un JSON coupé (guillemet ouvert, accolade absente) que
 * le modèle lisait comme un plan tronqué en pleine phrase. Ici le digest reste TOUJOURS du JSON valide :
 * sous le plafond il est identique à avant ; au-dessus, seules les sections (clés de premier niveau,
 * éléments d'une liste) qui tiennent en entier sont gardées, et celles laissées de côté sont NOMMÉES.
 */
function digestOf(strategy: unknown): string {
  const whole = JSON.stringify(strategy)
  if (whole.length <= PLAN_DIGEST_MAX_CHARS) return whole
  if (Array.isArray(strategy)) {
    const kept: unknown[] = []
    for (const item of strategy) {
      if (JSON.stringify([...kept, item]).length > PLAN_DIGEST_MAX_CHARS) break
      kept.push(item)
    }
    return JSON.stringify(kept)
  }
  if (strategy && typeof strategy === 'object') {
    const kept: Record<string, unknown> = {}
    const omitted: string[] = []
    for (const [key, value] of Object.entries(strategy as Record<string, unknown>)) {
      const reserve = JSON.stringify({ ...kept, [key]: value, [OMITTED_SECTIONS_KEY]: [...omitted, '…'] }).length
      if (reserve > PLAN_DIGEST_MAX_CHARS) omitted.push(key)
      else kept[key] = value
    }
    if (omitted.length === 0) return JSON.stringify(kept)
    // Le marqueur doit tenir lui aussi : on retire des sections gardées jusqu'à ce qu'il rentre.
    let result = JSON.stringify({ ...kept, [OMITTED_SECTIONS_KEY]: omitted })
    const keptKeys = Object.keys(kept)
    while (result.length > PLAN_DIGEST_MAX_CHARS && keptKeys.length > 0) {
      const dropped = keptKeys.pop() as string
      delete kept[dropped]
      omitted.push(dropped)
      result = JSON.stringify({ ...kept, [OMITTED_SECTIONS_KEY]: omitted })
    }
    return result
  }
  if (typeof strategy === 'string') {
    const room = PLAN_DIGEST_MAX_CHARS - 4
    const cut = strategy.slice(0, room)
    const lastSpace = cut.lastIndexOf(' ')
    return JSON.stringify(`${(lastSpace > room / 2 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`)
  }
  return whole
}

/**
 * Le digest du plan pour le prompt de Laura, plus — quand l'onglet Plan en affiche une — la voie
 * d'entrée (#3423.8). Une seule lecture (`readPlanEntryRoute`, contrats) : « Par où j'ouvre ce
 * compte ? » rend la MÊME voie que l'écran. Sans plan ni voie : rien n'est ajouté.
 */
export function planSummaryOf(raw: unknown): string | null {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null
  const strategy = r ? (r['strategy'] ?? r['plan'] ?? r['action_plan'] ?? null) : null
  const digest = strategy ? digestOf(strategy) : null
  const route = readPlanEntryRoute(raw)
  if (!route) return digest
  const line = `${PLAN_ENTRY_ROUTE_PREFIX}${route}`
  return digest ? `${digest}\n${line}` : line
}
