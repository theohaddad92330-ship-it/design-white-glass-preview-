import { useSearch } from '@tanstack/react-router'
import type {
  ContactChannelFilter,
  ContactFamily,
  ContactLifecycleState,
  ContactListQuery,
  ContactStatus,
  HierarchyLevel,
  InteractionActivityKind,
} from '@bellum/contracts'
import type { RoleFilter } from '@/lib/contactRoles'
import type { ContactViewFilterValue } from '@/features/contacts/view/contacts-list/ContactsViewChips'

export type ContactsSearchState = {
  query: string
  roleFilter: RoleFilter
  companyFilter: string | undefined
  /** #2159.26 — l'étiquette filtrée. `undefined` = pas de filtre. */
  tagFilter: string | undefined
  channelFilter: ContactChannelFilter | undefined
  /** #1473 — la file « à qualifier » : les contacts sans entreprise connue.
   *  `undefined` = pas de filtre (et non « ceux qui en ont une »). */
  unassignedFilter: boolean | undefined
  /** Pastille de cycle de vie sélectionnée. `undefined` = "Tous". */
  stateFilter: ContactLifecycleState | undefined
  /** Réseau dormant (tome 1 §11.4) : la valeur EST le nombre de mois sans le
   *  moindre échange (« 12 » = un an). `undefined` = pas de seuil. */
  dormantFilter: string | undefined
  /** #2158.61 — la ville/le pays (`contact.location`, ILIKE). `undefined` =
   *  pas de filtre. */
  locationFilter: string | undefined
  /** #2158.65 — le porteur du contact (`contact.assigned_to`). `undefined` =
   *  pas de filtre. */
  assignedToFilter: string | undefined
  /** #1903.15 — le compte discuté en conversation (`contact.account_id`),
   *  posé par un lien profond de Laura. Égalité exacte, `undefined` = pas de
   *  filtre. */
  accountIdFilter: string | undefined
  /** #2158.6 — la vue sélectionnée (`ContactsViewChips`), bookmarkable dans
   *  l'URL. `undefined` = pas de préférence explicite : la page retombe sur
   *  « à contacter » (#2158.72), pas sur « Toutes ». */
  viewFilter: ContactViewFilterValue | undefined
  /** #2158.60 — la famille métier (`contact.family`), taxonomie fermée.
   *  `undefined` = pas de filtre, `'all'` = filtre explicitement effacé. */
  familyFilter: ContactFamily | 'all' | undefined
  /** #2158.57 — l'entité (`contact.entity`, ILIKE). `undefined` = pas de filtre. */
  entityFilter: string | undefined
  /** #2158.58 — la fonction (`contact.title`, ILIKE). `undefined` = pas de filtre. */
  titleFilter: string | undefined
  /** #2158.67 — la fraîcheur de la fiche (`contact.updated_at`) : la valeur
   *  EST le nombre de mois (« 12 » = un an). `undefined` = pas de seuil. */
  updatedWithinFilter: string | undefined
  /** #2158.68 — la cible (`target_list_items.contact_id`). `undefined` = pas de filtre. */
  targetListIdFilter: string | undefined
  /** #2158.66 — la source (`contact.source`), taxonomie fermée. `undefined` =
   *  pas de filtre, `'all'` = filtre explicitement effacé. La valeur reste le
   *  fournisseur brut côté état/URL — jamais affichée telle quelle, l'écran
   *  ne rend que le libellé anonymisé de `contactSourceLabel`. */
  sourceFilter: ContactListQuery['source']
  /** #2834 (#2106.24) — les contacts « a changé d'employeur » (`RISQUE`),
   *  posé par un lien profond depuis le brief. Égalité exacte, `undefined` =
   *  pas de filtre — même geste que `accountIdFilter`. */
  sourceTagFilter: 'RISQUE' | undefined
  /** #4597.3 — les contacts créés par CET import (identifiant du job). Lien profond, `undefined` = pas de filtre. */
  importJobFilter: string | undefined
  /** #2158.59 — le niveau (`computeHierarchyLevel(contact.title)`), taxonomie
   *  fermée. `undefined` = pas de filtre, `'all'` = filtre explicitement effacé. */
  hierarchyLevelFilter: HierarchyLevel | 'all' | undefined
  /** #2158.14 (#2997) — la vue « Sans prochaine action », posée en filtre.
   *  `undefined` = pas de filtre (et non « celles qui en ont une »). */
  withoutNextActionFilter: boolean | undefined
  /** #2158.69 (#2997) — la NATURE de la dernière activité échangée, distincte
   *  de `dormantFilter` (l'ancienneté). `undefined` = pas de filtre. */
  lastActivityKindFilter: InteractionActivityKind | undefined
  /** #3718 — le statut déclaré du contact (« Répondu »…). `undefined` = pas de filtre. */
  userStatusFilter: ContactStatus | undefined
}

export function useContactsSearchState(from: '/contacts/' = '/contacts/'): ContactsSearchState {
  const search = useSearch({ from })
  return {
    query: search.q ?? '',
    roleFilter: search.role ?? 'all',
    companyFilter: search.company,
    tagFilter: search.tag,
    channelFilter: search.channel,
    unassignedFilter: search.unassigned,
    stateFilter: search.state,
    dormantFilter: search.dormant,
    locationFilter: search.location,
    assignedToFilter: search.assignedTo,
    accountIdFilter: search.account_id,
    viewFilter: search.view,
    familyFilter: search.family,
    entityFilter: search.entity,
    titleFilter: search.title,
    updatedWithinFilter: search.updatedWithin,
    targetListIdFilter: search.targetListId,
    sourceTagFilter: search.sourceTag,
    importJobFilter: search.importJob,
    sourceFilter: search.source,
    hierarchyLevelFilter: search.hierarchyLevel,
    withoutNextActionFilter: search.withoutNextAction,
    lastActivityKindFilter: search.lastActivityKind,
    userStatusFilter: search.userStatus,
  }
}
