import { useNavigate } from '@tanstack/react-router'
import { useCallback } from 'react'
import type { ActiveFilter } from '@bellum/ui'
import type { LifecycleFilterValue } from '@/features/contacts/view/contacts-list/ContactsLifecycleFilter'
import type { ContactViewFilterValue } from '@/features/contacts/view/contacts-list/ContactsViewChips'
import { trackFilterApplied } from '@/lib/product-tracker'

/** #1687 — le MOTIF d'écran, jamais dérivé. */
const CONTACTS_SCREEN = '/contacts'

// #1473 — « à qualifier » est un SCOPE (l'onglet « Tous / À qualifier »), pas
// un filtre de la barre — il vit dans le seul search param `unassigned`, piloté
// par `onScopeChange`. Le garder hors barre évite un contrôle en double.
// `dormant` = le réseau dormant (tome 1 §11.4) : les contacts sans le moindre
// échange depuis N mois. Un filtre et non un écran — il se COMBINE avec le rôle
// et la société, et « dormant ET décideur » est la question qui trouve une
// affaire.
// #2159.26 — `tag` : l'étiquette, posée par l'import ou par la puce d'une fiche.
// #2158.61 — `location` : la ville/le pays, ILIKE (`contact.location`).
// #2158.65 — `assignedTo` : le porteur du contact (`contact.assigned_to`).
// #2158.60 — `family` : la famille métier (`contact.family`), taxonomie fermée.
// #2158.57 — `entity` : l'entité déclarée (`contact.entity`), ILIKE.
// #2158.58 — `title` : la fonction (`contact.title`), ILIKE.
// #2158.67 — `updatedWithin` : la fraîcheur de la fiche (`contact.updated_at`).
// #2158.68 — `targetListId` : la cible (`target_list_items.contact_id`).
// #2158.66 — `source` : la source (`contact.source`), taxonomie fermée.
// #2158.59 — `hierarchyLevel` : le niveau (`computeHierarchyLevel(title)`), taxonomie fermée.
// #2158.14 (#2997) — `withoutNextAction` : la vue « Sans prochaine action »,
// posée en filtre. Présent-ou-absent, comme `unassigned` (hors de cette liste).
// #2158.69 (#2997) — `lastActivityKind` : la nature de la dernière activité
// échangée, distincte de `dormant` (l'ancienneté).
export const FILTER_BAR_KEYS = [
  'role',
  'company',
  'channel',
  'dormant',
  'tag',
  'location',
  'assignedTo',
  'family',
  'entity',
  'title',
  'updatedWithin',
  'targetListId',
  'source',
  'hierarchyLevel',
  'withoutNextAction',
  'lastActivityKind',
  // #3718 — le statut déclaré (« Répondu »…).
  'userStatus',
] as const

/** Les deux PORTÉES de la liste de contacts. Exclusives : c'est un onglet, pas
 *  une pile de cases à cocher.
 *
 *  ⚠️ #1800 (09/09/2026) — « favorites » a existé ici, retiré avec la notion de
 *  favori (retour Louis, « supprime la notion de favori »). */
export type ContactScope = 'all' | 'unassigned'

type ContactsNavigation = {
  onQueryChange: (next: string) => void
  onFiltersChange: (next: ActiveFilter[]) => void
  onAddFilter: (filterId: string, value: string) => void
  onScopeChange: (next: ContactScope) => void
  onLifecycleFilterChange: (next: LifecycleFilterValue) => void
  onClearFilters: () => void
  onViewChange: (next: ContactViewFilterValue) => void
  /** #4597.3 — relâche la liste ouverte sur UN import (le lien « voir les N contacts »). */
  onClearImportJob: () => void
}

export function useContactsNavigation(from: '/contacts/' = '/contacts/'): ContactsNavigation {
  const navigate = useNavigate({ from })

  const onQueryChange = useCallback(
    (next: string) => {
      const trimmed = next.trim()
      void navigate({
        search: prev => ({ ...prev, q: trimmed.length > 0 ? next : undefined }),
        replace: true,
      })
    },
    [navigate],
  )

  const onFiltersChange = useCallback(
    (next: ActiveFilter[]) => {
      const map: Record<string, string | undefined> = {}
      for (const { id, value } of next) map[id] = value
      void navigate({
        search: prev => {
          const updated = { ...prev } as Record<string, unknown>
          for (const key of FILTER_BAR_KEYS) {
            updated[key] = key === 'role' && map[key] === 'all' ? undefined : map[key]
          }
          return updated
        },
      })
    },
    [navigate],
  )

  const onAddFilter = useCallback(
    (filterId: string, value: string) => {
      // #1687 — le NOM du filtre, jamais sa valeur (« secteur=banque » désigne
      // une stratégie commerciale) : `value` n'atteint jamais `trackFilterApplied`.
      trackFilterApplied(CONTACTS_SCREEN, filterId)
      void navigate({ search: prev => ({ ...prev, [filterId]: value }) })
    },
    [navigate],
  )

  /**
   * La PORTÉE de la liste : toutes, ou celles à qualifier.
   *
   * #1473 — un second onglet, et non un réglage à part : les deux sont
   * exclusifs, donc UN seul handler les écrit.
   */
  const onScopeChange = useCallback(
    (next: ContactScope) => {
      void navigate({
        search: prev => ({
          ...prev,
          unassigned: next === 'unassigned' ? true : undefined,
        }),
      })
    },
    [navigate],
  )

  // La pastille de cycle de vie vit dans l'URL (et non dans un state local) :
  // le filtrage est server-side, donc le param doit atteindre `ContactListQuery`.
  const onLifecycleFilterChange = useCallback(
    (next: LifecycleFilterValue) => {
      void navigate({
        search: prev => ({ ...prev, state: next === 'all' ? undefined : next }),
      })
    },
    [navigate],
  )

  // "Effacer les filtres" clears the bar filters AND resets the scope, so a
  // single action returns to a clean "Tous / no filter" state.
  const onClearFilters = useCallback(() => {
    void navigate({
      search: prev => {
        const updated = { ...prev } as Record<string, unknown>
        for (const key of FILTER_BAR_KEYS) updated[key] = undefined
        // #1473 — « Effacer les filtres » ramène AUSSI la portée à « Toutes ».
        // L'oublier laisserait la liste vide sur « à qualifier » après un clic
        // censé tout rouvrir.
        updated['unassigned'] = undefined
        updated['state'] = undefined
        // #4597.3 — la liste ouverte sur UN import se relâche aussi.
        updated['importJob'] = undefined
        return updated
      },
    })
  }, [navigate])

  /**
   * #2158.6 — la vue sélectionnée, dans l'URL. #3527 : « Toutes » est le DÉFAUT
   * (Louis 01/10, renverse #2158.72 « à contacter ») : l'écrire quand même bookmarkerait un choix
   * que personne n'a fait, exactement le défaut que `role=all` évite déjà
   * plus haut.
   */
  const onViewChange = useCallback(
    (next: ContactViewFilterValue) => {
      void navigate({
        search: prev => ({ ...prev, view: next === 'all' ? undefined : next }),
      })
    },
    [navigate],
  )

  const onClearImportJob = useCallback(() => {
    void navigate({ search: prev => ({ ...prev, importJob: undefined }) })
  }, [navigate])

  return {
    onQueryChange,
    onFiltersChange,
    onAddFilter,
    onScopeChange,
    onLifecycleFilterChange,
    onClearFilters,
    onViewChange,
    onClearImportJob,
  }
}
