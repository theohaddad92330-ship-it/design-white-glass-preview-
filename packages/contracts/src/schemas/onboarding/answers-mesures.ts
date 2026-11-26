import { z } from 'zod'
import { measuredRate } from '../measurability.js'
import { PROFILE_ANSWER_MAX_MULTI } from './limits.js'

/**
 * Unités comparables — issue #2049 (lot L19).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * #2049.14 EST LA DOCTRINE DE CE BLOC
 * ─────────────────────────────────────────────────────────────────────────────
 * « Ne calculer AUCUN taux sans dénominateur fiable. » Ce n'est pas une
 * précaution de calcul, c'est la condition pour qu'un chiffre veuille dire
 * quelque chose. Trois façons de la trahir, et les trois se ressemblent à
 * l'écran :
 *
 *  - **une unité qu'on ne compte pas, comptée pour 0** — le taux mesure alors
 *    la complétude de NOS données, pas l'activité de l'ESN (GA-18/GA-19) ;
 *  - **une période absente** — « 120 contacts » n'est ni une semaine ni une
 *    année ; sans période, c'est un ordre de grandeur, et on le dit (#2049.13) ;
 *  - **deux unités qu'on mélange** — des appels d'offres reçus, des profils
 *    disponibles, des rendez-vous et des placements ne s'additionnent ni ne se
 *    divisent entre eux (#2049.12). L'entonnoir a un ORDRE, un taux le descend.
 *
 * Et le refus symétrique compte autant : **un numérateur nul sur un
 * dénominateur réel vaut bien 0.** « 0 rendez-vous sur 48 contacts » est une
 * mesure — c'est même le décrochage que l'audit existe pour nommer.
 * {@link comparableRate} délègue cette règle-là à `measuredRate`
 * (`../measurability.ts`), où elle vit déjà : une dérivation vit à UN endroit
 * (GA-26), deux chemins qui la refont divergent.
 *
 * ⚠️ Rien ici ne rend une PROBABILITÉ. {@link funnelBreak} NOMME l'étape où la
 * chaîne s'arrête d'être mesurée ; il ne dit pas « 30 % de chances », il ne
 * classe pas les canaux par « chance », et il ne remplit pas un trou par une
 * moyenne (doctrine « aucune probabilité affichée », refusée six fois).
 *
 * ⚠️ Les valeurs sont persistées VERBATIM en français, comme le reste du
 * questionnaire.
 */

export type ActivityMeasure = {
  /** La valeur PERSISTÉE (français verbatim), et le libellé affiché. */
  value: string
  /**
   * #2049.12 — le NOM de ce qui est compté. Deux unités différentes ne
   * s'additionnent pas et ne se divisent pas l'une par l'autre à l'aveugle :
   * c'est ce nom qui rend la faute lisible dans un message de refus.
   */
  unit: string
  /**
   * La position dans l'entonnoir, de 1 (le plus large) à 11. Un taux DESCEND
   * l'entonnoir : son dénominateur est toujours en amont de son numérateur.
   * C'est une POSITION dans une liste, jamais une mesure de performance.
   */
  funnelRank: number
}

/**
 * Les onze unités (#2049.1 → #2049.11), dans l'ordre de l'entonnoir.
 *
 * ⚠️ Un catalogue de valeurs persistées n'en perd jamais une et n'en insère
 * jamais au milieu (GA-08). Une unité nouvelle s'ajoute EN FIN — et si sa place
 * dans l'entonnoir n'est pas la dernière, c'est `funnelRank` qui le dit, pas
 * l'ordre du tableau.
 */
export const ACTIVITY_MEASURES: readonly ActivityMeasure[] = [
  { value: 'Comptes travaillés', unit: 'comptes', funnelRank: 1 }, // #2049.1
  { value: 'Contacts sollicités', unit: 'contacts', funnelRank: 2 }, // #2049.2
  { value: 'Réponses obtenues', unit: 'réponses', funnelRank: 3 }, // #2049.3
  { value: 'Conversations engagées', unit: 'conversations', funnelRank: 4 }, // #2049.4
  { value: 'Rendez-vous tenus', unit: 'rendez-vous', funnelRank: 5 }, // #2049.5
  { value: 'Besoins qualifiés', unit: 'besoins', funnelRank: 6 }, // #2049.6
  { value: 'Profils présentés', unit: 'profils', funnelRank: 7 }, // #2049.7
  { value: 'Entretiens client', unit: 'entretiens', funnelRank: 8 }, // #2049.8
  { value: 'Accords obtenus', unit: 'accords', funnelRank: 9 }, // #2049.9
  { value: 'Démarrages de mission', unit: 'démarrages', funnelRank: 10 }, // #2049.10
  { value: 'Renouvellements', unit: 'renouvellements', funnelRank: 11 }, // #2049.11
]

/** Le catalogue de valeurs, à citer plutôt qu'à recopier (GA-26). */
export const ACTIVITY_MEASURE_VALUES: readonly string[] = ACTIVITY_MEASURES.map(measure => measure.value)

/**
 * #2049.13 — la valeur qui dit « je n'ai pas de période ».
 *
 * Elle n'est pas un pis-aller : elle est la réponse HONNÊTE de qui donne un
 * ordre de grandeur. Ce qui serait faux, c'est de laisser croire à une semaine
 * ou à un mois qu'on n'a jamais demandés. Elle est nommée ici, et c'est ce nom
 * que lit {@link activityPeriodIsExplicit} — jamais un littéral recopié.
 */
export const ORDER_OF_MAGNITUDE_PERIOD = 'Je donne un ordre de grandeur, sans période précise'

/**
 * #2049.13 / #2048.13 — la période de référence des chiffres déclarés.
 *
 * UNE seule période pour tout le bloc (GA-26) : #2048.13 demandait « une
 * période par canal » et #2049 « une période par mesure » — deux réglages pour
 * la même chose auraient divergé, et un chiffre daté de deux façons ne se
 * compare plus à rien.
 */
export const ACTIVITY_REFERENCE_PERIODS: readonly string[] = [
  'La semaine dernière',
  'Le mois dernier',
  'Le trimestre écoulé',
  'Les douze derniers mois',
  ORDER_OF_MAGNITUDE_PERIOD,
]

/**
 * Deux champs, additifs et facultatifs.
 *
 * Ce qu'on demande n'est PAS onze nombres tapés dans un questionnaire d'entrée :
 * c'est **ce que l'ESN compte réellement**, et **sur quelle période**. Sans ces
 * deux réponses, aucun des onze nombres n'aurait de sens — et avec elles, un
 * nombre absent se lit « non compté », jamais « zéro ».
 */
export const MESURES_ANSWER_FIELDS = {
  // #2049.1 → #2049.11 / #2049.12 — les unités réellement comptées aujourd'hui.
  activity_measures_tracked: z
    .array(z.string())
    .max(PROFILE_ANSWER_MAX_MULTI * 2)
    .optional(),
  // #2049.13 / #2048.13 — la période, ou l'aveu explicite qu'il n'y en a pas.
  activity_reference_period: z.string().nullable().optional(),
}

/**
 * Ce que les dérivations lisent — structurel, jamais `EsnAnswers` : ce bloc est
 * importé PAR `../onboarding.ts`, donc en importer le type ferait un cycle.
 */
export type ActivityFunnelInput = {
  activity_measures_tracked?: readonly string[] | null
  activity_reference_period?: string | null
}

/** #2049.13 — une période nommée, par opposition à l'absence et à l'ordre de grandeur. */
export function activityPeriodIsExplicit(period: string | null | undefined): boolean {
  if (typeof period !== 'string') return false
  const trimmed = period.trim()
  if (trimmed.length === 0) return false
  return trimmed !== ORDER_OF_MAGNITUDE_PERIOD
}

/** Les quatre façons dont un taux se refuse — chacune NOMMÉE, jamais silencieuse. */
export type RateRefusal =
  /** L'unité n'est pas au catalogue : la traiter comme une autre serait inventer. */
  | 'unknown_unit'
  /** L'ESN ne compte pas cette unité : son absence n'est pas un zéro (#2049.14). */
  | 'unit_not_tracked'
  /** Pas de période explicite : ce sont des ordres de grandeur (#2049.13). */
  | 'period_not_explicit'
  /** Le dénominateur ne descend pas de l'entonnoir : unités incomparables (#2049.12). */
  | 'not_comparable'
  /** Un terme non lu fait une opinion, pas un taux. */
  | 'numerator_not_measured'
  /** Zéro, absent, ou absurde — jamais un « 0 % » fabriqué (#2049.14). */
  | 'denominator_not_measured'

export type ComparableRateResult = {
  /** Le taux BRUT, non arrondi — arrondir est une décision d'affichage. `null` dès qu'un refus s'applique. */
  rate: number | null
  refusal: RateRefusal | null
  /** Ce qui manque, NOMMÉ : de quoi écrire « on ne sait pas encore, il manque X ». */
  missing: string[]
}

type RateTerm = { measure: string; value: number | null | undefined }

const measureOf = (value: string): ActivityMeasure | undefined => ACTIVITY_MEASURES.find(m => m.value === value)

/**
 * #2049.14 — le seul chemin par lequel un taux d'activité se calcule.
 *
 * Les refus sont ordonnés du plus structurel au plus circonstanciel : une unité
 * inconnue se dit avant une période manquante, qui se dit avant un dénominateur
 * vide. Un appelant qui veut expliquer à l'utilisateur ce qui manque lit
 * `refusal` et `missing` — il n'a jamais à deviner pourquoi l'écran est muet.
 */
export function comparableRate(
  input: ActivityFunnelInput,
  numerator: RateTerm,
  denominator: RateTerm,
): ComparableRateResult {
  const refuse = (refusal: RateRefusal, missing: string[] = []): ComparableRateResult => ({
    rate: null,
    refusal,
    missing,
  })

  const numeratorMeasure = measureOf(numerator.measure)
  const denominatorMeasure = measureOf(denominator.measure)
  const unknown = [
    ...(numeratorMeasure ? [] : [numerator.measure]),
    ...(denominatorMeasure ? [] : [denominator.measure]),
  ]
  if (unknown.length > 0) return refuse('unknown_unit', unknown)

  // #2049.12 — un taux DESCEND l'entonnoir. « Des contacts sur des réponses »
  // n'est pas un taux, c'est deux unités mises dans le mauvais ordre.
  if (denominatorMeasure!.funnelRank >= numeratorMeasure!.funnelRank) return refuse('not_comparable')

  const tracked = new Set(input.activity_measures_tracked ?? [])
  const notTracked = [numerator.measure, denominator.measure].filter(value => !tracked.has(value))
  if (notTracked.length > 0) return refuse('unit_not_tracked', notTracked)

  // #2049.13 — sans période explicite, les deux termes ne sont même pas sur la
  // même échelle de temps : leur rapport ne mesure rien.
  if (!activityPeriodIsExplicit(input.activity_reference_period)) return refuse('period_not_explicit')

  if (numerator.value == null || !Number.isFinite(numerator.value)) {
    return refuse('numerator_not_measured', [numerator.measure])
  }
  // La règle de bord vit dans `measuredRate` (GA-26) : dénominateur nul, absent
  // ou absurde → `null`, et JAMAIS un zéro fabriqué par un `?? 0`.
  const rate = measuredRate(numerator.value, denominator.value ?? null)
  if (rate === null) return refuse('denominator_not_measured', [denominator.measure])
  return { rate, refusal: null, missing: [] }
}

/**
 * #2049.15 — où la chaîne cesse d'être mesurée, NOMMÉ.
 *
 * APPELANT (16/09/2026) : `buildAuditDeclaredSignals`
 * (`../commercial-audit-signals.ts`) → `buildCommercialAuditContext`
 * (`apps/web/.../lib/build-audit.ts`, champ `funnel`) → `AuditDeclaredSignals.tsx`.
 * Cette fonction était juste, testée, et n'avait AUCUN appelant hors de ses
 * propres tests pendant que l'audit écrivait `funnel: null` en dur.
 *
 * Trois réponses possibles, et « not_declared » n'est pas « rien n'est suivi » :
 * c'est « on n'a pas demandé ». Aucun pourcentage, aucune conversion inventée —
 * l'audit dit à quelle étape il perd la trace, et c'est à l'humain de dire
 * pourquoi.
 */
export type FunnelBreak = { kind: 'not_declared' } | { kind: 'break'; measure: ActivityMeasure } | { kind: 'complete' }

export function funnelBreak(input: ActivityFunnelInput): FunnelBreak {
  const tracked = input.activity_measures_tracked ?? []
  if (tracked.length === 0) return { kind: 'not_declared' }
  const trackedSet = new Set(tracked)
  const ordered = [...ACTIVITY_MEASURES].sort((a, b) => a.funnelRank - b.funnelRank)
  const firstGap = ordered.find(measure => !trackedSet.has(measure.value))
  return firstGap ? { kind: 'break', measure: firstGap } : { kind: 'complete' }
}
