import {
  computeHierarchyLevel,
  isKnownContact,
  normalizeTitleKey,
  type HierarchyLevel,
  type OrgGraph,
  type OrgHierarchyLevel,
} from '@bellum/contracts'
import { normaliseOrgPersonName } from './focalOrgData'

/**
 * #4679 — les contacts CONNUS (import / CRM) dans l'organigramme.
 *
 * Un contact venu d'un import n'a pas de nœud dans le graphe (il n'a pas été enrichi par l'analyse) : sans ce
 * module il tombait dans « Non enrichis », sans niveau, pendant qu'un contact DÉDUIT occupait sa place. Ici :
 *  - plaçable (son titre donne le MÊME niveau que celui que l'analyse déduit : `computeHierarchyLevel`, miroir de
 *    `classify_hierarchy_level`) ET rattaché à la direction ouverte → rangé dans l'arbre, pastille « Connu » ;
 *  - sinon → épinglé en haut (« Connus de l'équipe »). Jamais perdu, jamais un niveau deviné ;
 *  - quand un contact déduit occupe visiblement la même place → « doublon probable ». On PROPOSE, on ne fusionne
 *    JAMAIS : ce module ne modifie rien, il nomme.
 * Le prédicat « connu » est `isKnownContact` (contrats, un seul endroit — GA-26).
 */

export type KnownOrgContact = {
  id: string
  fullName: string
  title: string | null
  /** `null` = le titre ne donne pas de niveau (ou un niveau hors arbre : achats). Jamais deviné. */
  level: OrgHierarchyLevel | null
  /** Un contact déduit qui semble occuper la même place ; `null` = aucun. */
  probableDuplicate: { personId: string; fullName: string } | null
}

type KnownOrgContactInput = {
  id: string
  full_name: string
  title?: string | null
  entity?: string | null
  family?: string | null
  source?: string | null
}

/** Le palier du contact → l'étage de l'arbre. `achats` (L5) est un canal PARALLÈLE : il ne se range pas dans l'arbre. */
const TREE_LEVEL: Readonly<Partial<Record<HierarchyLevel, OrgHierarchyLevel>>> = {
  governance: 'L0',
  c_level: 'L1',
  direction: 'L2',
  management: 'L3',
  expert: 'L4',
  operationnel: 'L4',
}

function titleKey(title: string | null | undefined): string {
  return normalizeTitleKey(title).replace(/[^a-z0-9]/g, '')
}

function sameFamily(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = a?.trim().toLowerCase()
  return Boolean(left) && left === b?.trim().toLowerCase()
}

function sameTitle(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = titleKey(a)
  return left !== '' && left === titleKey(b)
}

export function knownOrgContacts(
  graph: OrgGraph,
  contacts: readonly KnownOrgContactInput[],
  /** Les noms d'entités (déjà normalisés) du périmètre ouvert. Un contact sans entité relève du périmètre. */
  scopeEntityNames: ReadonlySet<string>,
): { placed: KnownOrgContact[]; pinned: KnownOrgContact[] } {
  const inGraph = new Set(graph.people.map(person => normaliseOrgPersonName(person.fullName)))
  const placed: KnownOrgContact[] = []
  const pinned: KnownOrgContact[] = []
  const seen = new Set<string>()
  for (const contact of contacts) {
    if (!isKnownContact(contact)) continue
    const key = normaliseOrgPersonName(contact.full_name)
    if (!key || inGraph.has(key) || seen.has(key)) continue
    seen.add(key)
    const title = contact.title?.trim() || null
    const level = TREE_LEVEL[computeHierarchyLevel(title)] ?? null
    const entity = contact.entity ? normaliseOrgPersonName(contact.entity) : ''
    const inScope = entity === '' || scopeEntityNames.has(entity)
    const duplicate =
      level === null
        ? undefined
        : graph.people.find(
            person =>
              person.roleInferred === true &&
              person.hierarchyLevel === level &&
              (sameFamily(person.family, contact.family) || sameTitle(person.title, title)),
          )
    const card: KnownOrgContact = {
      id: contact.id,
      fullName: contact.full_name,
      title,
      level,
      probableDuplicate: duplicate ? { personId: duplicate.id, fullName: duplicate.fullName } : null,
    }
    ;(level !== null && inScope ? placed : pinned).push(card)
  }
  return { placed, pinned }
}
