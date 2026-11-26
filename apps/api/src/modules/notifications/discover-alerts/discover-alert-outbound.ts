import type { DiscoverAlertOutboundChannel } from '@bellum/contracts'
import type { MailerService } from '../../mailer/mailer.service'
import type { SmsSender } from '../sms/sms-sender'

/**
 * LE PORT D'ENVOI DES ALERTES DE DÉCOUVRIR — 15/09/2026, décision 7 de Louis.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * « SANS CLÉ = NO-OP STRICT », ET CE QUE ÇA VEUT DIRE EXACTEMENT
 * ─────────────────────────────────────────────────────────────────────────────
 * Pas « une erreur attrapée » : **zéro appel réseau**. `configuredFor` répond
 * AVANT toute tentative, et l'appelant s'arrête dessus — de la même façon que
 * `SmsChannelService.dispatch` s'arrête sur `sender.configured` avant même de
 * lire une ligne de base.
 *
 * Et surtout **jamais un faux succès** : `send` appelé sans clé LÈVE. Un port
 * qui rendrait `void` en silence transformerait « rien n'est parti » en « tout
 * va bien », qui est la forme la plus coûteuse du défaut — elle se découvre
 * chez le destinataire qui n'a rien reçu, des semaines plus tard.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES DEUX CLÉS, ET POURQUOI CE SONT CELLES-LÀ
 * ─────────────────────────────────────────────────────────────────────────────
 * - **e-mail** : `RESEND_API_KEY`, la clé qui PAIE l'envoi réel. Le transport
 *   de capture locale (dev) n'est pas une alternative : une alerte qui tombe
 *   dans une boîte de développement n'a atteint personne, et la faire compter
 *   comme un envoi rendrait le canal intestable.
 * - **SMS** : le port `SmsSender`, dont `SMS_PROVIDER_API_KEY` est déjà le seul
 *   interrupteur. On REPREND cette forme, on ne la réinvente pas — une seconde
 *   façon de dire « le SMS est branché » divergerait de la première.
 *
 * Les deux canaux sont indépendants : une clé posée n'en allume jamais deux.
 *
 * Ce fichier ne nomme aucun fournisseur dans ce qui part : le nom d'un
 * fournisseur ne sort ni à l'écran, ni dans un message, ni dans un prompt.
 */

export const DISCOVER_ALERT_OUTBOUND = Symbol('DISCOVER_ALERT_OUTBOUND')

type DiscoverAlertOutboundMessage =
  | {
      channel: 'email'
      to: string
      subject: string
      heading: string
      bodyLines: string[]
      ctaUrl?: string
      ctaLabel?: string
      /** L'expéditeur de l'espace (marque blanche), quand l'appelant le connaît. */
      from?: string | null
    }
  | { channel: 'sms'; to: string; text: string }

export type DiscoverAlertOutbound = {
  /** Une clé existe-t-elle pour CE canal ? `false` = rien à lire, rien à tenter. */
  configuredFor(channel: DiscoverAlertOutboundChannel): boolean
  /** #4016 L12 — ce numéro est-il dans un pays autorisé (`SMS_ALLOWED_COUNTRY_CODES`) ? */
  allowsSmsRecipient(e164: string): boolean
  /** Envoie — ou LÈVE. Ne rend jamais « ça s'est bien passé » sans envoi. */
  send(message: DiscoverAlertOutboundMessage): Promise<void>
}

function notConfigured(channel: DiscoverAlertOutboundChannel): Error {
  return new Error(
    `Aucun fournisseur n’est branché pour le canal « ${channel} » : cet envoi n’aurait jamais dû être tenté.`,
  )
}

export function createDiscoverAlertOutbound(
  env: Record<string, string | undefined>,
  mailer: Pick<MailerService, 'sendNotificationEmail'>,
  sms: SmsSender,
): DiscoverAlertOutbound {
  const emailConfigured = (env['RESEND_API_KEY'] ?? '').trim().length > 0

  const configuredFor = (channel: DiscoverAlertOutboundChannel): boolean =>
    channel === 'email' ? emailConfigured : sms.configured

  return {
    configuredFor,
    allowsSmsRecipient: (e164: string): boolean => sms.allowsCountry(e164),
    async send(message: DiscoverAlertOutboundMessage): Promise<void> {
      if (!configuredFor(message.channel)) throw notConfigured(message.channel)

      if (message.channel === 'email') {
        await mailer.sendNotificationEmail({
          to: message.to,
          subject: message.subject,
          heading: message.heading,
          bodyLines: message.bodyLines,
          ...(message.ctaUrl ? { ctaUrl: message.ctaUrl } : {}),
          ...(message.ctaLabel ? { ctaLabel: message.ctaLabel } : {}),
          ...(message.from ? { from: message.from } : {}),
        })
        return
      }

      await sms.send({ to: message.to, text: message.text })
    },
  }
}
