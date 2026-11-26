import type { Contact, OrgGraph, OrgHierarchyLevel } from '@bellum/contracts'
import { isKnownContact, matchesFlexibleQuery, RECOMMENDED_PATH_MAX } from '@bellum/contracts'
import { orgPersonSlug } from '@bellum/utils'
import { i18n } from '@/i18n'
import { contactDeparture } from '@/features/contacts/lib/contactDeparture'
import { sortByPriority } from '@/features/contacts/lib/contactPriority'
import { sortForApproach } from './contactApproachOrder'
import { apolloLabel } from '@/lib/apolloVocabulary'
import { getRoleLabel } from '@/lib/contactRoles'
import type { ContactGroup, GroupMode } from './types'

type ContactListFilters = {
  role: string
  entity: string
  level: string
}

/**
 * `roleFilter` était le SEUL filtre de cet onglet — mesuré le 31/08 (maquette
 * `03_tous_contacts_couverture.png`) : Entité et Niveau manquaient. `'all'`
 * veut dire « pas de filtre », comme `roleFilter` le faisait déjà.
 *
 * `levelOf` est injecté plutôt que recalculé ici : le niveau L0-L4 vient du
 * graphe d'organigramme (`buildContactLevelMap`), une donnée que cet onglet ne
 * possède pas nativement — une seule dérivation, lue à deux endroits.
 */
export function filterContacts(
  contacts: Contact[],
  search: string,
  filters: ContactListFilters,
  levelOf: (contact: Contact) => OrgHierarchyLevel | null,
) {
  const query = search.trim()
  return contacts.filter(contact => {
    const matchesSearch =
      !query ||
      // #4400.1 — recherche SOUPLE (préfixe, accents, pluriel, abréviations, ET), celle de Découvrir.
      // #3686.4 — le périmètre travaillé est cherchable : c'est le motif d'approche.
      matchesFlexibleQuery(
        query,
        [contact.full_name, contact.title, contact.scope, contact.entity].filter(Boolean).join(' '),
      )
    const matchesRole = filters.role === 'all' || contact.decision_role === filters.role
    const matchesEntity = filters.entity === 'all' || contact.entity === filters.entity
    const matchesLevel = filters.level === 'all' || levelOf(contact) === filters.level
    return matchesSearch && matchesRole && matchesEntity && matchesLevel
  })
}

/** Les six étages du contrat (`orgHierarchyLevelSchema`), dans l'ordre où le
 *  filtre « Niveau » les propose — pas alphabétique, l'ordre hiérarchique. */
export const ORG_LEVEL_ORDER: readonly OrgHierarchyLevel[] = ['L0', 'L1', 'L2', 'L3', 'L4', 'L5']

/**
 * Le niveau hiérarchique d'un contact, par CONTACT ID — lu sur le graphe
 * d'organigramme, jamais recalculé.
 *
 * ⚠️ CE FICHIER NE CALCULE RIEN DE NEUF. `hierarchyLevel` n'existe QUE sur
 * `OrgPerson` (le graphe), jamais sur `Contact` : la seule clé commune entre
 * les deux mondes est le slug du nom (`p-{slug}`), déjà la convention de
 * l'onglet Organigramme (`OrgInfluenceMap.contactBySlug`,
 * `organigrammeData.resolveServerPath`) — reprise ici à l'identique plutôt
 * que réinventée.
 *
 * Un contact absent du graphe (pas encore vu par une analyse, ou nom trop
 * ambigu pour matcher) n'a PAS d'entrée dans la map — jamais un niveau deviné.
 */
export function buildContactLevelMap(contacts: Contact[], graph: OrgGraph | null): Map<string, OrgHierarchyLevel> {
  const map = new Map<string, OrgHierarchyLevel>()
  if (!graph) return map
  const peopleBySlug = new Map(graph.people.map(person => [person.id, person]))
  for (const contact of contacts) {
    const level = peopleBySlug.get(orgPersonSlug(contact.full_name))?.hierarchyLevel
    if (level) map.set(contact.id, level)
  }
  return map
}

export function getPriorityContacts(contacts: Contact[]) {
  return sortContactsByPriority(contacts).slice(0, RECOMMENDED_PATH_MAX)
}

/**
 * #3593 — l'ordre des CATÉGORIES de persona : de qui décide à qui bloque. Un
 * rôle absent / inconnu tombe dans « Persona à qualifier », toujours en dernier.
 */
const PERSONA_CATEGORY_ORDER: readonly string[] = [
  'economic',
  'sponsor',
  'technical',
  'procurement',
  'purchasing',
  'champion',
  'user',
  'operational',
  'influencer',
  'blocker',
]

function personaCategoryRank(contact: Contact): number {
  const index = contact.decision_role ? PERSONA_CATEGORY_ORDER.indexOf(contact.decision_role) : -1
  return index === -1 ? PERSONA_CATEGORY_ORDER.length : index
}

/** Une paire de doublon PROBABLE proposée par le serveur (refus humain « pas les mêmes » déjà écartés côté serveur). */
export type ProbableDuplicatePair = { left: { id: string }; right: { id: string } }

/**
 * Tout ce que le serveur donne comme « même personne probable » : les paires scorées ET les fiches qui partagent une
 * adresse e-mail (`shared_email_groups` — le bandeau les dit déjà, la liste doit s'y accorder). Un groupe de n fiches
 * devient n-1 liens ; la fermeture transitive est faite par `duplicateIdsToHide`. Lecture seule : rien n'est écrit.
 */
export function probableDuplicateLinks(
  proposals:
    | {
        pairs?: readonly ProbableDuplicatePair[]
        shared_email_groups?: readonly { email?: string; contacts: readonly { id: string }[] }[]
      }
    | undefined,
): ProbableDuplicatePair[] {
  if (!proposals) return []
  const fromGroups = (proposals.shared_email_groups ?? []).flatMap(group =>
    group.contacts.slice(1).map(other => ({ left: { id: group.contacts[0]?.id ?? '' }, right: { id: other.id } })),
  )
  return [...(proposals.pairs ?? []), ...fromGroups]
}

const completeness = (contact: Contact): number =>
  [contact.email, contact.phone, contact.linkedin_url, contact.title].filter(v => (v ?? '').trim() !== '').length +
  (contact.email_verified ? 1 : 0) +
  Math.min((contact.full_name ?? '').length, 60) / 100

/**
 * Doctrine « on PROPOSE, on ne fusionne jamais » : rien n'est fusionné ni supprimé. En liste par persona, un groupe de
 * doublon PROBABLE (paires fermées par transitivité) ne s'affiche qu'UNE fois : la fiche la plus complète, à égalité
 * la persona la plus haute. Les autres fiches restent en mode entité et dans le bandeau « doublons possibles ».
 */
function duplicateIdsToHide(contacts: readonly Contact[], pairs: readonly ProbableDuplicatePair[]): Set<string> {
  const byId = new Map(contacts.map(contact => [contact.id, contact]))
  const parent = new Map<string, string>()
  const find = (id: string): string => {
    const up = parent.get(id) ?? id
    if (up === id) return id
    const root = find(up)
    parent.set(id, root)
    return root
  }
  for (const { left, right } of pairs) {
    if (byId.has(left.id) && byId.has(right.id)) parent.set(find(left.id), find(right.id))
  }
  const groups = new Map<string, Contact[]>()
  const seen = new Set<string>()
  for (const { left, right } of pairs) {
    for (const id of [left.id, right.id]) {
      const contact = byId.get(id)
      if (!contact || seen.has(id)) continue
      seen.add(id)
      const root = find(id)
      groups.set(root, [...(groups.get(root) ?? []), contact])
    }
  }
  const hidden = new Set<string>()
  for (const group of groups.values()) {
    const [keep] = [...group].sort(
      (a, b) =>
        completeness(b) - completeness(a) ||
        personaCategoryRank(a) - personaCategoryRank(b) ||
        a.id.localeCompare(b.id),
    )
    for (const contact of group) if (contact.id !== keep?.id) hidden.add(contact.id)
  }
  return hidden
}

export function groupContacts(
  all: Contact[],
  mode: GroupMode,
  focus = '',
  accountName?: string | null,
  probableDuplicates: readonly ProbableDuplicatePair[] = [],
): ContactGroup[] {
  const hidden =
    mode === 'persona' && probableDuplicates.length > 0 ? duplicateIdsToHide(all, probableDuplicates) : null
  const contacts = hidden && hidden.size > 0 ? all.filter(contact => !hidden.has(contact.id)) : all
  // #4465.2 — une personne dont le poste dans l'entreprise a une date de fin n'est plus « dans l'entreprise » : rangée
  // à part, en dernier et repliée. Jamais retirée (« on archive, on ne supprime pas »).
  const present = contacts.filter(contact => !contactDeparture(contact, accountName))
  const departed = contacts.filter(contact => contactDeparture(contact, accountName))
  // #4678 — un contact venu d'un import / du CRM est une RELATION connue : un groupe « Connu » EN PREMIER, quel
  // que soit le mode, et il ne figure pas une seconde fois ailleurs. Aucun connu ⇒ aucun groupe (jamais « 0 »).
  const known = present.filter(isKnownContact)
  const discovered = present.filter(contact => !isKnownContact(contact))
  const groups = [...knownGroup(known, focus), ...groupPresent(discovered, mode, focus)]
  if (departed.length === 0) return groups
  return [
    ...groups,
    {
      entity: i18n.t('accountOrg:grouping.leftCompany'),
      contacts: sortForApproach(departed, focus),
      collapsedByDefault: true,
    },
  ]
}

function knownGroup(known: Contact[], focus: string): ContactGroup[] {
  if (known.length === 0) return []
  return [{ entity: i18n.t('accountOrg:grouping.known'), contacts: sortForApproach(known, focus) }]
}

function groupPresent(contacts: Contact[], mode: GroupMode, focus: string): ContactGroup[] {
  const groups = new Map<string, { rank: number; contacts: Contact[] }>()
  contacts.forEach(contact => {
    const key = getContactGroupLabel(contact, mode)
    const group = groups.get(key) ?? { rank: mode === 'persona' ? personaCategoryRank(contact) : 0, contacts: [] }
    group.contacts.push(contact)
    groups.set(key, group)
  })
  const entries = Array.from(groups.entries())
  // Tri stable : en mode entité, l'ordre d'arrivée est conservé.
  if (mode === 'persona') entries.sort((a, b) => a[1].rank - b[1].rank)
  const fallbackLabel = i18n.t('accountOrg:grouping.personaFallback')
  return entries.map(([entity, group]) => ({
    entity,
    contacts: sortForApproach(group.contacts, focus),
    // Recette 21/10 A.1 (décision Louis : « garder tout, replier le reste ») — le groupe
    // « Persona à qualifier » (1 693 contacts sur 1 712 vus) s'ouvre replié ; les contacts
    // classés passent devant (tri par rang ci-dessus), « Tout déplier » l'ouvre aussi.
    ...(mode === 'persona' && entity === fallbackLabel ? { collapsedByDefault: true } : {}),
  }))
}

export function getContactPersona(contact: Contact) {
  if (contact.scope) return contact.scope
  // Apollo's closed seniority vocabulary → same dictionary as the contact
  // detail; an unknown value is returned exactly as stored.
  if (contact.seniority) return apolloLabel(i18n.getFixedT(null, 'apollo'), 'seniority', contact.seniority)
  if (contact.key_points?.length) return contact.key_points.slice(0, 2).join(', ')
  return contact.title || i18n.t('accountOrg:grouping.personaFallback')
}

/** Best-first. `priority` is a rank where 1 is the BEST — this used to sort
 *  descending, which put the least relevant contact first under a heading that
 *  promised « à engager en premier ». */
function sortContactsByPriority(contacts: Contact[]) {
  return sortByPriority(contacts)
}

function getContactGroupLabel(contact: Contact, mode: GroupMode) {
  if (mode === 'entity') return contact.entity || i18n.t('accountOrg:grouping.entityFallback')
  // #3593 — « des catégories de persona pour trier les différents types » : on
  // groupe par CATÉGORIE (rôle de décision), plus par intitulé de poste libre
  // (1 965 contacts = des centaines de groupes d'un seul contact).
  const role = contact.decision_role
  if (!role || role === 'unknown') return i18n.t('accountOrg:grouping.personaFallback')
  return getRoleLabel(role)
}
