import { createContext, useContext } from 'react'
import type { ReplyTransformRequest } from '@bellum/contracts'

/**
 * #3768 (BEL-LAU-1014) — la porte entre le pied de réponse et l'envoi d'un tour.
 *
 * `Chat.tsx` fournit UN geste (`onTransform`) ; `ReplyFooter` le lit, sans que
 * quatre niveaux de props le portent (le geste n'a rien à voir avec les
 * messages qu'ils traversent). Sans fournisseur — la bulle de Laura (`LauraDock`),
 * un test — la valeur est `null` et le menu ne s'affiche pas : une absence ne
 * fait aucune ligne.
 */
type ReplyTransformGate = {
  onTransform: (request: ReplyTransformRequest, label: string) => void
  disabled: boolean
}

const ReplyTransformContext = createContext<ReplyTransformGate | null>(null)

export const ReplyTransformProvider = ReplyTransformContext.Provider

export function useReplyTransform(): ReplyTransformGate | null {
  return useContext(ReplyTransformContext)
}
