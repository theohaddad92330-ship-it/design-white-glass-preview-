import { z } from 'zod'

/**
 * Par quel canal une relance de relevé d'activité part (PDF 5 §7).
 *
 * Le document liste quatre canaux et pose une règle qui a l'air anodine et ne
 * l'est pas : **jamais de « brouillon Teams »**. Un brouillon suppose un
 * endroit où il attend et une main qui l'envoie ; une messagerie d'équipe
 * n'offre ni l'un ni l'autre. Annoncer « brouillon préparé » sur un canal qui
 * n'en a pas laisse quelqu'un attendre un envoi qui ne partira jamais.
 *
 * D'où la forme de ce fichier : le canal n'est pas un réglage qu'on choisit
 * dans une liste, c'est une CONCLUSION tirée de ce qui est réellement branché.
 * Un canal proposé sans connecteur derrière est un bouton qui ne fait rien.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE LE PDF 6 §5.3 A CORRIGÉ ICI
 * ─────────────────────────────────────────────────────────────────────────
 * Quatre défauts, trouvés en croisant le PDF 6 avec ce fichier écrit deux jours
 * plus tôt. Aucun n'était visible :
 *
 *  1. **Une capacité de chat trop large.** `capabilities.chat` valait « une
 *     intégration sortante quelconque est active » — donc un webhook Zapier
 *     faisait passer un espace sans messagerie d'équipe pour un espace qui en
 *     a une. Le champ demande maintenant une messagerie d'ÉQUIPE nommée.
 *  2. **Un brouillon annoncé sans vérifier qu'il est possible.** Une connexion
 *     de messagerie ne dit pas que le jeton autorise l'écriture d'un brouillon.
 *     `mailboxDraft` est désormais la capacité réelle, pas l'existence d'une
 *     ligne en base.
 *  3. **Un canal sans émetteur.** Choisir `chat_message` ne produisait aucun
 *     message : rien n'était branché derrière. Le canal ne peut plus être
 *     retenu tant que l'appelant ne déclare pas savoir l'émettre.
 *  4. **Une annonce que personne n'affichait.** `sendsImmediately` est la
 *     garantie centrale du §5.2 (« le canal effectif est annoncé avant le
 *     clic ») et n'atteignait aucun écran. Le canal porte maintenant son
 *     libellé de bouton et son message de confirmation, pour que l'écran n'ait
 *     rien à recomposer — et donc rien à contredire.
 */

export const REMINDER_CHANNELS = [
  /** Un brouillon dans la messagerie de l'utilisateur. Le canal par défaut :
   *  c'est le seul où un humain relit avant que ça parte. */
  'mail_draft',
  /** Un message posté dans l'outil d'équipe. Part IMMÉDIATEMENT — il n'y a pas
   *  de brouillon possible, et c'est précisément ce que le §7 interdit de
   *  faire croire. */
  'chat_message',
  /** Une tâche dans le CRM, à faire soi-même. */
  'crm_task',
  /** Rien d'automatique : une ligne dans la liste, que quelqu'un traite. */
  'in_app',
] as const
export const reminderChannelSchema = z.enum(REMINDER_CHANNELS)
export type ReminderChannel = (typeof REMINDER_CHANNELS)[number]

/**
 * Ce qui est réellement branché sur l'espace — et réellement UTILISABLE.
 *
 * Chaque champ répond à « puis-je faire ce geste », jamais à « une ligne
 * existe-t-elle en base ». La nuance est celle qui a produit les défauts 1 et
 * 2 : une connexion de messagerie n'autorise pas forcément un brouillon, et une
 * intégration sortante n'est pas forcément une messagerie d'équipe.
 */
export type ReminderCapabilities = {
  /** Le jeton autorise-t-il RÉELLEMENT d'écrire un brouillon ? */
  mailboxDraft: boolean
  /**
   * Une messagerie d'ÉQUIPE est-elle branchée, et sait-on y émettre ?
   *
   * Les deux conditions comptent. Un espace peut avoir déclaré une messagerie
   * d'équipe sans qu'aucun émetteur ne soit branché dessus : proposer le canal
   * produirait alors un message que personne n'enverrait.
   */
  teamChat: boolean
  crmTask: boolean
}

export type ResolvedChannel = {
  channel: ReminderChannel
  /** Le message part-il tout seul, ou un humain relit-il d'abord ? C'est ce
   *  champ que l'écran doit annoncer AVANT le clic. */
  sendsImmediately: boolean
  /**
   * Le geste est-il IRRÉVERSIBLE une fois cliqué ?
   *
   * Vrai pour la messagerie d'équipe, et seulement pour elle : un brouillon se
   * corrige ou se jette, un message posté ne se rattrape pas. Le §5.3 du PDF 6
   * exige que le mot apparaisse dans la confirmation.
   */
  irreversible: boolean
  /**
   * La clé i18n du LIBELLÉ DE BOUTON, et celle du message de confirmation.
   *
   * Elles voyagent avec le canal parce que c'est la seule façon qu'elles ne
   * puissent pas se contredire : « Créer les brouillons » sur un canal qui
   * envoie est exactement la promesse que le §5.3 interdit. Trois libellés,
   * trois promesses, aucune ambiguïté.
   */
  actionLabelKey: string
  confirmationKey: string
  /** Pourquoi ce canal et pas un autre. Affiché tel quel : « pas de messagerie
   *  connectée » se corrige, « ça n'a pas marché » ne se corrige pas. */
  reason: 'preferred' | 'fallback' | 'nothing_connected'
}

/**
 * Le canal d'une relance, dans l'ordre de préférence du §7.
 *
 * La messagerie d'abord — c'est le canal où un humain relit. L'outil d'équipe
 * ensuite, mais jamais présenté comme un brouillon. Le CRM en troisième. Et
 * quand rien n'est branché, `in_app` : une ligne dans une liste est honnête,
 * une promesse d'envoi ne l'est pas.
 *
 * Un canal demandé mais non branché DÉGRADE au lieu de refuser : la relance
 * reste due, seul le moyen change, et l'écran dit lequel.
 */
export function resolveChannel(
  capabilities: ReminderCapabilities,
  preferred?: ReminderChannel | null,
): ResolvedChannel {
  const available = (channel: ReminderChannel): boolean => {
    if (channel === 'mail_draft') return capabilities.mailboxDraft
    if (channel === 'chat_message') return capabilities.teamChat
    if (channel === 'crm_task') return capabilities.crmTask
    return true
  }

  if (preferred && available(preferred)) return describe(preferred, 'preferred')

  for (const channel of ['mail_draft', 'chat_message', 'crm_task'] as const) {
    if (available(channel)) return describe(channel, preferred ? 'fallback' : 'preferred')
  }
  return describe('in_app', 'nothing_connected')
}

/**
 * Le libellé de bouton de chaque canal — trois promesses distinctes (§5.3).
 *
 * « Créer les brouillons » dit qu'on relira. « Préparer les messages » dit
 * qu'on ne relira pas dans son outil. « Créer les tâches » dit que rien ne
 * part. Un seul libellé pour les trois ferait promettre au produit ce qu'il ne
 * tient pas sur deux d'entre eux.
 */
const CHANNEL_LABELS: Readonly<Record<ReminderChannel, { action: string; confirmation: string }>> = {
  mail_draft: { action: 'channel.mailDraft.action', confirmation: 'channel.mailDraft.confirmation' },
  chat_message: { action: 'channel.teamChat.action', confirmation: 'channel.teamChat.confirmation' },
  crm_task: { action: 'channel.crmTask.action', confirmation: 'channel.crmTask.confirmation' },
  in_app: { action: 'channel.inApp.action', confirmation: 'channel.inApp.confirmation' },
}

function describe(channel: ReminderChannel, reason: ResolvedChannel['reason']): ResolvedChannel {
  // Seul le message d'équipe part sans relecture, et c'est aussi le seul qui ne
  // se rattrape pas. Le dire est la moitié du garde-fou : l'autre moitié est de
  // ne jamais l'appeler « brouillon ».
  const immediate = channel === 'chat_message'
  const labels = CHANNEL_LABELS[channel]
  return {
    channel,
    sendsImmediately: immediate,
    irreversible: immediate,
    actionLabelKey: labels.action,
    confirmationKey: labels.confirmation,
    reason,
  }
}

/**
 * Le TON d'une relance, selon son rang.
 *
 * Trois rangs, trois tons, et pas un de plus : au-delà de trois, le sujet
 * remonte à un humain — une quatrième relance automatique n'est plus une
 * cadence, c'est du harcèlement, et c'est le client qui s'en souvient.
 */
export const REMINDER_TONES = ['neutral', 'firm', 'escalate'] as const
export type ReminderTone = (typeof REMINDER_TONES)[number]

export function toneForReminder(index: number): ReminderTone | null {
  if (index <= 0) return null
  if (index === 1) return 'neutral'
  if (index === 2) return 'firm'
  if (index === 3) return 'escalate'
  return null
}
