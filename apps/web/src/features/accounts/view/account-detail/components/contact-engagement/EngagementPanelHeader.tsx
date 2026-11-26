import type { Contact } from '@bellum/contracts'
import { Text, TooltipButton } from '@bellum/ui'
import { Maximize2, Minimize2, Minus, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { channelIcon, channelLabel } from './channel'
import type { EngagementChannel } from './types'

type EngagementPanelHeaderProps = {
  channel: EngagementChannel
  activeContactId?: string
  contact: Contact
  contacts?: Contact[]
  maximized: boolean
  onContactChange?: (contactId: string) => void
  onClose: () => void
  onMaximize: () => void
  onMinimize: () => void
}

export function EngagementPanelHeader({
  channel,
  contact,
  maximized,
  onClose,
  onMaximize,
  onMinimize,
}: EngagementPanelHeaderProps) {
  const { t } = useTranslation('engagement')
  const { t: tOutreach } = useTranslation('outreach')
  const ChannelIcon = channelIcon(channel)

  return (
    <div className="border-b border-[var(--bellum-border)] px-5 pt-5 pb-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <Text weight="semibold" size="base" className="truncate leading-5 tracking-normal">
            {t('panel.title')}
          </Text>
          <Text size="xs" className="mt-1 truncate text-[var(--bellum-text-secondary)]">
            {contact.full_name}
            {contact.title ? ` · ${contact.title}` : ''}
          </Text>
          {/* #3696.7 — le canal dit où part ce message, à côté du contact : jamais deviné au vu des seules icônes. */}
          <Text size="xs" className="mt-1 flex items-center gap-1 text-[var(--bellum-text-muted)]">
            <ChannelIcon aria-hidden="true" className="size-3 shrink-0" />
            {channelLabel(channel)}
          </Text>
          {/* #3702.8 — la promesse de la carte de prise de contact (clé unique, partagée avec le dialogue de séquence). */}
          <Text size="xs" className="mt-1 text-[var(--bellum-text-muted)]">
            {tOutreach('card.neverAutoSend')}
          </Text>
        </div>
        <PanelControls maximized={maximized} onClose={onClose} onMaximize={onMaximize} onMinimize={onMinimize} />
      </div>
    </div>
  )
}

function PanelControls({
  maximized,
  onClose,
  onMaximize,
  onMinimize,
}: {
  maximized: boolean
  onClose: () => void
  onMaximize: () => void
  onMinimize: () => void
}) {
  const { t } = useTranslation('engagement')
  const ResizeIcon = maximized ? Minimize2 : Maximize2
  const resizeLabel = maximized ? t('controls.collapse') : t('controls.expand')

  return (
    <div className="flex items-center gap-1 text-[var(--bellum-text-muted)]">
      <TooltipButton
        tooltip={t('controls.minimize')}
        variant="ghost"
        size="icon"
        aria-label={t('controls.minimize')}
        className="size-6 rounded-full"
        onClick={onMinimize}
      >
        <Minus className="size-4" />
      </TooltipButton>
      <TooltipButton
        tooltip={resizeLabel}
        variant="ghost"
        size="icon"
        aria-label={resizeLabel}
        className="size-6 rounded-full"
        onClick={onMaximize}
      >
        <ResizeIcon className="size-4" />
      </TooltipButton>
      <TooltipButton
        tooltip={t('common:actions.close')}
        variant="ghost"
        size="xs"
        aria-label={t('common:actions.close')}
        className="size-6 rounded-full"
        onClick={onClose}
      >
        <X className="size-4" />
      </TooltipButton>
    </div>
  )
}
