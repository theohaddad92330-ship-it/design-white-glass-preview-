import type { LinkKind } from '@bellum/contracts'
import { PERSONAL_LINK_STALE_AFTER_DAYS, isLinkKindCitable } from '@bellum/contracts'

/**
 * LAU-FINAL-088 — WARM INTRO, REFERRAL ET PERMISSION GOVERNANCE (#2373).
 *
 * Logique pure, sans état ni appel réseau : ce qui décide si une introduction
 * PEUT se citer et si une relation est
 * trop ancienne pour être réutilisée telle quelle. La source de vérité (le
 * lien réel, l'autorisation obtenue) vient toujours du serveur
 * (`IntroductionAuthorizationService`, #2373.9) — ces fonctions ne
 * l'inventent jamais, elles appliquent la règle une fois la preuve en main.
 */

/**
 * #2373.1 / #2373.5 — ne JAMAIS citer un référent (« de la part de X ») sans
 * DEUX preuves cumulées : un lien d'un type citable une fois vérifié
 * (`isLinkKindCitable`, #2373.2 — exclut d'office homonymie/relation
 * probable), ET une confirmation EXPLICITE du référent lui-même. L'une sans
 * l'autre reste un refus.
 */
export function canCiteReferrer(args: { linkKind: LinkKind; verified: boolean; referrerConfirmed: boolean }): boolean {
  return isLinkKindCitable(args.linkKind, args.verified) && args.referrerConfirmed
}

/**
 * #2373.8 — un « chemin possible » (on sait qu'on POURRAIT demander) n'est
 * jamais confondu avec un « accord confirmé » (le référent a dit oui). La
 * seule preuve qui fait basculer l'un vers l'autre est la confirmation — un
 * type de lien favorable ne suffit pas à lui seul.
 */
type IntroPathState = 'potential_path' | 'confirmed_agreement'
export function describeIntroPath(args: { referrerConfirmed: boolean }): IntroPathState {
  return args.referrerConfirmed ? 'confirmed_agreement' : 'potential_path'
}

/**
 * #2373.7 — au-delà de ce seuil, un accord obtenu alors ne dit plus rien
 * d'aujourd'hui (le référent a pu changer d'avis, d'entreprise, de contexte).
 * ~6 mois : le même ordre de grandeur que la fraîcheur attendue d'un signal
 * commercial ailleurs dans ce dépôt, pas une valeur mesurée à part.
 *
 * #3403.7 — RÉEXPORTÉ depuis `@bellum/contracts` (`PERSONAL_LINK_STALE_AFTER_DAYS`) :
 * un réglage vit à un seul endroit (GA-26). `account-access.service.ts` calcule
 * la fraîcheur des voies d'accès personnelles sur le MÊME seuil, deux copies
 * auraient fini par diverger au premier ajustement.
 */
export const RELATION_STALE_AFTER_DAYS = PERSONAL_LINK_STALE_AFTER_DAYS

/**
 * Une relation qu'on n'a JAMAIS fait autoriser n'est pas un cas de
 * réutilisation — c'est un cas neuf, géré par les étapes 1 à 5. Cette
 * fonction ne s'applique qu'à une relation qu'on s'apprête à RÉUTILISER.
 */
export function needsRequalification(args: { lastAuthorizedAt: string | null; today: string }): boolean {
  if (!args.lastAuthorizedAt) return false
  const last = new Date(args.lastAuthorizedAt).getTime()
  const today = new Date(args.today).getTime()
  if (Number.isNaN(last) || Number.isNaN(today)) return false
  const diffDays = (today - last) / (1000 * 60 * 60 * 24)
  return diffDays > RELATION_STALE_AFTER_DAYS
}
