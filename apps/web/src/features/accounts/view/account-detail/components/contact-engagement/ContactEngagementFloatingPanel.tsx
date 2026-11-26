import type { Contact } from '@bellum/contracts'
import { useMemo } from 'react'
import { createPortal } from 'react-dom'
import { getAvailableChannels, getMenuChannels } from './channel'
import { EngagementPanel } from './EngagementPanel'
import { buildContactMessage, readObjections } from './message'
import type { MessageParameters } from './message-parameters'
import type { EngagementChannel } from './types'

type ContactEngagementFloatingPanelProps = {
  activeContactId?: string
  anchorRect?: DOMRect | null
  /** #3697.5 — le canal Appel est offert même sans numéro. */
  callPreparation?: boolean
  /** #3263.46/.48 — l'objectif porté par le CTA qui a ouvert cet engagement, s'il y en a un. */
  initialParameters?: MessageParameters
  /** #4415.2 — l'angle de l'étape du plan. */
  initialContext?: string
  channel: EngagementChannel
  closing: boolean
  contact: Contact
  contacts?: Contact[]
  rawAnalysis: Record<string, unknown>
  maximized: boolean
  onChannelChange: (channel: EngagementChannel) => void
  onContactChange?: (contactId: string) => void
  onClose: () => void
  onMaximize: () => void
  onMinimize: () => void
}

export function ContactEngagementFloatingPanel({
  activeContactId,
  anchorRect,
  callPreparation,
  initialParameters,
  initialContext,
  channel,
  closing,
  contact,
  contacts,
  rawAnalysis,
  maximized,
  onChannelChange,
  onContactChange,
  onClose,
  onMaximize,
  onMinimize,
}: ContactEngagementFloatingPanelProps) {
  const availableContacts = useMemo(() => (contacts && contacts.length > 0 ? contacts : [contact]), [contact, contacts])
  const activeContact = useMemo(
    () => availableContacts.find(item => item.id === activeContactId) ?? contact,
    [activeContactId, availableContacts, contact],
  )
  const channels = withMenuChannel(
    withCallPreparation(getAvailableChannels(activeContact), callPreparation),
    activeContact,
    channel,
  )
  const message = useMemo(() => buildContactMessage(activeContact, rawAnalysis), [activeContact, rawAnalysis])
  const objections = useMemo(() => readObjections(rawAnalysis), [rawAnalysis])

  if (channels.length === 0 || typeof document === 'undefined') return null

  return createPortal(
    <EngagementPanel
      activeContactId={activeContact.id}
      anchorRect={anchorRect}
      callPreparation={callPreparation}
      initialParameters={initialParameters}
      initialContext={initialContext}
      channel={channel}
      closing={closing}
      channels={channels}
      contact={activeContact}
      contacts={availableContacts}
      maximized={maximized}
      message={message}
      objections={objections}
      onChannelChange={onChannelChange}
      onContactChange={onContactChange}
      onClose={onClose}
      onMaximize={onMaximize}
      onMinimize={onMinimize}
    />,
    document.body,
  )
}

/** #2370 (R41) — le canal choisi au menu « Contacter » (note LinkedIn sans coordonnée) s'ouvre bel et bien. */
function withMenuChannel(
  channels: EngagementChannel[],
  contact: Contact,
  selected: EngagementChannel,
): EngagementChannel[] {
  return !channels.includes(selected) && getMenuChannels(contact).includes(selected)
    ? [...channels, selected]
    : channels
}

/** #3697.5 — le support d'appel demandé ajoute le canal Appel, jamais un autre canal inventé. */
function withCallPreparation(channels: EngagementChannel[], callPreparation?: boolean): EngagementChannel[] {
  return callPreparation && !channels.includes('phone') ? [...channels, 'phone'] : channels
}
