import type { Contact } from '@bellum/contracts'
import { missingEnrichmentChannels } from '@bellum/contracts'
import {
  Building2,
  ClipboardList,
  Handshake,
  IdCard,
  Linkedin,
  Mail,
  MailPlus,
  Phone,
  Share2,
  UserPlus,
  type LucideIcon,
} from 'lucide-react'
import { i18n } from '@/i18n'
import type { EngagementChannel, PreparedOnlyChannel, SendableChannel } from './types'

/** Les canaux qui portent un message à envoyer depuis le composer — tous les autres se préparent seulement. */
const SENDABLE_CHANNELS: ReadonlySet<EngagementChannel> = new Set(['email', 'linkedin', 'phone'])

/** Les canaux qui se rédigent sans s'envoyer (#2123.72 tâche, #2204.40 / #2204.41, #2370). */
export function isPreparedOnlyChannel(channel: EngagementChannel): channel is PreparedOnlyChannel {
  return !SENDABLE_CHANNELS.has(channel)
}

/** Les canaux dont le brouillon porte un objet (#2123.72 l'intitulé d'une tâche ; #2370 suivi et push de profil). */
export function channelHasSubject(channel: EngagementChannel): boolean {
  return channel === 'email' || channel === 'task' || channel === 'follow_up_email' || channel === 'profile_push'
}

export function getAvailableChannels(contact: Contact): EngagementChannel[] {
  return [
    contact.email ? 'email' : null,
    contact.linkedin_url ? 'linkedin' : null,
    contact.phone ? 'phone' : null,
    // #2123.72 — la tâche de prise de contact ne demande aucune coordonnée, mais
    // elle vit dans le plan d'un COMPTE : sans compte, elle n'a nulle part où aller.
    contact.account_id ? 'task' : null,
    // #2204.40 — la recommandation vit dans le plan d'un compte.
    contact.account_id ? 'recommendation' : null,
    // #2370 — chaque canal préparé demande la coordonnée par laquelle le commercial l'enverra lui-même.
    contact.linkedin_url ? 'linkedin_connection_note' : null,
    contact.email ? 'follow_up_email' : null,
    // L'introduction, le message partenaire et le push de profil vivent dans le plan d'un compte.
    contact.account_id ? 'introduction_request' : null,
    contact.account_id ? 'partner_message' : null,
    contact.account_id ? 'profile_push' : null,
  ].filter((channel): channel is EngagementChannel => channel !== null)
}

/**
 * #2370 (recette R41) — les canaux du MENU « Contacter » : `getAvailableChannels` (ce qui est joignable) PLUS ce qui
 * se PRÉPARE sans coordonnée — la note de connexion LinkedIn toujours et l'appel même sans numéro révélé
 * (`channelNeedsPhoneReveal` le dit sur la ligne). Rien ne part d'ici : le commercial envoie lui-même. Le reste du
 * produit (CTA relationnel, chronologie, reprise d'un brouillon) continue de lire `getAvailableChannels` : un
 * contact sans coordonnée n'y devient pas « joignable ».
 */
export function getMenuChannels(contact: Contact): EngagementChannel[] {
  const available = new Set(getAvailableChannels(contact))
  // LUDB.8 — l'appel aussi : son canal principal ne dépend pas d'un numéro déjà révélé.
  const always: ReadonlySet<EngagementChannel> = new Set(['phone', 'linkedin_connection_note'])
  return MENU_CHANNEL_ORDER.filter(channel => available.has(channel) || always.has(channel))
}

/** L'ordre du menu : celui de `getAvailableChannels`, avec la note LinkedIn à sa place. */
const MENU_CHANNEL_ORDER: readonly EngagementChannel[] = [
  'email',
  'linkedin',
  'phone',
  'task',
  'recommendation',
  'linkedin_connection_note',
  'follow_up_email',
  'introduction_request',
  'partner_message',
  'profile_push',
]

/** #2370 (R41) — l'appel proposé sans numéro : le menu le dit (« numéro à révéler »), préparer reste possible. */
export function channelNeedsPhoneReveal(contact: Contact, channel: EngagementChannel): boolean {
  return channel === 'phone' && !contact.phone
}

/**
 * #2123.72 — les seuls canaux qui portent un message à ENVOYER (la tâche n'en
 * est pas). C'est eux qui disent si un contact est JOIGNABLE : un contact sans
 * aucune coordonnée reste « à enrichir », même si une tâche peut être préparée.
 */
export function getSendableChannels(contact: Contact): SendableChannel[] {
  return getAvailableChannels(contact).filter((channel): channel is SendableChannel => !isPreparedOnlyChannel(channel))
}

/**
 * #2629.2 — `getAvailableChannels`/`getSendableChannels` disent CE QUI
 * EXISTE, jamais ce qui MANQUE : un contact réduit à LinkedIn se lisait comme
 * n'importe quel autre menu « Canaux disponibles », et un contact sans aucun
 * canal d'envoi pouvait se lire comme « injoignable » sans que l'écran le
 * dise. Doctrine : une absence ne s'affiche jamais « 0 » (GA-18/19), elle se
 * NOMME — et un réglage vit à un seul endroit (GA-26), d'où cette fonction
 * plutôt qu'un calcul répété à chaque appelant.
 */
/** Non exporté : aucun appelant hors de ce fichier ne le nomme — les deux
 *  consommateurs lisent le retour de `channelFallback`. (`lint:exports:types`) */
type ChannelFallback = 'linkedin-only' | 'none'

export function channelFallback(contact: Contact): ChannelFallback | null {
  const sendable = getSendableChannels(contact)
  if (sendable.length === 0) return 'none'
  if (sendable.length === 1 && sendable[0] === 'linkedin') return 'linkedin-only'
  return null
}

/** Délégué à `@bellum/contracts` : la même fonction sert au serveur pour
 *  enregistrer les canaux encore vides après une tentative d'enrichissement.
 *  Une seule définition = l'UI grise exactement ce que le serveur refuse. */
export function getMissingChannels(contact: Contact): EngagementChannel[] {
  return missingEnrichmentChannels(contact)
}

export function channelIcon(channel: EngagementChannel): LucideIcon {
  if (channel === 'phone') return Phone
  if (channel === 'task') return ClipboardList
  if (channel === 'recommendation') return Handshake
  if (channel === 'linkedin_connection_note') return UserPlus
  if (channel === 'follow_up_email') return MailPlus
  if (channel === 'introduction_request') return Share2
  if (channel === 'partner_message') return Building2
  if (channel === 'profile_push') return IdCard
  if (channel === 'linkedin') return Linkedin
  return Mail
}

export function channelLabel(channel: EngagementChannel): string {
  // i18n keys: channel.email | channel.linkedin | channel.phone | channel.task
  return i18n.t(`engagement:channel.${channel}`)
}

export function channelActionLabel(channel: EngagementChannel): string {
  // i18n keys: channel.action.email | channel.action.linkedin | channel.action.phone | channel.action.task
  return i18n.t(`engagement:channel.action.${channel}`)
}

/**
 * #2617.2 — le geste quand le texte EXISTE DÉJÀ.
 *
 * `channelActionLabel` dit « Préparer un email », et c'est juste là où il n'y a
 * encore rien à lire (le menu de canaux d'un contact). Ce n'était PAS juste
 * dans « Messages déjà préparés », qui ne liste que les personnes dont le
 * message est écrit : un lecteur attentif y a conclu, le 21/09/2026, qu'aucun
 * message n'était pré-rédigé — le bouton contredisait le titre de sa propre
 * carte et son sous-titre (« Relire, corriger, puis envoyer »).
 *
 * Deux verbes, donc, pour deux états — jamais un seul qui couvre les deux.
 */
export function channelReviewLabel(channel: EngagementChannel): string {
  // i18n keys: channel.review.email | channel.review.linkedin | channel.review.phone | channel.review.task
  return i18n.t(`engagement:channel.review.${channel}`)
}

export function composerLabel(channel: EngagementChannel): string {
  // i18n keys: channel.draft.email | channel.draft.linkedin | channel.draft.phone | channel.draft.task
  return i18n.t(`engagement:channel.draft.${channel}`)
}
