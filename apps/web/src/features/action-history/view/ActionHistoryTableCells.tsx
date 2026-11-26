import type { ActionHistoryItem } from '@bellum/contracts'
import { useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Text,
  cn,
  EntityAvatar,
} from '@bellum/ui'
import { Copy, Eye, MoreHorizontal, type LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ACTION_ICON_CHIP_CLASS, actionDetail, actionLabel } from './actionHistoryPresentation'
import { CompanyAvatar } from '@/components/ui/CompanyAvatar'
import { i18n } from '@/i18n'

export function ActionCell({ item, icon: Icon }: { item: ActionHistoryItem; icon: LucideIcon }) {
  const { t } = useTranslation('actions')
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg', ACTION_ICON_CHIP_CLASS)}>
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <Text element="span" size="sm" weight="semibold" noWrap className="block text-[var(--bellum-text-primary)]">
          {actionLabel(t, item)}
        </Text>
        <Text element="span" size="xs" noWrap className="mt-0.5 block text-[var(--bellum-text-secondary)]">
          {actionDetail(t, item)}
        </Text>
      </div>
    </div>
  )
}

export function UserCell({ name, initials }: { name: string; initials: string }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <EntityAvatar name={initials} size="sm" />
      <Text element="span" size="sm" weight="medium" noWrap className="text-[var(--bellum-text-primary)]">
        {name}
      </Text>
    </div>
  )
}

export function EntityCell({ name, initials }: { name: string; initials: string }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <CompanyAvatar name={initials} />
      <Text element="span" size="sm" weight="medium" noWrap className="text-[var(--bellum-text-primary)]">
        {name}
      </Text>
    </div>
  )
}

export function RowActions({ item }: { item: ActionHistoryItem }) {
  const { t } = useTranslation('actions')
  const navigate = useNavigate()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('table.rowActionsAria', { label: actionLabel(t, item) })}
          className="ml-auto size-8"
          onClick={event => event.stopPropagation()}
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onSelect={() => navigate({ to: '/actions/$id', params: { id: item.id } })}>
          <Eye className="mr-2 size-4" />
          {t('table.viewDetail')}
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={event => {
            event.stopPropagation()
            void copyActionId(item.id)
          }}
        >
          <Copy className="mr-2 size-4" />
          {t('table.copyId')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

async function copyActionId(id: string) {
  try {
    await writeClipboardText(id)
    toast.success(i18n.t('actions:toast.idCopied'))
  } catch {
    toast.error(i18n.t('actions:toast.idCopyFailed'))
  }
}

async function writeClipboardText(text: string) {
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(text)
    return
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand('copy')
  textarea.remove()
}
