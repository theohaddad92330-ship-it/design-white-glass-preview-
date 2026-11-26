import { nafPrefixesForSectors } from '@bellum/contracts'
import { parseHeadcountLabel } from './discover-filters'

/**
 * #2151.36 / #2165.55 / #2166.39 — la « complémentarité » entre l'ESN
 * cherchée et l'ESN qui cherche n'avait aucune définition dans le dépôt.
 *
 * DÉCISION Louis 15/09/2026 : un score DÉCOMPOSÉ à axes nommés — recouvrement
 * d'expertises · de secteurs · de comptes · de taille — jamais un score nu,
 * et sous {@link MINIMUM_COMPLEMENTARITY_AXES} axes RÉELLEMENT évalués il n'y
 * a pas de score composite (même doctrine que `ScoreWithAxes` /
 * `auditScoreWithAxesSchema`).
 *
 * ⚠️ Deux axes (`expertise`, `accounts`) n'ont AUCUNE source câblée à ce jour
 * — le stack observé (mémoire marché) et les comptes partagés supposeraient
 * un aller-retour serveur que ce lot ne fait pas. Ils restent NOMMÉS, avec
 * `score: null` : « non mesuré » n'est jamais rendu à zéro, et un axe qu'on
 * ne sait pas évaluer sort du dénominateur plutôt que de le faire échouer.
 */
export const PARTNER_COMPLEMENTARITY_AXES = ['sectors', 'size', 'expertise', 'accounts'] as const
// #2151.36 — non exporté : consommé uniquement dans ce fichier (règle CLAUDE.md
// « ne jamais exporter un type uniquement consommé dans son fichier »).
type PartnerComplementarityAxis = (typeof PARTNER_COMPLEMENTARITY_AXES)[number]

export const MINIMUM_COMPLEMENTARITY_AXES = 3

interface PartnerComplementarityAxisResult {
  axis: PartnerComplementarityAxis
  /** 0-100, ou `null` = non évalué. Ne vaut jamais zéro par défaut. */
  score: number | null
}

export interface PartnerComplementarityScore {
  /** `null` sous {@link MINIMUM_COMPLEMENTARITY_AXES} axes évalués — les axes
   *  restent lisibles quand même. */
  score: number | null
  axes: PartnerComplementarityAxisResult[]
  /** Les axes NOMMÉS qui n'ont pas pu être évalués, dans l'ordre du barème. */
  unmeasuredAxes: PartnerComplementarityAxis[]
}

interface PartnerComplementarityCandidate {
  sector: string | null
  nafCode: string | null
  headcountRange: string | null
}

interface PartnerComplementarityOwnProfile {
  /** Secteurs déclarés du vocabulaire partagé (`APPLICATION_SECTORS`). */
  sectors: readonly string[]
  headcountRange: string | null
}

function sectorsAxis(candidate: PartnerComplementarityCandidate, own: PartnerComplementarityOwnProfile): number | null {
  const ownPrefixes = nafPrefixesForSectors(own.sectors)
  if (ownPrefixes.length === 0) return null
  const digits = (candidate.nafCode ?? '').replace(/\D/g, '')
  if (digits.length < 4) return null
  return ownPrefixes.includes(digits.slice(0, 4)) ? 100 : 0
}

/** Milieu de tranche, pour comparer deux tranches sans confondre « proche »
 *  et « identique » — même lecture que `parseHeadcountLabel`. */
function midpoint(range: readonly [number, number]): number {
  return Number.isFinite(range[1]) ? (range[0] + range[1]) / 2 : range[0] * 1.5
}

function sizeAxis(candidate: PartnerComplementarityCandidate, own: PartnerComplementarityOwnProfile): number | null {
  const candidateRange = parseHeadcountLabel(candidate.headcountRange)
  const ownRange = parseHeadcountLabel(own.headcountRange)
  if (candidateRange === null || ownRange === null) return null
  const a = midpoint(candidateRange)
  const b = midpoint(ownRange)
  const ratio = Math.min(a, b) / Math.max(a, b)
  return Math.round(ratio * 100)
}

/** Axes sans source câblée dans ce lot — voir le commentaire d'en-tête. */
function unwiredAxis(): number | null {
  return null
}

export function computePartnerComplementarity(
  candidate: PartnerComplementarityCandidate,
  own: PartnerComplementarityOwnProfile,
): PartnerComplementarityScore {
  const axes: PartnerComplementarityAxisResult[] = PARTNER_COMPLEMENTARITY_AXES.map(axis => {
    switch (axis) {
      case 'sectors':
        return { axis, score: sectorsAxis(candidate, own) }
      case 'size':
        return { axis, score: sizeAxis(candidate, own) }
      case 'expertise':
      case 'accounts':
        return { axis, score: unwiredAxis() }
    }
  })

  const evaluated = axes.filter(a => a.score !== null)
  const unmeasuredAxes = axes.filter(a => a.score === null).map(a => a.axis)
  const score =
    evaluated.length >= MINIMUM_COMPLEMENTARITY_AXES
      ? Math.round(evaluated.reduce((sum, a) => sum + (a.score as number), 0) / evaluated.length)
      : null

  return { score, axes, unmeasuredAxes }
}

/**
 * #2165.55 — DÉCISION Louis 19/09 : « connue » ne veut pas dire « score
 * composite rendu ». Sous {@link MINIMUM_COMPLEMENTARITY_AXES} axes évalués,
 * `score` reste structurellement `null` (deux des quatre axes n'ont aucune
 * source câblée à ce jour, voir l'en-tête du fichier) — l'exiger rendrait la
 * carte pour TOUJOURS « inconnue », même quand un axe réel est mesuré. Une
 * complémentarité est donc « connue » dès qu'AU MOINS un axe est évalué, et
 * totalement inconnue seulement quand aucun ne l'est — c'est la seule fois où
 * la carte doit le dire (jamais un bloc vide, jamais un 0).
 */
export function isComplementarityUnknown(complementarity: PartnerComplementarityScore | null): boolean {
  return complementarity === null || complementarity.unmeasuredAxes.length === PARTNER_COMPLEMENTARITY_AXES.length
}

/** #2165.55 — même patron que `passesExpertiseKnown` (`discover-filters.ts`) :
 *  décoché, aucune contrainte ; coché, écarte les candidats dont la
 *  complémentarité reste totalement inconnue, jamais ceux notés 0. */
export function passesComplementarityKnown(
  complementarity: PartnerComplementarityScore | null,
  complementarityKnownOnly: boolean,
): boolean {
  if (!complementarityKnownOnly) return true
  return !isComplementarityUnknown(complementarity)
}
