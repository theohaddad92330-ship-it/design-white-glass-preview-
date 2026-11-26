import type { Contact } from '@bellum/contracts'
import { Text, Tooltip, TooltipContent, TooltipTrigger, cn } from '@bellum/ui'
import { X } from 'lucide-react'
import { useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import { channelIcon } from './channel'
import { useOptionalContactEngagement } from './ContactEngagementContext'
import type { EngagementChannel } from './types'

type EngagementTabProps = {
  active: boolean
  channel: EngagementChannel
  contact: Contact
  onClose?: (contactId: string) => void
  onOpen?: (contactId: string, rect?: DOMRect) => void
}

const noopSubscribe = () => () => undefined

export function EngagementTab({ active, channel, contact, onClose, onOpen }: EngagementTabProps) {
  const { t } = useTranslation('engagement')
  const Icon = channelIcon(channel)
  // #3696.8 — fermer le panneau n'arrête pas la rédaction : l'onglet le dit, sans rien inventer
  // (ni durée, ni avancement — seulement « en cours »).
  const drafts = useOptionalContactEngagement()?.drafts
  const writing = useSyncExternalStore(
    drafts?.subscribe ?? noopSubscribe,
    () => drafts?.isContactPending(contact.id) ?? false,
  )

  return (
    <Tooltip>
      <div
        className={cn(
          'flex h-7 min-w-0 shrink-0 items-center duration-150 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] rounded-xl transition-[background-color,box-shadow] hover:bg-[var(--bellum-surface-2)]',
          active ? 'bg-[var(--bellum-surface-2)]' : '',
        )}
      >
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={event => onOpen?.(contact.id, event.currentTarget.getBoundingClientRect())}
            className={cn(
              'flex min-w-0 items-center gap-1.5 px-2.5 py-1 text-left transition-colors',
              active ? 'text-[var(--bellum-text-primary)]' : 'text-[var(--bellum-text-secondary)]',
            )}
          >
            <Icon className="size-3 shrink-0 opacity-80" />
            <Text size="xs" weight="medium" noWrap className="max-w-[180px] truncate">
              {contact.full_name}
            </Text>
            {writing ? (
              <span
                role="status"
                aria-label={t('tab.writing')}
                className="size-1.5 shrink-0 rounded-full bg-[var(--bellum-text-accent)]"
              />
            ) : null}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" align="center" sideOffset={8} className="max-w-[260px] text-left">
          <div className="space-y-0.5">
            <Text size="xs" weight="medium">
              {t('tab.contactTooltip', { name: contact.full_name })}
            </Text>
            {writing ? (
              <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                {t('tab.writing')}
              </Text>
            ) : null}
          </div>
        </TooltipContent>

        <button
          type="button"
          aria-label={t('tab.closeAria', { name: contact.full_name })}
          onClick={() => onClose?.(contact.id)}
          className={cn(
            'mr-1 flex size-5 shrink-0 items-center justify-center rounded transition-[background-color,color] duration-150',
            active
              ? 'text-[var(--bellum-text-primary)]'
              : 'text-[var(--bellum-text-muted)] hover:bg-[var(--bellum-surface-2)]',
          )}
        >
          <X className="size-3" />
        </button>
      </div>
    </Tooltip>
  )
}
