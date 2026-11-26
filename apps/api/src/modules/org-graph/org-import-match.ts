import type { OrgImportPreviewRow } from '@bellum/contracts'
import { personKey } from './org-graph-declare'

/**
 * Rapprochement d'un organigramme importé avec ce que Bellum SAIT déjà (#3740).
 *
 * « il faudrait pouvoir importer un organigramme et si des personnes
 * correspondent, l'enrichir avec les données de bellum »
 *
 * Fonctions PURES. Le rapprochement se fait sur la clé de nom du reste du
 * pipeline (`personKey`) : on neutralise la forme, jamais l'orthographe.
 * Deux usages, une seule règle de correspondance :
 *   · `matchDeclaredToBellum` — l'APERÇU avant validation (rien n'est écrit) ;
 *   · `enrichDeclaredFromBellum` — la déclaration reçoit ce que Bellum a et que
 *     le fichier n'a pas. PRESENT-ONLY : ce que le fichier a écrit gagne, un
 *     champ absent des deux côtés reste absent (jamais une valeur devinée).
 */

type DeclaredInput = { fullName: string; title?: string; linkedinUrl?: string }

type BellumContactRow = {
  full_name: string
  title?: string | null
  email?: string | null
  phone?: string | null
  linkedin_url?: string | null
}

type BellumKnowledge = { contacts: readonly BellumContactRow[]; graphNames?: readonly string[] }

const clean = (value: string | null | undefined): string | undefined => {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

function indexContacts(contacts: readonly BellumContactRow[]): Map<string, BellumContactRow> {
  const byKey = new Map<string, BellumContactRow>()
  for (const row of contacts) {
    const key = personKey(row.full_name)
    // Le premier gagne : `findByAccount` rend déjà les contacts par priorité.
    if (key && !byKey.has(key)) byKey.set(key, row)
  }
  return byKey
}

export function matchDeclaredToBellum(
  declared: readonly DeclaredInput[],
  knowledge: BellumKnowledge,
): OrgImportPreviewRow[] {
  const byContact = indexContacts(knowledge.contacts)
  const inGraph = new Set((knowledge.graphNames ?? []).map(personKey))

  return declared.map(entry => {
    const key = personKey(entry.fullName)
    const found = byContact.get(key)
    if (!found) {
      return { fullName: entry.fullName, match: inGraph.has(key) ? 'known_in_graph' : 'new', fills: [] }
    }
    const title = clean(found.title)
    const email = clean(found.email)
    const phone = clean(found.phone)
    const linkedinUrl = clean(found.linkedin_url)
    const fills: OrgImportPreviewRow['fills'] = []
    if (title && !clean(entry.title)) fills.push('title')
    if (linkedinUrl && !clean(entry.linkedinUrl)) fills.push('linkedinUrl')
    return {
      fullName: entry.fullName,
      match: inGraph.has(key) ? 'known_in_graph' : 'known_contact',
      bellum: {
        ...(title ? { title } : {}),
        ...(email ? { email } : {}),
        ...(phone ? { phone } : {}),
        ...(linkedinUrl ? { linkedinUrl } : {}),
      },
      fills,
    }
  })
}

export function enrichDeclaredFromBellum<T extends DeclaredInput>(
  declared: readonly T[],
  knowledge: Pick<BellumKnowledge, 'contacts'>,
): T[] {
  const byContact = indexContacts(knowledge.contacts)
  return declared.map(entry => {
    const found = byContact.get(personKey(entry.fullName))
    if (!found) return entry
    const title = clean(found.title)
    const linkedinUrl = clean(found.linkedin_url)
    return {
      ...entry,
      ...(title && !clean(entry.title) ? { title } : {}),
      ...(linkedinUrl && !clean(entry.linkedinUrl) ? { linkedinUrl } : {}),
    }
  })
}
