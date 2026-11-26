import { createContext, useContext } from 'react'
import type { Contact } from '@bellum/contracts'
import type { EngagementDraftStore } from './draft-store'
import type { MessageParameters } from './message-parameters'
import type { EngagementChannel } from './types'

type ContactEngagementOpenOptions = {
  anchorRect?: DOMRect
  rawAnalysis?: Record<string, unknown>
  /**
   * #3697.5 — « Préparer mon appel » : le support oral se prépare même sans numéro. Le canal
   * Appel est alors offert pour ce contact, et seulement parce que le commercial l'a demandé.
   */
  callPreparation?: boolean
  /**
   * #3263.46/.48 — un CTA qui connaît déjà l'objectif (« préparer l'approche », « créer une
   * introduction ») le porte à l'ouverture plutôt que de forcer un second choix dans le composeur.
   * Absent = comportement historique (`{}`, rien de pré-choisi).
   */
  initialParameters?: MessageParameters
  /** #4415.2 — l'angle de l'étape du plan qui ouvre le préparateur : le champ d'angle s'ouvre rempli. */
  initialContext?: string
}

/**
 * Ce contexte ne porte plus QUE l'engagement par contact (rédaction d'un message
 * sortant). Le volet « agent » — le chat flottant global — a été retiré au
 * profit du Copilote IA (`/chat`), qui est désormais la seule surface de chat.
 */
export type ContactEngagementContextValue = {
  activeContactId: string | null
  activePanel: ContactEngagementPanelKind | null
  activeEngagement: ContactEngagementState | null
  lastEngagement: ContactEngagementState | null
  closeContact: (contactId: string) => void
  closePanel: () => void
  openContact: (contactId: string, rect?: DOMRect) => void
  openEngagement: (contacts: Contact[], channel: EngagementChannel, options?: ContactEngagementOpenOptions) => void
  registerTabLayout: (contactId: string, rect: DOMRect) => void
  setActiveContact: (contactId: string) => void
  setChannel: (channel: EngagementChannel) => void
  toggleMaximized: () => void
  tabAnchors: Record<string, DOMRect>
  closingEngagement: boolean
  maximized: boolean
  panelInstanceId: number
  /** #3696.4 — le fil de chaque contact survit à la fermeture du panneau. */
  drafts: EngagementDraftStore
}

export type ContactEngagementPanelKind = 'contact'

export type ContactEngagementState = {
  activeContactId: string
  anchorRect?: DOMRect | null
  channel: EngagementChannel
  channelsByContactId: Record<string, EngagementChannel>
  contacts: Contact[]
  rawAnalysis: Record<string, unknown>
  /** #3697.5 — le canal Appel est offert même sans numéro (support d'appel demandé). */
  callPreparation?: boolean
  /** #3263.46/.48 — l'objectif porté par le CTA qui a ouvert cet engagement, s'il y en a un. */
  initialParameters?: MessageParameters
  /** #4415.2 — l'angle de l'étape du plan, s'il y en a un. */
  initialContext?: string
}

export const ContactEngagementContext = createContext<ContactEngagementContextValue | null>(null)

export function useContactEngagement() {
  const context = useContext(ContactEngagementContext)
  if (!context) throw new Error('useContactEngagement must be used within ContactEngagementProvider')
  return context
}

export function useOptionalContactEngagement() {
  return useContext(ContactEngagementContext)
}
