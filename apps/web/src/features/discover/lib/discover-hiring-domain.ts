import {
  hasHiringRoles,
  hiringDomain,
  hiringDomainLabel,
  hiringScopeVerdict,
  isNonPlacedPosition,
  type SalesProfileForRelevance,
} from '@bellum/contracts'
import type { DiscoverSignal } from './discover-types'

/**
 * #3901.w — décision Louis 09/10/2026 : « tout dépend du secteur de l'entreprise ».
 * Les recrutements qui remontent et l'étiquette qu'ils portent suivent le profil
 * DÉCLARÉ de l'espace (`placed_roles`), via `hiringDomain` (contracts) — aucune
 * liste de secteurs inventée ici.
 *
 * ⚠️⚠️ RENVERSEMENT ASSUMÉ ET DATÉ — décision Louis 16/10/2026 (#3901.p), POUR DÉCOUVRIR :
 * « hors domaine = rang, jamais effacé » (#3901.w / #4088.7) ne tient plus. Une offre HORS des
 * métiers de l'ESN (déclarés, à défaut déduits) ne s'affiche pas sur la carte, ne pèse pas dans le
 * classement ni dans « Ce qui a pesé » (`scopeDiscoverHiring`, verdict `hiringScopeVerdict` de
 * contracts — UN prédicat, GA-26). Ni déclarés ni déduits : l'offre n'est pas un signal fort et
 * l'écran le DIT (`hiringScopeNotice`). Un poste que nulle ESN ne place (facteur, livreur…) sort
 * quel que soit le profil. La fiche compte garde « Autres recrutements (N) » replié (#3901.6).
 */
type WithSignals = { signals: readonly DiscoverSignal[]; outOfTrade?: boolean }

function hasDeclaredRoles(profile: SalesProfileForRelevance | undefined): profile is SalesProfileForRelevance {
  return Boolean(profile?.placedRoles.some(role => role.trim().length > 0))
}

/**
 * #3901.p — Découvrir ne garde que les offres dans les métiers de l'ESN. `hidden` = les offres retirées, pour la
 * ligne qui DIT pourquoi. L'existant en profite à la LECTURE : aucun rejeu.
 *
 * ⚠️ #4284.26 (décision 22, Louis 19/10/2026) RENVERSE « un compte qui n'a plus que des offres hors métier ne
 * remonte pas » : un compte HORS du métier de l'espace n'est JAMAIS écarté. Sur « Comptes qui recrutent »
 * (`dropEmpty`), celui dont il ne reste aucun signal est GARDÉ, marqué `outOfTrade`, rangé après les autres.
 */
export function scopeDiscoverHiring<T extends WithSignals>(
  items: readonly T[],
  profile: SalesProfileForRelevance | undefined,
  { dropEmpty }: { dropEmpty: boolean },
): { items: T[]; hidden: number } {
  let hidden = 0
  const out: T[] = []
  for (const item of items) {
    const kept = item.signals.filter(
      signal => signal.type !== 'hiring' || hiringScopeVerdict(signal.label, profile).keep,
    )
    const removed = item.signals.length - kept.length
    if (removed === 0) {
      out.push(item)
      continue
    }
    hidden += removed
    // #4284.26 — jamais écarté : « hors de ton métier » se DIT, il ne se cache pas. Hors « Comptes qui recrutent »,
    // la marque n'est posée que si CHAQUE offre retirée est hors métier pour un métier CONNU (`isOutOfTradeHiring`) :
    // un métier inconnu ne marque rien (on n'affiche pas ce qu'on n'a pas).
    const allOffTrade = item.signals
      .filter(signal => !kept.includes(signal))
      .every(signal => isOutOfTradeHiring(signal, profile))
    const mark = kept.length === 0 && (dropEmpty || allOffTrade)
    out.push({ ...item, signals: kept, ...(mark ? { outOfTrade: true } : {}) })
  }
  return { items: outOfTradeLast(out), hidden }
}

/** #4284.26 — les comptes marqués hors métier passent APRÈS tous les autres, quel que soit le tri (partition stable). */
export function outOfTradeLast<T extends { outOfTrade?: boolean }>(items: readonly T[]): T[] {
  return [...items.filter(item => item.outOfTrade !== true), ...items.filter(item => item.outOfTrade === true)]
}

/**
 * #1124.1 — décision Louis 14/10/2026 : `recruitsForClients` GAGNE sur #3901.w. Un espace qui place des CDI
 * chez ses clients n'a aucune offre « hors domaine » : le rang et le bandeau ne s'appliquent pas. Les
 * étiquettes, elles, continuent de nommer le métier placé quand une offre le recoupe.
 */
function restrictsToDomain(profile: SalesProfileForRelevance | undefined): profile is SalesProfileForRelevance {
  return hasDeclaredRoles(profile) && profile.recruitsForClients !== true
}

/** 0 = un recrutement dans le domaine · 1 = pas de recrutement · 2 = recrute, hors domaine. */
function tier(item: WithSignals, profile: SalesProfileForRelevance): 0 | 1 | 2 {
  const offers = item.signals.filter(signal => signal.type === 'hiring')
  if (offers.length === 0) return 1
  return offers.some(signal => hiringDomain(signal, profile) !== null) ? 0 : 2
}

/** Combien de recrutements de l'item tombent dans un métier placé déclaré. */
function domainHits(item: WithSignals, profile: SalesProfileForRelevance): number {
  return item.signals.filter(signal => signal.type === 'hiring' && hiringDomain(signal, profile) !== null).length
}

export function rankByHiringDomain<T extends WithSignals>(
  items: readonly T[],
  profile: SalesProfileForRelevance | undefined,
): T[] {
  if (!restrictsToDomain(profile)) return [...items]
  // Array.prototype.sort est stable : l'ordre d'origine (le tri choisi, ex. « Taille ») départage les égalités.
  // #3901.w (recette 10/10) — le rang par domaine PRIME sur le tri secondaire : dans le palier « dans le
  // domaine », le compte qui recrute le plus dans les métiers placés passe d'abord, avant l'effectif.
  return [...items].sort((a, b) => {
    const byTier = tier(a, profile) - tier(b, profile)
    if (byTier !== 0) return byTier
    return tier(a, profile) === 0 ? domainHits(b, profile) - domainHits(a, profile) : 0
  })
}

/**
 * #3901.w (recette 10/10) — l'étiquette NOMME le métier placé, l'intitulé vient après :
 * « Recrutement Data — Data engineer ». Un libellé qui porte déjà un genre de recrutement
 * (« Recrutement IT », « Poste ouvert », « Offre publiée ») le voit remplacé par
 * `hiringDomainLabel` (contracts) ; un intitulé nu est préfixé.
 */
function withDomain(label: string, domain: string): string {
  const named = hiringDomainLabel(label, domain)
  return named !== label ? named : `Recrutement ${domain} — ${label}`
}

export function hiringSignalLabel(signal: DiscoverSignal, profile: SalesProfileForRelevance | undefined): string {
  if (!hasDeclaredRoles(profile)) return signal.label
  const domain = hiringDomain(signal, profile)
  return domain ? withDomain(signal.label, domain) : signal.label
}

// ── Jumeaux de Découvrir (veille du compte, /mes-cibles) — #3901.w ───────────────────
// Mêmes fonctions de `@bellum/contracts` (`hiringDomain`, `hiringDomainLabel`), jamais une
// liste recopiée (GA-26). Entrée structurelle `{ type, label }` : un signal de veille, une
// ligne de Mes cibles et un signal de Découvrir se lisent pareil.
type TypedSignal = { type: string; label: string }

/** Le genre porte « recrutement » : `hiring` (contrat) ou le type libre d'une analyse (« Recrutement IT »). */
export function isHiringKind(type: string): boolean {
  return /^(hiring|recrut|job|emploi)/i.test(type.trim())
}

/** #3901.w (recette 10/10) — la veille du compte écrit « Poste ouvert — … » / « Offre publiée … » sous un type libre. */
export function isHiringSignal(signal: TypedSignal): boolean {
  if (isHiringKind(signal.type)) return true
  // Un genre explicitement AUTRE (marché, attribution, légal…) n'est jamais réétiqueté.
  if (/^(tender|award|legal|tech|business)$/i.test(signal.type.trim())) return false
  return /^(?:Poste ouvert|Offre publiée)(?=\s|:|$)/i.test(signal.label.trim())
}

function domainOf(signal: TypedSignal, profile: SalesProfileForRelevance): string | null {
  return isHiringSignal(signal) ? hiringDomain({ type: 'hiring', label: signal.label }, profile) : null
}

/**
 * #4088.7 — une offre de recrutement HORS du domaine déclaré de l'ESN : le même
 * prédicat que {@link rankOffDomainHiringLast} et {@link hiringNoticeForSignals}
 * (GA-26), exposé pour que « Mes cibles » l'écarte. Profil muet ⇒ `false` : sans
 * domaine déclaré on ne peut pas dire qu'une offre est « hors domaine ».
 */
export function isOffDomainHiringSignal(signal: TypedSignal, profile: SalesProfileForRelevance | undefined): boolean {
  // #3901.p (Louis 16/10) — le MÊME verdict que Découvrir : hors métier (déclaré, sinon déduit), poste non placé, ou aucun métier.
  if (!isHiringSignal(signal)) return false
  const verdict = hiringScopeVerdict(signal.label, profile)
  if (verdict.keep) return false
  // #1124.1 (Louis 14/10) gagne sur #4398.1 (28/10) pour le RANG et la MARQUE : un profil qui place des CDI chez ses
  // clients ne voit aucune offre « hors domaine » — seul un poste que nulle ESN ne place (`non_placed`) reste hors.
  // #4398.1 ne joue que sur le compte « du métier » de Découvrir (`hiringScopeVerdict` lu tel quel), pas ici.
  if (profile?.recruitsForClients === true) return verdict.reason === 'non_placed'
  return true
}

/**
 * #4284.10 (recette 21/10, L2) — une offre « hors de ton métier » se DIT, elle ne se cache pas. Marquée seulement
 * quand l'espace a un métier à comparer (déclaré ou déduit) et ne place pas pour ses clients : sans profil, on ne
 * marque rien ; `recruitsForClients` garde tout, sans marque. UN prédicat pour /mes-cibles, la fiche compte
 * (Opportunités, Veille) et Découvrir (GA-26).
 */
export function isOutOfTradeHiring(signal: TypedSignal, profile: SalesProfileForRelevance | undefined): boolean {
  // #4403.1 — un poste que nulle ESN ne place (facteur, hôte de vente…) est hors métier QUEL QUE SOIT le profil :
  // placeur en CDI ou profil sans métier compris, que le garde-fou ci-dessous laissait sans marque.
  // #4403.1 (recette prod 23/10) — et AUSSI tant que le profil n'est pas lu (déduction lente ou en échec, rien de
  // déclaré) : `hiringScopeVerdict` retire déjà ces postes sans profil ; la marque ne dépend pas d'un profil chargé.
  if (isHiringSignal(signal) && isNonPlacedPosition(signal.label)) return true
  if (!profile || profile.recruitsForClients === true || !hasHiringRoles(profile)) return false
  return isHiringSignal(signal) && !hiringScopeVerdict(signal.label, profile).keep
}

export function hiringDisplayLabel(signal: TypedSignal, profile: SalesProfileForRelevance | undefined): string {
  if (!hasDeclaredRoles(profile)) return signal.label
  const domain = domainOf(signal, profile)
  return domain ? withDomain(signal.label, domain) : signal.label
}

/** Veille du compte : les offres hors métier passent en fin (ordre stable) — c'est la fiche compte, rien n'y est retiré. */
export function rankOffDomainHiringLast<T>(
  items: readonly T[],
  profile: SalesProfileForRelevance | undefined,
  read: (item: T) => TypedSignal,
): T[] {
  const isOff = (item: T) => isOffDomainHiringSignal(read(item), profile)
  return [...items.filter(item => !isOff(item)), ...items.filter(isOff)]
}

export function hiringNoticeForSignals(
  signals: readonly TypedSignal[],
  profile: SalesProfileForRelevance | undefined,
): HiringDomainNotice | null {
  if (!profile || profile.recruitsForClients === true) return null
  const offers = signals.filter(isHiringSignal)
  if (offers.length === 0) return null
  if (!hasHiringRoles(profile)) return { kind: 'noRoles' }
  const count = offers.filter(signal => isOffDomainHiringSignal(signal, profile)).length
  return count > 0 ? { kind: 'offDomain', count } : null
}

/**
 * #3901.p — la ligne courte : `noRoles` = aucun métier déclaré ni déduit, les offres d'emploi ne sont pas un
 * signal fort (« on n'affiche pas ce qu'on n'a pas », avec un lien vers le réglage des métiers) ; `offDomain`
 * (veille du compte seulement) = des offres hors métier restent listées en fin.
 */
export type HiringDomainNotice = { kind: 'noRoles' } | { kind: 'offDomain'; count: number } | { kind: 'profileError' }

/** « Comptes qui recrutent » : la ligne n'apparaît que si des offres ont été retirées faute de métiers. */
export function hiringScopeNotice(
  profile: SalesProfileForRelevance | undefined,
  hidden: number,
): HiringDomainNotice | null {
  if (!profile || profile.recruitsForClients === true || hidden === 0) return null
  return hasHiringRoles(profile) ? null : { kind: 'noRoles' }
}
