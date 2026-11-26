import { contactsApi } from '@/features/contacts/api'

/**
 * #4610.5 — les contacts SEMÉS d'un compte de la salle, nom → id, pour que les noms de la carte Contacts d'une
 * réponse scriptée (`contactHref`, `demo-chat-script.ts`) mènent à leur fiche. Lecture seule, UNE fois par réponse qui
 * en a besoin (`demoTurnLinksContacts`) — jamais à chaque message. En échec (réseau, compte absent), la table est
 * vide : les noms restent du texte, jamais un lien mort ni un identifiant deviné.
 */
export async function demoContactIdByName(accountId: string | undefined): Promise<ReadonlyMap<string, string>> {
  if (!accountId) return new Map()
  try {
    const contacts = await contactsApi.listByAccount(accountId)
    return new Map(contacts.filter(contact => contact.full_name).map(contact => [contact.full_name, contact.id]))
  } catch {
    return new Map()
  }
}
