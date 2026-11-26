import { useCurrentUserStore } from '@/stores/currentUserStore'

/**
 * #3713.9 — L'ÉTAT DE TRAVAIL de la liste Contacts, gardé hors du composant.
 *
 * Recherche et filtres vivent déjà dans l'URL (`contactsSearchSchema`) ; la
 * SÉLECTION et la POSITION de défilement, non : ouvrir une fiche démontait la
 * liste et le travail était perdu. Ce petit magasin de module les garde le
 * temps de la session de l'onglet — jamais persistés (aucune donnée de
 * contact ne va dans le stockage du navigateur) et vidés au rechargement.
 */
type SelectedContact = { id: string }

type WorkState<T extends SelectedContact> = {
  selected: ReadonlyMap<string, T>
  scrollY: number | null
}

let state: WorkState<SelectedContact> = { selected: new Map(), scrollY: null }

export const contactsWorkState = {
  save<T extends SelectedContact>(next: { selected: ReadonlyMap<string, T>; scrollY: number }) {
    state = { selected: new Map(next.selected), scrollY: next.scrollY }
  },
  read<T extends SelectedContact>(): WorkState<T> {
    return { selected: new Map(state.selected) as unknown as ReadonlyMap<string, T>, scrollY: state.scrollY }
  },
  reset() {
    state = { selected: new Map(), scrollY: null }
  },
}

// Une autre personne (déconnexion, changement de compte) ne retrouve JAMAIS la
// sélection de la précédente : le magasin se vide dès que l'identité change.
let lastUserId = useCurrentUserStore.getState().currentUser?.id ?? null
useCurrentUserStore.subscribe(({ currentUser }) => {
  const id = currentUser?.id ?? null
  if (id !== lastUserId) contactsWorkState.reset()
  lastUserId = id
})
