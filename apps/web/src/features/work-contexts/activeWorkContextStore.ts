import { create } from 'zustand'

/**
 * #2455.5 — le contexte de travail ACTIF, affiché clairement pendant qu'il
 * l'est. En mémoire seulement (pas de `persist`) : un contexte actif ne doit
 * pas survivre silencieusement à un rechargement complet — on préfère qu'il
 * redemande d'activer plutôt qu'il applique un contexte oublié sans le dire.
 */
type ActiveWorkContext = { id: string; name: string } | null

type ActiveWorkContextStore = {
  active: ActiveWorkContext
  activate: (context: { id: string; name: string }) => void
  clear: () => void
}

export const useActiveWorkContextStore = create<ActiveWorkContextStore>(set => ({
  active: null,
  activate: context => set({ active: context }),
  clear: () => set({ active: null }),
}))
