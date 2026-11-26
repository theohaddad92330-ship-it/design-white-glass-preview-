import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { DEFAULT_CHAT_RESEARCH_MODE, type ChatResearchMode } from '@bellum/contracts'

/**
 * La PROFONDEUR PAR DÉFAUT de Laura — Réglages › Laura › Comportement (maquette `settings-laura`, N1, Louis 22/10/2026).
 *
 * « Auto » laisse l'heuristique habituelle choisir le palier de modèle ; « Rapide » et « Approfondi » forcent le
 * mode de recherche d'un fil NEUF (`researchModeStore.ts`, qui lit ce défaut quand le fil n'a reçu aucun choix).
 * Un fil qui a déjà un mode explicite le garde : ce réglage ne rouvre jamais un choix fait (même discipline que
 * `workspaceDefaultMode` pour le contexte). « Vérifié » reste un choix de fil, pas un défaut.
 *
 * PERSONNEL et gardé sur CET appareil (`localStorage`) : il ne retire aucun droit et n'a aucun effet de facturation
 * au-delà de ce que le mode annonce déjà avant chaque recherche. Un stockage indisponible (navigation privée) retombe
 * sur « Auto » sans lever.
 */
export const LAURA_DEFAULT_DEPTHS = ['auto', 'rapide', 'approfondi'] as const satisfies readonly ChatResearchMode[]
type LauraDefaultDepth = (typeof LAURA_DEFAULT_DEPTHS)[number]

type LauraDefaultDepthStore = {
  depth: LauraDefaultDepth
  setDepth: (depth: LauraDefaultDepth) => void
}

export const useLauraDefaultDepthStore = create<LauraDefaultDepthStore>()(
  persist(
    set => ({
      depth: DEFAULT_CHAT_RESEARCH_MODE as LauraDefaultDepth,
      setDepth: depth => set({ depth }),
    }),
    {
      name: 'bellum.laura.defaultDepth',
      storage: createJSONStorage(() => localStorage),
      partialize: state => ({ depth: state.depth }),
    },
  ),
)
