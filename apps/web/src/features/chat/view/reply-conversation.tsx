import { createContext, useContext, type ReactNode } from 'react'

/**
 * #1903.20 / #1933.8 — LE FIL SOURCE, OFFERT AUX LIENS QU'UNE RÉPONSE CONTIENT.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT MESURÉ EN RECETTE (passage 7, 17/09)
 * ─────────────────────────────────────────────────────────────────────────
 * « le lien Vivier d'un fil de Laura ouvre /consultants SANS from=chat:<id> » :
 * `withReturnToConversation` (`@/lib/return-to-conversation.ts`) n'était appelé
 * QUE par `PendingActions.tsx` — les cartes de proposition (`find_accounts`,
 * `prepare_campaign`, `open_screen`). Le JUMEAU qui échappait : `InternalLink`
 * (`markdown.tsx`), qui rend à la fois le lien écrit dans le TEXTE de la
 * réponse ET `CardLink` (`ReplyCard.tsx`, réutilisé par `VerdictCard`,
 * `AccountRankingCard`, `MissingDataCard`) — un lien de réponse structurée
 * partait donc nu lui aussi.
 *
 * Même principe que `discover-handoff.tsx` (#2472) : un contexte plutôt qu'une
 * prop, parce que le lien naît au fond du moteur markdown, sous plusieurs
 * niveaux de composants qui n'ont pas de raison de connaître la conversation.
 */
const ReplyConversationContext = createContext<string | null>(null)

/** Le fil source d'une réponse, posé une fois par `MessageBubble` (`Chat.tsx`). */
export function ReplyConversation({
  conversationId,
  children,
}: {
  conversationId: string | null
  children: ReactNode
}) {
  return <ReplyConversationContext.Provider value={conversationId}>{children}</ReplyConversationContext.Provider>
}

/** Le fil source de la réponse courante, `null` hors d'une réponse ou sans fil connu. */
export function useReplyConversationId(): string | null {
  return useContext(ReplyConversationContext)
}
