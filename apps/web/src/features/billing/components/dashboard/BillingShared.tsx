import { Text } from '@bellum/ui'
import { Check, Lock, ReceiptText } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export function MetricBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <Text size="xs" weight="medium" className="text-[var(--bellum-text-muted)]">
        {label}
      </Text>
      <Text size="lg" weight="semibold" className="mt-1">
        {value}
      </Text>
    </div>
  )
}

export function BenefitsList({ items }: { items: string[] }) {
  return (
    <ul className="mt-2 grid gap-1.5">
      {items.map(item => (
        <li key={item} className="flex items-center gap-2 text-sm text-[var(--bellum-text-secondary)]">
          <Check className="size-4 text-[var(--success-soft-text)]" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}

/**
 * Read-only notice shown to workspace members (non-owners): the subscription is
 * shared and only the workspace owner can change it.
 */
export function ManagedByOwnerNotice() {
  const { t } = useTranslation('billing')
  return (
    <div className="flex items-start gap-2 rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-bg)] p-3">
      <Lock className="mt-0.5 size-4 shrink-0 text-[var(--bellum-text-muted)]" />
      <Text size="sm" className="text-[var(--bellum-text-secondary)]">
        {t('shared.ownerNotice')}
      </Text>
    </div>
  )
}

export function EmptyInvoice() {
  const { t } = useTranslation('billing')
  return (
    <div className="flex items-center gap-3 rounded-lg border border-dashed border-[var(--bellum-border)] p-4">
      <ReceiptText className="size-5 shrink-0 text-[var(--bellum-text-muted)]" />
      <Text size="sm" className="text-[var(--bellum-text-secondary)]">
        {t('shared.emptyInvoiceText')}
      </Text>
    </div>
  )
}
