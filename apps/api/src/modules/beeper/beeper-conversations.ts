import type { BeeperContactMatch, BeeperConversation, BeeperMessage, BeeperParticipant } from '@bellum/contracts'
import { phoneKey } from '../activities/activity-linking'
import type { BeeperRawChat, BeeperRawMessage } from './beeper.client'

/**
 * #4406.2 — ce que Beeper rend, réduit à ce que l'écran et Laura lisent. Pur, testé.
 *
 * ⚠️ Rien de ce fichier n'écrit : la conversation vit le temps de la requête (c96).
 */

const str = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value : null)

function mapParticipant(raw: unknown): BeeperParticipant | null {
  if (!raw || typeof raw !== 'object') return null
  const p = raw as Record<string, unknown>
  const id = str(p['id'])
  if (!id) return null
  return {
    id,
    fullName: str(p['fullName']),
    phoneNumber: str(p['phoneNumber']),
    email: str(p['email']),
    username: str(p['username']),
    isSelf: p['isSelf'] === true,
  }
}

export function mapChat(raw: BeeperRawChat): Omit<BeeperConversation, 'contact'> | null {
  const chatId = str(raw.id)
  if (!chatId) return null
  const items = Array.isArray(raw.participants?.items) ? raw.participants.items : []
  return {
    chatId,
    network: str(raw.network),
    title: str(raw.title),
    type: raw.type === 'single' || raw.type === 'group' ? raw.type : null,
    // Une absence reste une absence (GA-18) : jamais « 0 non lus » inventé.
    unreadCount: typeof raw.unreadCount === 'number' && raw.unreadCount >= 0 ? Math.floor(raw.unreadCount) : null,
    lastActivity: str(raw.lastActivity),
    participants: items.map(mapParticipant).filter((p): p is BeeperParticipant => p !== null),
  }
}

export function mapMessage(raw: BeeperRawMessage): BeeperMessage | null {
  const id = str(raw.id)
  if (!id) return null
  return {
    id,
    senderName: str(raw.senderName),
    isSender: raw.isSender === true,
    timestamp: str(raw.timestamp),
    text: typeof raw.text === 'string' ? raw.text : null,
  }
}

/** Un contact de l'espace, réduit à ce qui sert au rattachement. */
export type BeeperMatchableContact = {
  id: string
  fullName: string | null
  accountId: string | null
  email: string | null
  phone: string | null
  linkedinUrl: string | null
}

/** Les clés de rattachement d'une conversation : celles de l'interlocuteur (jamais de soi-même). */
export function matchKeys(conversation: Pick<BeeperConversation, 'participants'>): {
  emails: string[]
  phones: string[]
  handles: string[]
} {
  const others = conversation.participants.filter(p => !p.isSelf)
  return {
    emails: others.map(p => p.email?.trim().toLowerCase() ?? '').filter(Boolean),
    phones: others.map(p => phoneKey(p.phoneNumber)).filter((k): k is string => k !== null),
    handles: others.map(p => p.username?.trim().toLowerCase().replace(/^@/, '') ?? '').filter(h => h.length >= 3),
  }
}

function linkedinSlug(url: string | null): string | null {
  const match = url?.toLowerCase().match(/linkedin\.com\/in\/([^/?#]+)/)
  return match?.[1] ?? null
}

/**
 * Le contact Bellum de l'interlocuteur — PROPOSÉ, jamais fusionné (aucune écriture).
 *
 * Seulement pour une conversation à DEUX (un groupe n'a pas « un » interlocuteur), et seulement si
 * UN seul contact répond : deux candidats, c'est une ambiguïté — on ne devine pas lequel.
 * Ordre de preuve : e-mail, téléphone (neuf derniers chiffres), identifiant (slug LinkedIn).
 */
export function matchContact(
  conversation: Pick<BeeperConversation, 'participants' | 'type'>,
  contacts: readonly BeeperMatchableContact[],
): BeeperContactMatch | null {
  if (conversation.type === 'group') return null
  const keys = matchKeys(conversation)
  const attempts: Array<[BeeperContactMatch['matchedOn'], (c: BeeperMatchableContact) => boolean]> = [
    ['email', c => !!c.email && keys.emails.includes(c.email.trim().toLowerCase())],
    [
      'phone',
      c => {
        const k = phoneKey(c.phone)
        return k !== null && keys.phones.includes(k)
      },
    ],
    [
      'handle',
      c => {
        const s = linkedinSlug(c.linkedinUrl)
        return s !== null && keys.handles.includes(s)
      },
    ],
  ]
  for (const [matchedOn, test] of attempts) {
    const found = contacts.filter(test)
    if (found.length === 1) {
      const c = found[0]!
      return { contactId: c.id, fullName: c.fullName, accountId: c.accountId, matchedOn }
    }
    if (found.length > 1) return null
  }
  return null
}
