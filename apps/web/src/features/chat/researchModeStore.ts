import { create } from 'zustand'
import type { ChatResearchMode } from '@bellum/contracts'
import { useLauraDefaultDepthStore } from './laura-default-depth-store'

/**
 * #2450.1 / #2448.1 (reste, épopée #2882) — LE MODE DE RECHERCHE, PAR
 * CONVERSATION, pour l'écran `/chat` plein écran.
 *
 * Même patron que `contextModeStore.ts` (#2451.6) : une clé par fil, EN
 * MÉMOIRE seulement (pas de `persist`) — un fil neuf revient sur `auto` sans
 * qu'aucune ligne n'ait à le remettre à zéro. Distinct du magasin de la bulle
 * (`LauraDock`, état local éphémère) : les deux surfaces ne partagent jamais
 * le même fil, donc jamais le même mode.
 */
type ResearchModeStore = {
  modes: Record<string, ChatResearchMode>
  setMode: (conversationId: string, mode: ChatResearchMode) => void
}

export const useResearchModeStore = create<ResearchModeStore>(set => ({
  modes: {},
  setMode: (conversationId, mode) => set(state => ({ modes: { ...state.modes, [conversationId]: mode } })),
}))

/** Le mode d'un fil — la profondeur par défaut de la personne (Réglages › Laura › Comportement ; 'auto' tant
 *  qu'elle n'en a pas réglé) pour un fil sans choix ou sans identifiant. Un mode déjà choisi garde la priorité. */
export function researchModeFor(
  modes: Record<string, ChatResearchMode>,
  conversationId: string | null | undefined,
): ChatResearchMode {
  return (conversationId && modes[conversationId]) || useLauraDefaultDepthStore.getState().depth
}
