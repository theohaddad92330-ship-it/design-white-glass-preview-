/**
 * #2966 (#2119.43-51) — LES SIGNAUX DÉJÀ CALCULÉS QUE PERSONNE N'AFFICHAIT.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER LIT, ET POURQUOI CE N'EST PAS UNE DONNÉE INVENTÉE
 * ─────────────────────────────────────────────────────────────────────────
 * `apps/ia/app/services/perimeter_score.py::select_priority_perimeters` calcule
 * déjà, pour 2 à 4 périmètres par compte, un score /20 déterministe sur cinq
 * critères nommés (entité opérationnelle, sponsor probable, signal spécifique,
 * fit offre, accessibilité 14 jours), et EN DÉRIVE un palier (`P1`/`P2`/
 * `secondaire`), une confiance (`high`/`medium`/`low`), un rôle d'entrée
 * commercial recommandé, et la liste des offres identifiées (`whatToSell`).
 * C'est écrit dans `raw_analysis.priority_perimeters` (voir
 * `packages/shared/schemas/research.schema.json`) et servi à l'écran par
 * l'API — mais 0 occurrence de `priorityPerimeters` dans `apps/web/src` avant
 * ce lot : du code juste, calculé, testé, que personne n'appelait (registre du
 * dépôt).
 *
 * Ce module ne calcule RIEN — il lit ce qui existe déjà, défensivement (le
 * payload est `unknown`, jamais garanti par un schéma strict côté web), et le
 * rapproche d'un nom d'entité par une correspondance textuelle déterministe
 * (jamais un rapprochement deviné par position ou par ordre).
 */

// Non exportés : consommés uniquement ici, via `PriorityPerimeterSignal` (règle
// du dépôt — un type qui ne sert que dans son propre fichier ne s'exporte pas,
// `pnpm lint:exports:types`).
type PerimeterConfidence = 'high' | 'medium' | 'low'
type PerimeterTier = 'P1' | 'P2' | 'secondaire'
type PerimeterAccessibility = 'high' | 'medium' | 'low'

export type PriorityPerimeterSignal = {
  name: string
  tier: PerimeterTier
  confidence: PerimeterConfidence
  /** Rôle d'entrée commercial recommandé (bottom-up / top-down / middle-out),
   *  déjà écrit en texte par `perimeter_score.py::_entry_role`. */
  entryRole: string
  /** Dérivée des points de l'axe "accessibilite" du score /20 (0/2/4 → low/
   *  medium/high) — jamais une probabilité : un palier d'un axe nommé. */
  accessibility: PerimeterAccessibility
  /** Nombre d'offres identifiées pour ce périmètre (`whatToSell`) — la mesure
   *  la plus proche de « signaux » que l'analyse porte réellement à ce niveau. */
  signalsCount: number
}

const TIERS: readonly PerimeterTier[] = ['P1', 'P2', 'secondaire']
const CONFIDENCES: readonly PerimeterConfidence[] = ['high', 'medium', 'low']

/** Normalise un nom pour la correspondance : casse et diacritiques pliés, comme
 *  `normaliseTypeKey` — même défaut visé (« Île-de-France » ≠ « ile de france »). */
function normaliseName(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

function accessibilityFromPoints(points: unknown): PerimeterAccessibility {
  if (points === 4) return 'high'
  if (points === 0) return 'low'
  return 'medium'
}

function readAxisPoints(breakdown: unknown, axis: string): unknown {
  if (!Array.isArray(breakdown)) return undefined
  const entry = breakdown.find(
    item => item && typeof item === 'object' && (item as Record<string, unknown>).axis === axis,
  )
  return entry && typeof entry === 'object' ? (entry as Record<string, unknown>).points : undefined
}

function readOne(raw: unknown): PriorityPerimeterSignal | null {
  if (!raw || typeof raw !== 'object') return null
  const rec = raw as Record<string, unknown>
  const name = typeof rec.name === 'string' ? rec.name.trim() : ''
  if (!name) return null
  const tier = TIERS.includes(rec.tier as PerimeterTier) ? (rec.tier as PerimeterTier) : 'secondaire'
  const confidence = CONFIDENCES.includes(rec.confidence as PerimeterConfidence)
    ? (rec.confidence as PerimeterConfidence)
    : 'low'
  const entryRole = typeof rec.entryRole === 'string' && rec.entryRole.trim() ? rec.entryRole.trim() : ''
  const whatToSell = Array.isArray(rec.whatToSell) ? rec.whatToSell : []
  return {
    name,
    tier,
    confidence,
    entryRole,
    accessibility: accessibilityFromPoints(readAxisPoints(rec.scoreBreakdown, 'accessibilite')),
    signalsCount: whatToSell.length,
  }
}

/**
 * `raw_analysis.priority_perimeters` → la liste typée, défensivement. Renvoie
 * `[]` sur une analyse antérieure à ce champ, jamais une erreur — c'est un
 * dossier plus ancien, pas un dossier cassé.
 */
export function readPriorityPerimeters(rawAnalysis: unknown): PriorityPerimeterSignal[] {
  if (!rawAnalysis || typeof rawAnalysis !== 'object') return []
  const list = (rawAnalysis as Record<string, unknown>).priority_perimeters
  if (!Array.isArray(list)) return []
  return list.map(readOne).filter((item): item is PriorityPerimeterSignal => item !== null)
}

/**
 * Le signal du périmètre le plus proche de `entityName`, par correspondance
 * textuelle dans les DEUX sens (l'un contient l'autre) — jamais une distance
 * approchée : « France Télévisions (holding/société mère) » doit retrouver
 * « France Télévisions » et pas l'inverse seulement. `null` = non mesuré :
 * l'entité n'est pas parmi les 2-4 périmètres prioritaires de ce compte, ce qui
 * est un fait aussi valide qu'une correspondance.
 */
export function matchPerimeterSignal(
  entityName: string,
  perimeters: readonly PriorityPerimeterSignal[],
): PriorityPerimeterSignal | null {
  const needle = normaliseName(entityName)
  if (!needle) return null
  for (const perimeter of perimeters) {
    const candidate = normaliseName(perimeter.name)
    if (!candidate) continue
    if (needle.includes(candidate) || candidate.includes(needle)) return perimeter
  }
  return null
}
