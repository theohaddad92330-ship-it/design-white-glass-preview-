import type { MailSearchIntent, MailThread } from '@bellum/contracts'

/**
 * Théo B m1 — la file « À traiter » de la page appliquée : une liste à gauche, un volet de lecture à droite.
 *
 * Les intentions sont en MULTI-SÉLECTION (décision Louis : multi-sélection partout). La recherche serveur prend UNE
 * intention : l'écran pose une question par intention choisie (même clé de cache que la recherche unique) et réunit
 * les réponses ici. Rien n'est recalculé côté écran : le niveau de priorité reste celui du serveur.
 */
type InboxRow = { thread: MailThread; foundBy: MailSearchIntent }

/** Un fil trouvé par deux intentions n'apparaît qu'une fois ; il garde la première qui l'a trouvé (sa passerelle). */
export function mergeIntentResults(results: { intent: MailSearchIntent; threads: MailThread[] }[]): InboxRow[] {
  const seen = new Map<string, InboxRow>()
  for (const { intent, threads } of results) {
    for (const thread of threads) {
      if (!seen.has(thread.threadId)) seen.set(thread.threadId, { thread, foundBy: intent })
    }
  }
  const at = (thread: MailThread) => (thread.lastMessageAt ? Date.parse(thread.lastMessageAt) : 0)
  return [...seen.values()].sort(
    (a, b) => (a.thread.priorityLevel ?? 6) - (b.thread.priorityLevel ?? 6) || at(b.thread) - at(a.thread),
  )
}

/** Le filtre « Tous les comptes » (multi) et « Voir seulement les échanges non lus ». */
export function filterInboxThreads(
  threads: MailThread[],
  { accountIds, unreadOnly }: { accountIds: readonly string[]; unreadOnly: boolean },
): MailThread[] {
  return threads.filter(
    thread =>
      (accountIds.length === 0 || (thread.account ? accountIds.includes(thread.account.id) : false)) &&
      (!unreadOnly || thread.unread),
  )
}

/** Les comptes RÉELLEMENT présents dans la file : un filtre ne propose jamais un compte qui ne filtrerait rien. */
export function accountOptionsOf(threads: MailThread[]): { id: string; name: string }[] {
  const byId = new Map<string, string>()
  for (const thread of threads) if (thread.account) byId.set(thread.account.id, thread.account.name)
  return [...byId.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Le NOM de l'interlocuteur, tel que son propre en-tête l'écrit (« Claire Vasseur <claire@…> »). Sans nom affiché,
 * l'adresse elle-même, en clair (c87) — jamais un nom deviné depuis l'adresse.
 */
export function counterpartNameOf(thread: MailThread): string | null {
  const address = thread.counterpart?.trim().toLowerCase()
  if (!address) return null
  for (const message of thread.messages ?? []) {
    const match = message.from ? /^\s*"?([^"<]+?)"?\s*<([^>]+)>/.exec(message.from) : null
    if (match && match[2]?.trim().toLowerCase() === address && match[1]?.trim()) return match[1].trim()
  }
  return thread.counterpart
}

export function initialsOf(name: string): string {
  if (name.includes('@')) return name.charAt(0).toUpperCase()
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part.charAt(0).toUpperCase())
    .join('')
}
