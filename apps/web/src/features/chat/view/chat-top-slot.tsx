import { createContext, useContext, type ReactNode } from 'react'

/**
 * #3192.2 (recette Z2 04/10) — un emplacement EN TÊTE du fil, qui défile avec lui.
 *
 * Le bandeau « Bien démarrer avec Bellum » vivait au-dessus du fil, fixe : 56 px
 * + sa marge retirés EN PERMANENCE à la zone de messages (49 % de la hauteur à
 * 1512×805, cible ≥ 60 %). Posé ici, il reste atteignable (il ouvre le fil) puis
 * s'efface en haut dès qu'on lit.
 *
 * Un contexte plutôt qu'une prop : la route monte le bandeau (il lit react-query,
 * que les suites unitaires de `Chat` n'ont pas) et `Chat` n'en connaît que
 * l'emplacement. Défaut `null` = le fil d'avant, byte-identique.
 */
const ChatTopSlotContext = createContext<ReactNode>(null)

export const ChatTopSlotProvider = ChatTopSlotContext.Provider

export function ChatTopSlot() {
  const node = useContext(ChatTopSlotContext)
  return node ? <div data-testid="chat-top-slot">{node}</div> : null
}
