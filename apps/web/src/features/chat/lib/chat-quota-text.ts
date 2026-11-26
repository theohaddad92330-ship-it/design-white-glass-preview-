import type { ChatQuotaLimitSource } from '@bellum/contracts'
import type { TFunction } from 'i18next'
import { i18n } from '@/i18n'

/**
 * #1957.8 → .10 — CE QUE L'ÉCRAN DIT AU PLAFOND DE LAURA.
 *
 * La phrase du serveur (« Plafond du copilote atteint… Il se réouvre au fil des
 * heures ») disait POURQUOI, jamais QUAND. L'instant voyage désormais en donnée
 * (`reopensAt`, calculé sur la fenêtre glissante réelle) et se formate ICI, dans
 * le fuseau et la langue du navigateur — les deux choses que l'API n'a pas.
 *
 * Quatre phrases, dans l'ordre où la personne en a besoin :
 *  1. le plafond atteint ;
 *  2. QUAND il se rouvre — ou « au fil des heures » si le serveur n'a pas pu le
 *     calculer : jamais une heure devinée ;
 *  3. ce qui reste utilisable — vérifié : seul `POST /ia/chat` passe par
 *     `assertChatQuota` ; écrans, recherche, fiches, analyses, enrichissements,
 *     exports et actions déjà préparées ont leurs propres routes ;
 *  4. le plan, SANS rien vendre — décision Louis 13/09 batch 13 : le plafond
 *     dépend du plan. Quand c'est lui qui borne (`limitSource: 'plan'`), la
 *     phrase le dit et renvoie à la page de facturation pour ce que comprend le
 *     plan de la personne. Quand c'est le plafond de SÉCURITÉ de l'opérateur
 *     qui borne, ou qu'une API d'avant n'envoie pas la source : rien sur le
 *     plan — « c'est le plafond de ton plan » y serait faux.
 */

type QuotaRefusal = { limit: number; reopensAt: Date | null; limitSource?: ChatQuotaLimitSource }

function sameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

/**
 * QUAND le plafond se rouvre, en une phrase. Aujourd'hui ou demain seulement —
 * la fenêtre fait 24 h. Un instant absent, déjà passé (horloge décalée) ou hors
 * de la fenêtre retombe sur « au fil des heures ».
 */
export function chatQuotaReopening(
  t: TFunction<'chat'>,
  reopensAt: Date | null,
  options: { language?: string; now?: Date } = {},
): string {
  const now = options.now ?? new Date()
  if (!reopensAt || !Number.isFinite(reopensAt.getTime()) || reopensAt.getTime() <= now.getTime()) {
    return t('quota.reopensGradually')
  }
  const locale = (options.language ?? i18n.language) === 'fr' ? 'fr-FR' : 'en-GB'
  const time = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(reopensAt)
  if (sameLocalDay(reopensAt, now)) return t('quota.reopensToday', { time })
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  if (sameLocalDay(reopensAt, tomorrow)) return t('quota.reopensTomorrow', { time })
  return t('quota.reopensGradually')
}

/**
 * Le refus complet. `billingLink` : la surface rend-elle le markdown ? L'écran
 * `/chat` oui (`StructuredReply`), la bulle non — un lien y afficherait sa
 * syntaxe brute.
 */
export function chatQuotaReachedText(
  t: TFunction<'chat'>,
  refusal: QuotaRefusal,
  options: { language?: string; now?: Date; billingLink: boolean },
): string {
  const sentences = [
    t('quota.reached', { count: refusal.limit }),
    chatQuotaReopening(t, refusal.reopensAt, options),
    t('quota.stillAvailable'),
  ]
  // décision Louis 13/09 batch 13 — plafond selon le plan
  if (refusal.limitSource === 'plan') {
    sentences.push(t(options.billingLink ? 'quota.planLimitLink' : 'quota.planLimit'))
  }
  return sentences.join(' ')
}
