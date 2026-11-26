import { isDiscoverOriginCriteriaEmpty, stripFieldKeyPrefix, type DiscoverOriginCriteria } from '@bellum/contracts'
import { sortSignalsByDate } from './discover-normalize'
import { hasOwnSignalDate } from './discover-why-now'
import type { DiscoverCandidate } from './discover-types'

/* ------------------------------------------------------------------ */
/*  « Analyser » — transport du CONTEXTE vers /search.                  */
/*                                                                     */
/*  L'écran v1 naviguait avec le seul `company`. L'angle, le score et   */
/*  les rôles suggérés étaient jetés, alors même que la route /search   */
/*  accepte déjà `suggestionId` / `suggestionReason` (searchSchema).    */
/*  Ce module est le pont manquant.                                    */
/* ------------------------------------------------------------------ */

/** Préfixe traçant l'origine « Découvrir » d'un brouillon d'analyse. */
export const DISCOVER_SUGGESTION_PREFIX = 'discover:'

const MAX_REASON_LENGTH = 240

/** Paramètres acceptés par `searchSchema` (routes/search/index.tsx). */
interface AnalyzeSearchParams {
  company: string
  suggestionId: string
  suggestionReason?: string
  /** #3910 — même raison, posée aussi comme preset structuré « stratégique » :
   *  c'est elle qui préremplit le champ visible du composeur, pas seulement la
   *  trace d'origine (`suggestionReason`, purement analytique). */
  preset?: 'strategic'
  prioritizationReason?: string
  /** #3819 (lot RBB, décision Louis 11/10) — secteur/zone/effectif/signal posés
   *  ET satisfaits : persistés sur le compte, transmis au run, réaffichés. */
  suggestionCriteria?: DiscoverOriginCriteria
}

function truncate(raw: string): string {
  // #4655 — jamais la clé technique (`prioritizationReason: …`) devant la phrase : l'utilisateur lit la phrase.
  const value = stripFieldKeyPrefix(raw)
  return value.length <= MAX_REASON_LENGTH ? value : `${value.slice(0, MAX_REASON_LENGTH - 1).trimEnd()}…`
}

/**
 * Le « pourquoi » le plus fort dont on dispose, par ordre de valeur commerciale :
 * l'angle suggéré, sinon le signal le plus récent (daté = actionnable), sinon
 * les facteurs de score positifs. Aucune justification inventée : si rien ne
 * justifie la suggestion, on n'envoie pas de raison.
 */
function suggestionReasonFor(candidate: DiscoverCandidate): string | undefined {
  const angle = candidate.angle?.trim()
  if (angle) return truncate(angle)

  // #3928.1 — seul un signal à date PROPRE dit « pourquoi maintenant ».
  const freshest = sortSignalsByDate(candidate.signals.filter(signal => hasOwnSignalDate(signal)))[0]
  if (freshest) return truncate(freshest.label)

  const positives = candidate.scoreFactors
    .filter(f => f.points > 0)
    .slice(0, 3)
    .map(f => f.label)
  return positives.length > 0 ? truncate(positives.join(' · ')) : undefined
}

/**
 * Candidat → paramètres de navigation `/search`.
 *
 * `suggestionId` est dérivé du SIREN : stable, unique, et il dit d'où vient le
 * brouillon. Côté Search, ces deux champs ne font que TRACER l'origine — ils
 * n'imposent rien et sont purgés dès que l'utilisateur édite le nom.
 */
export function buildAnalyzeSearch(
  candidate: DiscoverCandidate,
  // #3819 (lot RBB) — les critères posés ET satisfaits (`discoverOriginCriteriaFor`).
  criteria?: DiscoverOriginCriteria,
): AnalyzeSearchParams {
  const suggestionReason = suggestionReasonFor(candidate)
  return {
    company: candidate.name,
    suggestionId: `${DISCOVER_SUGGESTION_PREFIX}${candidate.siren}`,
    ...(suggestionReason ? { suggestionReason, preset: 'strategic', prioritizationReason: suggestionReason } : {}),
    ...(criteria && !isDiscoverOriginCriteriaEmpty(criteria) ? { suggestionCriteria: criteria } : {}),
  }
}
