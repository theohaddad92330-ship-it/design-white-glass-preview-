import type { BeeperConversation, BeeperMessage } from '@bellum/contracts'

/**
 * #4406.6 (craft rule n°9) — les conversations Beeper FICTIVES d'une salle de démonstration.
 *
 * Fournies par l'ADAPTATEUR (comme la messagerie, `demo-briefing.ts`) et non semées en table : côté
 * Bellum, une conversation Beeper n'est JAMAIS stockée (c96, lecture en direct) — la semer créerait en
 * démo la table que le produit s'interdit. Aucun appel réseau, aucun envoi depuis une salle de démo.
 *
 * Nadia Perrin est une interlocutrice SEMÉE (`demo-dataset.ts`, SNCF Voyageurs) : son e-mail et son
 * téléphone sont les siens, le rattachement au contact se calcule donc VRAIMENT, comme en production.
 * Les autres interlocuteurs sont inconnus de l'espace : ils restent sans contact (rien de deviné).
 * Adresses en `.example`, numéros fictifs ; coordonnées en clair (c87).
 */

type DemoChat = Omit<BeeperConversation, 'contact' | 'lastActivity'> & {
  hoursAgo: number
  messages: Array<Omit<BeeperMessage, 'timestamp'> & { minutesAgo: number }>
}

const SELF = { id: 'demo-self', fullName: 'Vous', phoneNumber: null, email: null, username: null, isSelf: true }

const DEMO_CHATS: readonly DemoChat[] = [
  {
    chatId: 'demo-beeper-whatsapp-nadia',
    network: 'WhatsApp',
    title: 'Nadia Perrin',
    type: 'single',
    unreadCount: 1,
    hoursAgo: 2,
    participants: [
      SELF,
      {
        id: 'demo-nadia',
        fullName: 'Nadia Perrin',
        phoneNumber: '+33 6 39 98 41 27',
        email: 'nadia.perrin@sncf-groupe.example',
        username: null,
        isSelf: false,
      },
    ],
    messages: [
      {
        id: 'demo-bm-1',
        senderName: 'Vous',
        isSender: true,
        text: 'Bonjour Nadia, comme convenu je vous envoie deux profils data d’ici jeudi.',
        minutesAgo: 1500,
      },
      {
        id: 'demo-bm-2',
        senderName: 'Nadia Perrin',
        isSender: false,
        text: 'Merci ! Le comité d’achat est avancé à lundi : pouvez-vous me les faire passer dès vendredi ?',
        minutesAgo: 120,
      },
    ],
  },
  {
    chatId: 'demo-beeper-linkedin-sofia',
    network: 'LinkedIn',
    title: 'Sofia Benali',
    type: 'single',
    unreadCount: 0,
    hoursAgo: 26,
    participants: [
      SELF,
      {
        id: 'demo-sofia',
        fullName: 'Sofia Benali',
        phoneNumber: null,
        email: null,
        username: 'sofia-benali-demo',
        isSelf: false,
      },
    ],
    messages: [
      {
        id: 'demo-bm-3',
        senderName: 'Sofia Benali',
        isSender: false,
        text: 'Bonjour, je recrute un chef de projet SAP pour janvier. Vous avez quelqu’un ?',
        minutesAgo: 1600,
      },
    ],
  },
  {
    chatId: 'demo-beeper-signal-partenaires',
    network: 'Signal',
    title: 'Partenaires data — Lyon',
    type: 'group',
    unreadCount: 3,
    hoursAgo: 50,
    participants: [
      SELF,
      {
        id: 'demo-marc',
        fullName: 'Marc Delorme',
        phoneNumber: '+33 6 00 00 12 34',
        email: null,
        username: null,
        isSelf: false,
      },
      {
        id: 'demo-lea',
        fullName: 'Léa Fournier',
        phoneNumber: '+33 6 00 00 56 78',
        email: null,
        username: null,
        isSelf: false,
      },
    ],
    messages: [
      {
        id: 'demo-bm-4',
        senderName: 'Marc Delorme',
        isSender: false,
        text: 'Quelqu’un a un expert Snowflake disponible en novembre ?',
        minutesAgo: 3000,
      },
      {
        id: 'demo-bm-5',
        senderName: 'Léa Fournier',
        isSender: false,
        text: 'Chez nous, pas avant décembre.',
        minutesAgo: 2990,
      },
    ],
  },
]

const iso = (now: Date, minutes: number) => new Date(now.getTime() - minutes * 60_000).toISOString()

/** Les conversations, sans contact : le rattachement se calcule sur les contacts de l'espace. */
export function demoBeeperConversations(now = new Date()): Omit<BeeperConversation, 'contact'>[] {
  return DEMO_CHATS.map(({ hoursAgo, messages: _messages, ...chat }) => ({
    ...chat,
    lastActivity: iso(now, hoursAgo * 60),
  }))
}

/** Les messages d'une conversation fictive ; `null` = conversation inconnue (jamais inventée). */
export function demoBeeperMessages(chatId: string, now = new Date()): BeeperMessage[] | null {
  const chat = DEMO_CHATS.find(c => c.chatId === chatId)
  if (!chat) return null
  return chat.messages.map(({ minutesAgo, ...m }) => ({ ...m, timestamp: iso(now, minutesAgo) }))
}
