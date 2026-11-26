import {
  DOSSIER_SCORE_AXES,
  computeDossierScore,
  orderedDossierAxes,
  type DossierAxisState,
  type DossierScoreAxis,
  type DossierScoreAxisKey,
  type DossierScoreComputation,
} from '@bellum/contracts'

/**
 * #2118 — LA LECTURE DU DOSSIER, EN FORME D'ÉCRAN.
 *
 * Le contrat (`packages/contracts/.../dossier-read.ts`) porte la forme de FIL
 * (snake_case) et le CALCUL (`computeDossierScore`, `orderedDossierAxes`) : rien
 * n'est recalculé ici (GA-26 — une dérivation vit à un seul endroit, deux
 * chemins qui la refont divergent).
 *
 * Ce module fait la seule chose que le contrat ne peut pas faire : **encaisser
 * ce que la base contient vraiment.** `raw_analysis` n'est pas parsé strictement
 * côté web — des milliers d'analyses écrites avant ce lot feraient échouer un
 * `parse()` en bloc, et un dossier ancien doit rester lisible. La conséquence
 * est qu'un axe peut arriver ici dans un état que le contrat aurait refusé : un
 * axe `unknown` portant une note, un axe `measured` sans note, une clé d'axe qui
 * n'existe pas. Les trois cas sont normalisés ci-dessous plutôt qu'affichés —
 * un axe « non mesuré » qui porte un 5 est exactement le zéro qui ment, un cran
 * plus haut.
 */

/** Un axe, prêt à afficher. `value` est `null` DÈS QUE l'état est inconnu. */
export type DossierAxisView = {
  key: DossierScoreAxisKey
  state: DossierAxisState
  value: number | null
  /** #2118.39 — ce que cet axe fait au verdict. */
  impact: string | null
  /** #2118.40 — ce qui le ferait monter. */
  lever: string | null
}

/** #2118.44 — une dimension de fiabilité : un état, et un chiffre SEULEMENT si mesuré. */
export type DossierReliabilityDimensionView = {
  state: DossierAxisState
  value: number | null
  note: string | null
}

export type DossierReadView = {
  /** Toujours les SEPT, dans l'ordre canonique — les absents en « inconnu ». */
  axes: DossierAxisView[]
  /** Calculé par le contrat, jamais ici. `insufficient` = pas de chiffre à l'écran. */
  score: DossierScoreComputation
  whyForYourEsn: string | null
  recommendedScope: string | null
  bestEntryPoint: { label: string | null; targetProfile: string | null; why: string | null } | null
  /** #2304.7 (épopée #2932) — Q6, distincte de `bestEntryPoint` (QUI) : PAR OÙ entrer commercialement. */
  accessPath: string | null
  obstacles: { label: string | null; why: string | null }[]
  antiAdvice: { what: string | null; why: string | null } | null
  nextAction: { label: string | null; route: string | null; tab: string | null } | null
  reliability: {
    quality: DossierReliabilityDimensionView | null
    coverage: DossierReliabilityDimensionView | null
    freshness: DossierReliabilityDimensionView | null
  } | null
  /** #2118.45/.47 — `temporary` n'est pas repris : le contrat n'admet QUE `true`. */
  noGo: { context: string | null; trigger: string | null } | null
  profileIncomplete: boolean
  profileIncompleteFields: string[]
  missing: { label: string | null; why: string | null }[]
}

const AXIS_KEYS = new Set<string>(DOSSIER_SCORE_AXES)
const AXIS_STATES = new Set<string>(['measured', 'partial', 'unknown'])

/**
 * Lit `evaluation.dossier_read` tel qu'il est en base et en fait une lecture
 * d'écran — ou `null` quand il n'y a rien à lire (analyse d'avant ce lot).
 *
 * `null` plutôt qu'un objet vide : l'écran doit pouvoir distinguer « ce dossier
 * n'a pas de lecture structurée » (on garde la lecture d'avant) de « la lecture
 * existe et dit que tout est inconnu » (on nomme les sept axes). Un objet à
 * moitié rempli ferait les deux mal.
 */
export function readDossierRead(raw: unknown): DossierReadView | null {
  const record = asRecord(raw)
  if (!record) return null

  const axes = normalizeAxes(record['axes'])
  const whyForYourEsn = text(record['why_for_your_esn'])
  const recommendedScope = text(record['recommended_scope'])
  const bestEntryPoint = normalizeEntryPoint(record['best_entry_point'])
  const accessPath = text(record['access_path'])
  const obstacles = normalizeLabelled(record['obstacles'])
  const antiAdvice = normalizeAntiAdvice(record['anti_advice'])
  const nextAction = normalizeNextAction(record['next_action'])
  const reliability = normalizeReliability(record['reliability'])
  const noGo = normalizeNoGo(record['no_go'])
  const profileIncomplete = record['profile_incomplete'] === true
  const profileIncompleteFields = normalizeStringList(record['profile_incomplete_fields'])
  const missing = normalizeLabelled(record['missing'])

  const hasSomething =
    axes.length > 0 ||
    whyForYourEsn !== null ||
    recommendedScope !== null ||
    bestEntryPoint !== null ||
    accessPath !== null ||
    obstacles.length > 0 ||
    antiAdvice !== null ||
    nextAction !== null ||
    reliability !== null ||
    noGo !== null ||
    profileIncomplete ||
    missing.length > 0
  if (!hasSomething) return null

  return {
    // `orderedDossierAxes` COMPLÈTE les sept : un axe que le modèle n'a pas
    // rendu apparaît « inconnu » au lieu de disparaître — un axe qu'on ne voit
    // pas ne se distingue pas d'un axe à zéro.
    axes: orderedDossierAxes(axes).map(axis => ({
      key: axis.key,
      state: axis.state,
      value: typeof axis.value === 'number' ? axis.value : null,
      impact: text(axis.impact),
      lever: text(axis.lever),
    })),
    score: computeDossierScore(axes),
    whyForYourEsn,
    recommendedScope,
    bestEntryPoint,
    accessPath,
    obstacles,
    antiAdvice,
    nextAction,
    reliability,
    noGo,
    profileIncomplete,
    profileIncompleteFields,
    missing,
  }
}

/**
 * Les trois normalisations qui protègent l'écran, et leur raison :
 *  - clé inconnue → l'axe est JETÉ (sept axes fixes, pas un huitième inventé) ;
 *  - `unknown` + une note → la note est PERDUE (elle ne se somme pas) ;
 *  - un état noté sans note → l'axe redevient `unknown` (un état sans chiffre
 *    ne décompose rien, et il rendrait un trou dans le calcul).
 */
function normalizeAxes(raw: unknown): DossierScoreAxis[] {
  if (!Array.isArray(raw)) return []
  const out: DossierScoreAxis[] = []
  for (const entry of raw) {
    const record = asRecord(entry)
    if (!record) continue
    const key = record['key']
    if (typeof key !== 'string' || !AXIS_KEYS.has(key)) continue
    const rawState = record['state']
    const state: DossierAxisState =
      typeof rawState === 'string' && AXIS_STATES.has(rawState) ? (rawState as DossierAxisState) : 'unknown'
    const rawValue = record['value']
    const hasValue = typeof rawValue === 'number' && Number.isFinite(rawValue)
    const measured = state !== 'unknown' && hasValue
    out.push({
      key: key as DossierScoreAxisKey,
      state: measured ? state : 'unknown',
      value: measured ? (rawValue as number) : null,
      impact: text(record['impact']),
      lever: text(record['lever']),
    })
  }
  return out
}

function normalizeEntryPoint(raw: unknown): DossierReadView['bestEntryPoint'] {
  const record = asRecord(raw)
  if (!record) return null
  const label = text(record['label'])
  const targetProfile = text(record['target_profile'])
  const why = text(record['why'])
  if (label === null && targetProfile === null && why === null) return null
  return { label, targetProfile, why }
}

function normalizeLabelled(raw: unknown): { label: string | null; why: string | null }[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map(entry => {
      const record = asRecord(entry)
      if (!record) return null
      const label = text(record['label'])
      const why = text(record['why'])
      return label === null && why === null ? null : { label, why }
    })
    .filter((entry): entry is { label: string | null; why: string | null } => entry !== null)
}

function normalizeAntiAdvice(raw: unknown): DossierReadView['antiAdvice'] {
  const record = asRecord(raw)
  if (!record) return null
  const what = text(record['what'])
  const why = text(record['why'])
  if (what === null && why === null) return null
  return { what, why }
}

function normalizeNextAction(raw: unknown): DossierReadView['nextAction'] {
  const record = asRecord(raw)
  if (!record) return null
  const label = text(record['label'])
  if (label === null) return null
  return { label, route: text(record['route']), tab: text(record['tab']) }
}

function normalizeDimension(raw: unknown): DossierReliabilityDimensionView | null {
  const record = asRecord(raw)
  if (!record) return null
  const rawState = record['state']
  const state: DossierAxisState =
    typeof rawState === 'string' && AXIS_STATES.has(rawState) ? (rawState as DossierAxisState) : 'unknown'
  const rawValue = record['value']
  const hasValue = typeof rawValue === 'number' && Number.isFinite(rawValue)
  // Même règle que pour un axe : « couverture non mesurée » n'est pas
  // « couverture 0 % », et la nuance se perd dès qu'on écrit le zéro.
  return { state, value: state !== 'unknown' && hasValue ? (rawValue as number) : null, note: text(record['note']) }
}

function normalizeReliability(raw: unknown): DossierReadView['reliability'] {
  const record = asRecord(raw)
  if (!record) return null
  const quality = normalizeDimension(record['quality'])
  const coverage = normalizeDimension(record['coverage'])
  const freshness = normalizeDimension(record['freshness'])
  if (!quality && !coverage && !freshness) return null
  return { quality, coverage, freshness }
}

function normalizeNoGo(raw: unknown): DossierReadView['noGo'] {
  const record = asRecord(raw)
  if (!record) return null
  const context = text(record['context'])
  const trigger = text(record['trigger'])
  if (context === null && trigger === null) return null
  return { context, trigger }
}

function normalizeStringList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw.map(entry => text(entry)).filter((entry): entry is string => entry !== null)
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function text(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}
