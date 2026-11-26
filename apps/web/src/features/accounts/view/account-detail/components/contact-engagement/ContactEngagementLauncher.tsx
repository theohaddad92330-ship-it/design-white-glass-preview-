import type { Contact } from '@bellum/contracts'
import { TooltipButton } from '@bellum/ui'
import { MessageCircle } from 'lucide-react'
import { useEffect, useRef, type WheelEvent } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { channelIcon } from './channel'
import { EngagementTab } from './EngagementTab'
import { ABOVE_FLOATING_BUTTONS_BOTTOM, BESIDE_FLOATING_BUTTONS_PADDING } from './floating-reserve'
import type { EngagementChannel } from './types'

type ContactEngagementLauncherProps = {
  activeContactId?: string | null
  channel?: EngagementChannel
  channelsByContactId?: Record<string, EngagementChannel>
  contact?: Contact
  contacts?: Contact[]
  inline?: boolean
  onOpen?: () => void
  onCloseContact?: (contactId: string) => void
  onOpenContact?: (contactId: string, rect?: DOMRect) => void
  onTabLayout?: (contactId: string, rect: DOMRect) => void
}

export function ContactEngagementLauncher({
  activeContactId,
  channel,
  channelsByContactId,
  contact,
  contacts,
  inline = false,
  onOpen,
  onCloseContact,
  onOpenContact,
  onTabLayout,
}: ContactEngagementLauncherProps) {
  const { t } = useTranslation('engagement')
  if (typeof document === 'undefined') return null

  const launcherContacts = contacts && contacts.length > 0 ? contacts : contact ? [contact] : []

  if (launcherContacts.length === 1 && contact && channel && onOpen) {
    const ChannelIcon = channelIcon(channel)

    // #3487.3 — au-dessus des boutons flottants Laura et bug (bas 1rem, 44 px) :
    // à bottom-6 le chip du composeur réduit était recouvert.
    return createPortal(
      <div className={`fixed ${ABOVE_FLOATING_BUTTONS_BOTTOM} right-4 z-40 flex items-center gap-2`}>
        <TooltipButton
          tooltip={t('launcher.reopen', { name: contact.full_name })}
          variant="black"
          size="sm"
          aria-label={t('launcher.reopen', { name: contact.full_name })}
          className="h-10 rounded-full px-3 shadow-[0_12px_28px_color-mix(in_srgb,var(--bellum-text-primary)_16%,transparent)]"
          onClick={onOpen}
        >
          <MessageCircle className="mr-2 size-4" />
          {t('launcher.approach')}
          <ChannelIcon className="ml-1.5 size-3.5 opacity-70" />
        </TooltipButton>
      </div>,
      document.body,
    )
  }

  // Le lanceur ne porte plus que les onglets d'engagement : sans contact
  // ouvert, il n'y a rien à rendre. (Avant, la pastille « Copilote partagé »
  // occupait cette barre en permanence — son retrait la laisserait vide.)
  if (launcherContacts.length === 0) return null

  const tabs = (
    <InlineLauncherTabs
      activeContactId={activeContactId}
      channel={channel ?? 'linkedin'}
      channelsByContactId={channelsByContactId}
      contacts={launcherContacts}
      onCloseContact={onCloseContact}
      onOpenContact={onOpenContact}
      onTabLayout={onTabLayout}
    />
  )

  if (inline) return tabs

  return createPortal(
    <div className={`fixed inset-x-0 ${ABOVE_FLOATING_BUTTONS_BOTTOM} z-40 flex justify-center px-4`}>{tabs}</div>,
    document.body,
  )
}

function InlineLauncherTabs({
  activeContactId,
  channel,
  channelsByContactId,
  contacts,
  onCloseContact,
  onOpenContact,
  onTabLayout,
}: {
  activeContactId?: string | null
  channel: EngagementChannel
  channelsByContactId?: Record<string, EngagementChannel>
  contacts: Contact[]
  onCloseContact?: (contactId: string) => void
  onOpenContact?: (contactId: string, rect?: DOMRect) => void
  onTabLayout?: (contactId: string, rect: DOMRect) => void
}) {
  const activeTabRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!activeContactId || !activeTabRef.current) return
    onTabLayout?.(activeContactId, activeTabRef.current.getBoundingClientRect())
    activeTabRef.current.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [activeContactId, contacts, onTabLayout])

  return (
    <div className={`flex min-w-0 max-h-7 w-full items-center overflow-hidden ${BESIDE_FLOATING_BUTTONS_PADDING}`}>
      <div
        className="w-full min-w-0 overflow-x-auto overscroll-x-contain scrollbar-thin scrollbar-track-transparent scrollbar-thumb-[var(--bellum-border)]"
        onWheel={handleTabsWheel}
      >
        <div className="ml-auto flex w-max min-w-max items-center gap-2 px-1">
          {contacts.map(item => {
            const isActive = activeContactId === item.id

            return (
              <div key={item.id} ref={isActive ? activeTabRef : undefined}>
                <EngagementTab
                  active={isActive}
                  channel={channelsByContactId?.[item.id] ?? channel}
                  contact={item}
                  onClose={onCloseContact}
                  onOpen={onOpenContact}
                />
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function handleTabsWheel(event: WheelEvent<HTMLDivElement>) {
  if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return
  event.currentTarget.scrollLeft += event.deltaY
  event.preventDefault()
}
