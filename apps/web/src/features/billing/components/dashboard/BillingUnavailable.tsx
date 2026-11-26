import { Box, Button, Text } from '@bellum/ui'
import { AlertTriangle } from 'lucide-react'
import { memo } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * Shown when the credits/subscription payload could not be loaded.
 *
 * The billing screen is built entirely from that payload, so there is nothing
 * honest to render without it. The alternative — a skeleton that never resolves,
 * or a plan card filled with the shipped baseline — either strands the user or
 * quotes them a plan that may not be theirs.
 */
export const BillingUnavailable = memo(function BillingUnavailable({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation('billing')

  return (
    <Box
      role="alert"
      className="mx-auto mt-10 flex w-full max-w-md flex-col items-center gap-3 rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] px-4 md:px-6 py-8 text-center"
    >
      <AlertTriangle className="size-6 text-[var(--warning-soft-text)]" aria-hidden />
      <Text element="p" size="sm" weight="semibold" className="text-[var(--bellum-text-primary)]">
        {t('unavailable.title')}
      </Text>
      <Text element="p" size="xs" color="var(--bellum-text-secondary)">
        {t('unavailable.body')}
      </Text>
      <Button size="sm" variant="outline" onClick={onRetry}>
        {t('unavailable.retry')}
      </Button>
    </Box>
  )
})
