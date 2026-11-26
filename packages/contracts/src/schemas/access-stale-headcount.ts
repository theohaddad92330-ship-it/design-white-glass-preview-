import type { Addressability } from './discover.js'
import type { AccessBarrierClass } from './discover.js'
import { isSegmentCollectionStale, SEGMENT_CAPABILITY_EPOCH } from './segment-catchup.js'

/**
 * #3504 — « une valeur à REVÉRIFIER ne pèse pas ».
 *
 * La barrière d'achat écrite avant la correction de la lecture de l'effectif dit « effectif 53
 * salariés » à côté d'un en-tête « Plus de 10 000 salariés ». L'écran savait déjà le dire (« à
 * revérifier »), mais la valeur périmée continuait de PESER : « Effectif +0,18 » dans la somme de
 * la barrière, et l'axe « Proportion — < 250 pour une ESN de 30-80 » dans l'adressabilité.
 *
 * Ici, côté serveur et UNE seule fois (GA-26) : l'effectif sort de la somme, la proportion sort des
 * facteurs ET du dénominateur (un axe non évaluable est NOMMÉ, jamais compté 0), et le score se
 * relit sur ce qui reste. Rien n'est recalculé en base : « Actualiser » (une analyse) reste le
 * seul geste qui réécrit.
 */

const OPEN_ENDED = /plus de|more than|over|\+|>/i

function numbersIn(text: string): number[] {
  return (text.replace(/\s/g, '').match(/\d+/g) ?? []).map(Number).filter(Number.isFinite)
}

/**
 * `true` seulement quand l'effectif de la preuve est INCOMPATIBLE avec celui de l'en-tête (sous sa
 * borne basse, ou au-dessus de sa borne haute si la tranche est fermée). Un en-tête ou une preuve
 * sans chiffre lisible ne juge rien : « non lisible » n'est pas « contradictoire ».
 */
export function headcountContradictsHeader(evidence: string, headerEmployees: string | null | undefined): boolean {
  const proofNumbers = /effectif\s+([\d\s]+?)\s+salari/i.exec(evidence)?.[1]
  if (!proofNumbers || !headerEmployees) return false
  const proof = numbersIn(proofNumbers)[0]
  const header = numbersIn(headerEmployees)
  if (proof === undefined || header.length === 0) return false
  const low = Math.min(...header)
  const high = Math.max(...header)
  if (proof < low) return true
  return !OPEN_ENDED.test(headerEmployees) && proof > high
}

/**
 * Les bornes de classe de la barrière. ⚠️ MIROIR de `CLASS_BOUNDS` (`apps/ia/app/services/
 * access_scoring.py`) : la classe se relit ici sur le score sans l'effectif périmé, et les deux
 * tables changent ENSEMBLE.
 */
const CLASS_BOUNDS: readonly (readonly [number, AccessBarrierClass, string])[] = [
  [3, 'A', 'Ouvert probable'],
  [5, 'B', 'Ouvert par une entité'],
  [7, 'C', 'Semi-ouvert'],
  [10, 'D', 'Verrouillage probable'],
]

/** Le plafond de l'axe proportion — celui de `ADDRESSABILITY_AXES`. */
const PROPORTION_MAX = 5
/** Moins de trois proxies mesurables ⇒ pas de score (`access_barrier`, côté IA). */
const MIN_MEASURABLE_PROXIES = 3

function round(value: number): number {
  return Math.round(value * 1000) / 1000
}

interface BarrierLike {
  score: number | null
  accessibility: number | null
  access_class: AccessBarrierClass | null
  label: string | null
  proxies: { key: string; contribution: number; evidence: string; measurable: boolean }[]
  measurable: boolean
  missing: string[]
}

export function withoutStaleHeadcount<B extends BarrierLike>(input: {
  barrier: B | null
  addressability: Addressability | null
  employees: string | null | undefined
  signalsCollectedAt: Date | string | null | undefined
}): { barrier: B | null; addressability: Addressability | null; recheck: boolean } {
  const { barrier, addressability } = input
  const effectif = barrier?.proxies.find(proxy => proxy.key === 'effectif' && proxy.measurable)
  const epoch = SEGMENT_CAPABILITY_EPOCH.signals
  const staleByDate = epoch ? isSegmentCollectionStale(input.signalsCollectedAt, epoch) : false
  const recheck =
    effectif !== undefined && (staleByDate || headcountContradictsHeader(effectif.evidence, input.employees))
  if (!recheck) return { barrier, addressability, recheck: false }

  return { barrier: barrierWithout(barrier, effectif), addressability: addressabilityWithout(addressability), recheck }
}

function barrierWithout<B extends BarrierLike>(barrier: B | null, effectif: BarrierLike['proxies'][number]): B | null {
  if (!barrier) return barrier
  const proxies = barrier.proxies.map(proxy =>
    proxy.key === 'effectif'
      ? { ...proxy, contribution: 0, measurable: false, evidence: 'effectif à revérifier' }
      : proxy,
  )
  const missing = barrier.missing.includes('effectif') ? barrier.missing : [...barrier.missing, 'effectif']
  const measurable = proxies.filter(proxy => proxy.measurable).length >= MIN_MEASURABLE_PROXIES
  if (!measurable || barrier.score === null) {
    return {
      ...barrier,
      proxies,
      missing,
      measurable: false,
      score: null,
      accessibility: null,
      access_class: null,
      label: null,
    }
  }
  const score = round(barrier.score - effectif.contribution)
  const klass = CLASS_BOUNDS.find(([bound]) => score <= bound) ?? CLASS_BOUNDS[CLASS_BOUNDS.length - 1]
  return {
    ...barrier,
    proxies,
    missing,
    score,
    accessibility: barrier.accessibility === null ? null : round(barrier.accessibility + effectif.contribution),
    access_class: klass?.[1] ?? null,
    label: klass?.[2] ?? null,
  }
}

function addressabilityWithout(addressability: Addressability | null): Addressability | null {
  if (!addressability) return addressability
  const proportion = addressability.factors.find(factor => factor.axis === 'proportion')
  if (!proportion) return addressability
  const factors = addressability.factors.filter(factor => factor.axis !== 'proportion')
  return {
    ...addressability,
    factors,
    score: addressability.score === null ? null : addressability.score - proportion.points,
    max: Math.max(0, addressability.max - PROPORTION_MAX),
    unmeasured: addressability.unmeasured.includes('proportion')
      ? addressability.unmeasured
      : [...addressability.unmeasured, 'proportion'],
  }
}
