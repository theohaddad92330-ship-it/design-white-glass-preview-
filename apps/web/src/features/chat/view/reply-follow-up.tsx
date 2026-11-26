import type { FollowUpRef } from '@bellum/contracts'
import { createContext, useContext, type ReactNode } from 'react'

/**
 * #3762 — LE GESTE « ENVOYER CE MESSAGE » OFFERT AUX CARTES DE RÉPONSE.
 *
 * Les actions finales d'une cartographie (« enrichir la recherche », « valider »,
 * « sauvegarder ») n'ont pas toujours d'écran où mener : c'est une SUITE de la
 * conversation. Même geste que `ReplyOptions` / `ClarificationOptions` (`Chat.tsx`) :
 * cliquer envoie le libellé comme message de l'utilisateur, et Laura répond —
 * elle PRÉPARE, elle n'envoie rien. Même principe de contexte que
 * `reply-conversation.tsx` : la carte naît sous plusieurs niveaux de composants
 * qui n'ont pas de raison de connaître le composeur.
 *
 * #4397 — l'identifiant d'un objet désigné (consultant du vivier) part en MÉTADONNÉE
 * (`followUpRef`), jamais dans le texte du message.
 *
 * Sans fournisseur (fil partagé en lecture seule, amorce de Laura, fil relu),
 * `useReplyFollowUp()` rend `null` et la carte écrit le libellé en texte — jamais
 * un bouton qui ne fait rien.
 */
type ReplyFollowUp = (message: string, followUpRef?: FollowUpRef) => void

const ReplyFollowUpContext = createContext<ReplyFollowUp | null>(null)

export function ReplyFollowUpProvider({ onSend, children }: { onSend: ReplyFollowUp | null; children: ReactNode }) {
  return <ReplyFollowUpContext.Provider value={onSend}>{children}</ReplyFollowUpContext.Provider>
}

export function useReplyFollowUp(): ReplyFollowUp | null {
  return useContext(ReplyFollowUpContext)
}
