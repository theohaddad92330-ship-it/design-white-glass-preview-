import { readSkillSearch } from '@bellum/contracts'
import type { DiscoverRequest } from '@/features/discover/hooks/useDiscoverSearch'
import type { DiscoverResponse } from './discover-types'

/* ------------------------------------------------------------------ */
/*  #4305 — la recherche en DEUX TEMPS.                                 */
/*                                                                     */
/*  Les sources du registre ne tolèrent pas autant d'appels qu'on le    */
/*  voudrait en une seule requête : le premier passage s'arrête à son   */
/*  budget de temps et le DIT (`degraded[].reason = 'time_budget'` sur  */
/*  une source du registre). Le second passage rejoue la MÊME recherche */
/*  — les pages déjà lues reviennent du cache partagé, seul le reste    */
/*  coûte un appel — et COMPLÈTE la liste. Il ne la remplace jamais.    */
/* ------------------------------------------------------------------ */

/** Les sources dont le budget de temps coupe la LISTE (pas les offres, pas le modèle d'angle). */
const LIST_SOURCES: ReadonlySet<string> = new Set(['pappers', 'recherche-entreprises'])

export function needsSecondPass(request: DiscoverRequest | null, data: DiscoverResponse | undefined): boolean {
  if (request?.mode !== 'registry' || !data) return false
  // #4419.4 — une recherche par compétence coupée par le délai (employeurs non tentés, sources non lues) : le
  // second passage relit le cache (identités 30 j, lectures d'offres 24 h) et va plus loin.
  if (readSkillSearch(data.query)?.deadlineCut === true) return true
  return data.degraded.some(entry => LIST_SOURCES.has(entry.source) && entry.reason === 'time_budget')
}

/**
 * #4305 — la contrainte se LIT : ce que le premier passage a déjà cherché, et ce qui reste à chercher.
 * Le web AFFICHE ce que le moteur a compté (`degraded`, `skillSearch.notAttempted`), il ne devine rien.
 * Une absence est `null` (jamais « 0 »), et aucun compteur de crédits n'existe ici : les crédits sont IMPLICITES.
 */
export type SecondPassScope = {
  /** Comptes déjà cherchés et affichés ; `null` quand il n'y en a aucun. */
  shown: number | null
  /** La suite de la liste d'entreprises a été coupée par le budget de temps. */
  listRemains: boolean
  /** Employeurs dont les offres n'ont pas encore été lues (recherche par compétence) ; `null` si aucun. */
  employersRemain: number | null
  /** Lot Q — un second passage tourne en arrière-plan : les employeurs restants sont « en cours de vérification ». */
  completing: boolean
}

export function secondPassScope(data: DiscoverResponse | undefined): SecondPassScope | null {
  if (!data) return null
  const skill = readSkillSearch(data.query)
  const unread = skill?.deadlineCut === true ? skill.notAttempted : undefined
  return {
    shown: data.candidates.length > 0 ? data.candidates.length : null,
    listRemains: data.degraded.some(entry => LIST_SOURCES.has(entry.source) && entry.reason === 'time_budget'),
    employersRemain: unread !== undefined && unread > 0 ? unread : null,
    completing: data.completing === true,
  }
}

/**
 * La liste du premier passage reste EN TÊTE dans son ordre (l'écran ne réordonne pas ce qu'on lit) ;
 * les comptes que le second passage trouve en plus s'ajoutent derrière. Les sources dégradées sont celles
 * du second passage : plus récentes, elles disent ce qui manque ENCORE.
 */
export function mergeSecondPass(
  first: DiscoverResponse,
  second: DiscoverResponse,
): { merged: DiscoverResponse; added: number } {
  const known = new Set(first.candidates.map(candidate => candidate.siren))
  const extra = second.candidates.filter(candidate => !known.has(candidate.siren))
  // #4419.4 — les compteurs de la recherche par compétence (et ses cabinets / ESN) sont ceux du second passage :
  // plus récents, ils disent ce qui manque ENCORE, comme `degraded`.
  const skill = readSkillSearch(second.query) ? { skillSearch: second.query.skillSearch } : {}
  const intermediaries = second.skillIntermediaries ? { skillIntermediaries: second.skillIntermediaries } : {}
  const pending = second.skillPendingEmployers ? { skillPendingEmployers: second.skillPendingEmployers } : {}
  return {
    merged: {
      ...first,
      ...intermediaries,
      ...pending,
      query: { ...first.query, ...skill },
      candidates: [...first.candidates, ...extra],
      degraded: second.degraded,
    },
    added: extra.length,
  }
}
