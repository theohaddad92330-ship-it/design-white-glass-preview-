import { create } from 'zustand'

/**
 * L'état ouvert/fermé de la recherche globale (#2207.67, épopée #3015).
 *
 * Un store et non un `useState` local : deux appelants distincts doivent
 * pouvoir l'ouvrir — le raccourci `⌘⇧K`, écouté par `ShortcutsProvider` monté
 * à la racine, et le bouton `GlobalSearchTrigger`, monté dans `AppSidebar`, qui
 * n'est pas un parent de `ShortcutsProvider`. Ni persistée ni partagée entre
 * onglets : une modale ouverte n'a aucun sens à la prochaine visite.
 */
interface GlobalSearchState {
  isOpen: boolean
  open: () => void
  close: () => void
  setOpen: (open: boolean) => void
}

export const useGlobalSearchStore = create<GlobalSearchState>()(set => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  setOpen: open => set({ isOpen: open }),
}))
