import { signalAgeDays } from './discover-presentation'
import { placesProfilesForClients, signalRelevance, type SalesProfileForRelevance } from '@bellum/contracts'
import type { DiscoverSignal } from './discover-types'

/**
 * #3597.6 — « POURQUOI MAINTENANT », la deuxième ligne d'un compte de /discover
 * (décision Louis 04/10/2026) : DEUX À TROIS signaux au plus, les plus récents
 * d'abord, les recrutements avant la vie juridique. Tous les signaux restent
 * lisibles dans le repliable de la ligne (`CandidateSignals`).
 *
 * Ce module ne fabrique rien : il choisit parmi les signaux DATÉS que la
 * recherche a ramenés. Aucun signal → liste vide → la ligne ne s'écrit pas
 * (« on n'affiche pas ce qu'on n'a pas »).
 *
 * #3923 — `profile`, optionnel : SANS lui, le classement reste identique à
 * avant ce lot (aucune régression). AVEC lui, un signal `hors_metier`
 * (`signalRelevance`, contre le profil DÉCLARÉ de l'espace — jamais un texte
 * deviné) passe systématiquement APRÈS tout signal `pertinent`/`non_evaluable`,
 * même la vie juridique. « Non évaluable » (profil muet, ou rien à comparer)
 * ne pénalise JAMAIS un signal — seule une preuve EXPLICITE (métier placé,
 * secteur refusé) le fait reculer.
 */
export const WHY_NOW_MAX_SIGNALS = 3

/**
 * #3923.a — le profil DÉCLARÉ qui classe et explique les signaux, lu dans les
 * réponses (`GET /onboarding/state`) : les métiers placés (`placed_roles`, enfin
 * transportés) et les secteurs refusés. Pas de réponses → `undefined` → le
 * classement d'avant. Une liste vide reste « non évaluable », jamais une pénalité.
 */
export function relevanceProfileFromAnswers(
  answers:
    | {
        placed_roles?: readonly string[] | null
        no_go_sectors?: readonly string[] | null
        recruits_for_clients?: string | null
      }
    | undefined,
  /** #3901.p — les métiers DÉDUITS (`GET /esn-profile/placed-roles-inference`), lus quand rien n'est déclaré. */
  inferred: readonly { role: string; terms?: readonly string[] }[] = [],
): SalesProfileForRelevance | undefined {
  if (!answers) return undefined
  const deduced = inferred.flatMap(({ role, terms }) => (terms && terms.length > 0 ? [{ role, terms }] : []))
  const base = {
    placedRoles: answers.placed_roles ?? [],
    noGoSectors: answers.no_go_sectors ?? [],
    ...(deduced.length > 0 ? { inferredPlacedRoles: deduced } : {}),
  }
  // #1124.1 — décision Louis 14/10/2026 : le placement en CDI voyage jusqu'au classement ; « no » ou muet = pas de clé.
  return placesProfilesForClients(answers.recruits_for_clients) ? { ...base, recruitsForClients: true } : base
}

/**
 * La vie juridique (BODACC…) passe APRÈS tout fait commercial, quelle que soit sa date.
 * #4045.1 — un signal qui recoupe le MOT-CLÉ de la recherche (`keywordMatch`, posé par
 * le serveur) passe avant tout : c'est ce que le commercial a demandé de voir.
 */
function rank(signal: DiscoverSignal, profile: SalesProfileForRelevance | undefined): number {
  if (signal.keywordMatch === true) return -1
  if (profile && signalRelevance(signal, profile).status === 'hors_metier') return 2
  return signal.type === 'legal' ? 1 : 0
}

interface WhyNowOptions {
  /**
   * #3906 — « Veolia : appel d'offres il y a 109 jours, ça n'a rien à voir
   * avec mon métier » (call bêta 08/10/2026, 19:27). Un signal plus vieux que
   * CETTE fenêtre n'est jamais présenté comme un déclencheur actuel — jamais
   * deviné : c'est la fenêtre de fraîcheur RÉELLEMENT choisie par
   * l'utilisateur (`UnifiedFilters.sinceDays`, 30/90/180 j). `undefined` =
   * aucune borne (comportement d'avant, à l'octet) : un appelant qui ne
   * connaît pas la fenêtre active (ex. un test qui ne la fournit pas) ne doit
   * pas en deviner une.
   *
   * ⚠️ Appliqué sur la date de PUBLICATION du signal, y compris pour un appel
   * d'offres : son ÉCHÉANCE compterait davantage (un AO publié il y a 109 j
   * mais qui clôture demain reste un déclencheur), mais aucune source ne
   * porte cette date au contrat (`DiscoverSignal` n'a pas de champ échéance) —
   * un seuil sur une donnée absente se deviendrait une date inventée.
   * `stillOpen` reste le seul fait d'échéance qu'on ait, et il écarte déjà
   * l'offre explicitement retirée juste au-dessus.
   */
  maxAgeDays?: number
  nowMs?: number
  /** #3923 — profil DÉCLARÉ de l'espace ; sans lui, classement inchangé. */
  profile?: SalesProfileForRelevance
}

/**
 * #3928.1 — « un signal sans date n'est pas récent » (même règle que l'axe score
 * et Laura, `isRecentSignal`) : une date illisible, ou la seule date de
 * DÉTECTION d'un signal historisé, ne fait pas un déclencheur actuel.
 */
export function hasOwnSignalDate(signal: DiscoverSignal, nowMs: number = Date.now()): boolean {
  return signal.dateIsDetection !== true && signalAgeDays(signal.date, nowMs) !== null
}

export function whyNowSignals(
  signals: readonly DiscoverSignal[],
  max: number = WHY_NOW_MAX_SIGNALS,
  { maxAgeDays, nowMs = Date.now(), profile }: WhyNowOptions = {},
): DiscoverSignal[] {
  return (
    [...signals]
      .filter(signal => signal.stillOpen !== false)
      .filter(signal => hasOwnSignalDate(signal, nowMs))
      .filter(signal => {
        if (maxAgeDays === undefined) return true
        const age = signalAgeDays(signal.date, nowMs)
        return age !== null && age <= maxAgeDays
      })
      .sort((a, b) => {
        const byRank = rank(a, profile) - rank(b, profile)
        if (byRank !== 0) return byRank
        // Plus récent d'abord (ISO lexicographique) ; un signal « retiré » de
        // l'offre (`stillOpen === false`) n'est pas un déclencheur actuel.
        return a.date < b.date ? 1 : a.date > b.date ? -1 : 0
      })
      // #3597.13 — même libellé + même date = même fait : un seul, avant de couper.
      .filter(
        (signal, index, all) =>
          all.findIndex(other => other.label === signal.label && other.date === signal.date) === index,
      )
      .slice(0, max)
  )
}

/** #4045.2 — les trois familles de la ligne « Pourquoi maintenant ». */
type WhyNowGroupKey = 'hiring' | 'business' | 'other'

/** #4045.9 — l'ordre d'affichage des familles quand elles sont rangées en liste (Besoins) : un seul réglage. */
export const WHY_NOW_GROUP_ORDER: readonly WhyNowGroupKey[] = ['hiring', 'business', 'other']

/** #4045.9 — la famille d'une NATURE de signal : la même définition pour « Pourquoi maintenant » et pour Besoins. */
export function signalFamilyOf(type: DiscoverSignal['type']): WhyNowGroupKey {
  if (type === 'hiring') return 'hiring'
  // `business` (projet, rachat, nomination, presse) ET `funding` (levée) sont la MÊME famille —
  // la vie de l'entreprise. #4045.1 (recette prod 14/10) — le backend distingue les deux types
  // pour garder la NATURE du fait (`discover.py:1549`, `_news_signal` : « une levée garde sa
  // nature, le reste est une actualité »), mais une levée de fonds EST un fait de vie de
  // l'entreprise : la laisser tomber dans « autres » (marchés et vie juridique) la mélangeait à
  // du BODACC alors que l'utilisateur la citait lui-même comme exemple (« levée, nomination,
  // rachat, déménagement »).
  if (type === 'business' || type === 'funding') return 'business'
  return 'other'
}
