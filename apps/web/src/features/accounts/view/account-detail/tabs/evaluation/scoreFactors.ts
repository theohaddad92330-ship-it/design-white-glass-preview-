import type { ProofType } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { safeString } from '../../helpers/safe'

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

/**
 * Presentation + mapping for the commercial-score evidence (Théo P1 « Score et
 * quick wins » : « Chaque facteur du score doit être relié à une preuve :
 * signal, source, contact, profil ou règle métier »). Pure — unit-tested.
 */

export type ScoreFactorView = {
  label: string
  proofType: string
  weight: number | null
  /** ``axis`` factors add up to the single ``total`` factor. Legacy runs carry
   *  no kind — they are read as axes. */
  kind: 'axis' | 'total'
  /** Scale the weight is on (5 per axis, 25 for the total), when known. */
  max: number | null
}

type ProofTypeMeta = { label: string; className: string }

// Le LIBELLÉ de chaque type de preuve. Pas sa couleur : un type de preuve est
// une CATÉGORIE, et « une couleur porte un état, jamais une catégorie »
// (tome 7 §26.1, garde GA-64). Les cinq types portaient cinq teintes — ambre,
// ciel, émeraude, violet, ardoise — qui n'apprenaient rien : il fallait une
// légende pour les lire, et l'ambre dépensé sur « Signal » ne voulait plus
// dire « ça demande une décision » ailleurs sur le même écran.
//
// Rien n'est perdu en retirant la couleur : le badge ÉCRIT déjà le type, et
// c'est le mot qui portait l'information depuis le début.
//
// Les libellés sont résolus par i18n à l'appel (jamais au chargement du
// module) pour suivre un changement de langue.
const PROOF_TYPE_LABEL_KEY: Record<ProofType, string> = {
  signal: 'proofType.signal',
  source: 'proofType.source',
  contact: 'proofType.contact',
  profile: 'proofType.profile',
  business_rule: 'proofType.businessRule',
}

/** Un seul badge, neutre : le score reste le titre, la preuve reste une note. */
const NEUTRAL_CLASS_NAME =
  'bg-[var(--bellum-bg-lighter)] text-[var(--bellum-text-secondary)] border-[var(--bellum-border)]'

/** Badge label + classes for a proof type — tolerant of an unknown future kind
 *  (keeps the raw label) rather than crashing. */
export function proofTypeMeta(proofType: string): ProofTypeMeta {
  const labelKey = PROOF_TYPE_LABEL_KEY[proofType as ProofType]
  if (labelKey) return { label: i18n.t(`accountDetail:${labelKey}`), className: NEUTRAL_CLASS_NAME }
  return { label: proofType || i18n.t('accountDetail:proofType.fallback'), className: NEUTRAL_CLASS_NAME }
}

/** Normalize the raw ``score_factors`` array (IA emits snake ``proof_type``;
 *  tolerate ``proofType`` too) into a display shape. Drops factors without a
 *  label; never throws on a malformed row. */
export function normalizeScoreFactors(raw: unknown): ScoreFactorView[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item): ScoreFactorView | null => {
      const record = readRecord(item)
      if (!record) return null
      const label = safeString(record['label'])
      if (!label) return null
      const weightRaw = record['weight']
      const maxRaw = record['max']
      return {
        label,
        proofType: safeString(record['proof_type'] ?? record['proofType']),
        weight: typeof weightRaw === 'number' ? weightRaw : null,
        kind: record['kind'] === 'total' ? 'total' : 'axis',
        max: typeof maxRaw === 'number' ? maxRaw : null,
      }
    })
    .filter((f): f is ScoreFactorView => f != null)
}

/** Additive (measured) axes — the ones that actually count toward the total.
 *  #2091 — an axis whose `weight` is `null` could not be evaluated: it is
 *  EXCLUDED, never folded in as a silent zero (doctrine `ScoreWithAxes` — an
 *  axis that can't be scored drops out of the denominator, otherwise the
 *  total measures how complete our data is, not how the account scores). */
function measuredAxes(factors: ScoreFactorView[]): (ScoreFactorView & { weight: number })[] {
  return factors.filter((f): f is ScoreFactorView & { weight: number } => f.kind === 'axis' && f.weight !== null)
}

/** Sum of the additive factors — what a reader gets by adding the column.
 *  Non-evaluated axes (`weight: null`) are excluded, not counted as zero. */
export function sumAxisFactors(factors: ScoreFactorView[]): number {
  return measuredAxes(factors).reduce((total, f) => total + f.weight, 0)
}

/** The denominator matching `sumAxisFactors`: only the `max` of MEASURED axes,
 *  so a non-evaluated axis's points leave the total too — not just its score.
 *  `null` when a measured axis carries no `max` of its own: a denominator
 *  invented from a hardcoded constant would be worse than none. */
export function sumAxisMax(factors: ScoreFactorView[]): number | null {
  const measured = measuredAxes(factors)
  if (measured.some(f => f.max === null)) return null
  return measured.reduce((total, f) => total + (f.max as number), 0)
}

/** Labels of the axes that could not be evaluated — NAMED, never absorbed
 *  into the total (doctrine: "ce qui n'a pas pu être évalué est NOMMÉ"). */
export function excludedAxisLabels(factors: ScoreFactorView[]): string[] {
  return factors.filter(f => f.kind === 'axis' && f.weight === null).map(f => f.label)
}

/** #4016.L9.a — every axis the run produced (measured AND excluded): the
 *  denominator a score is read against (doctrine: a score is never shown
 *  without its axis count — see `dossierRead.axesEvaluated`, same rule
 *  applied here to the commercial-score evidence). */
export function totalAxisCount(factors: ScoreFactorView[]): number {
  return factors.filter(f => f.kind === 'axis').length
}

/** #4016.L9.a — the axes actually measured (weight resolved), out of `totalAxisCount`. */
export function measuredAxisCount(factors: ScoreFactorView[]): number {
  return measuredAxes(factors).length
}

/** The single total factor, when the run produced one. */
export function totalFactor(factors: ScoreFactorView[]): ScoreFactorView | null {
  return factors.find(f => f.kind === 'total') ?? null
}

/** Normalise un libellé d'axe pour le comparer à une clé (« Accessibilité — relation… » → « accessibilite »). */
function axisHeadword(label: string): string {
  const head = label.split(/\s[—–-]\s|\s/)[0] ?? ''
  return head
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

/**
 * LOIC-FIX2 SCORE OGF (b) — deux sources se contredisaient : la grille /25 notait « Concurrence +2/5 » pendant que
 * la lecture du dossier (7 axes) rangeait « Concurrence » parmi les axes non mesurés. La lecture du dossier fait
 * foi sur « mesuré / non mesuré » : un facteur dont le nom d'axe y est inconnu perd sa note (`weight: null`) et suit
 * la doctrine — hors du dénominateur, NOMMÉ. Seuls les axes qui portent le MÊME nom dans les deux grilles sont
 * rapprochés (accessibilité, concurrence) : on ne devine pas une correspondance entre « timing » et « fraîcheur ».
 */
export function reconcileFactorsWithDossierRead(
  factors: ScoreFactorView[],
  unknownAxisKeys: readonly string[],
): ScoreFactorView[] {
  if (unknownAxisKeys.length === 0) return factors
  const unknown = new Set(unknownAxisKeys.map(key => axisHeadword(key)))
  return factors.map(factor =>
    factor.kind === 'axis' && factor.weight !== null && unknown.has(axisHeadword(factor.label))
      ? { ...factor, weight: null }
      : factor,
  )
}
