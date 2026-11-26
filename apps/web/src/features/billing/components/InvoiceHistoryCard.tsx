import { Box, Text } from '@bellum/ui'
import { motion } from 'framer-motion'
import { Calendar } from 'lucide-react'
import { memo } from 'react'
import { useTranslation } from 'react-i18next'

export const InvoiceHistoryCard = memo(function InvoiceHistoryCard() {
  const { t } = useTranslation('billing')
  const columns = [
    t('invoiceHistoryCard.columnDate'),
    t('invoiceHistoryCard.columnAmount'),
    t('invoiceHistoryCard.columnStatus'),
    t('common:actions.download'),
  ]

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1, duration: 0.4, ease: 'easeOut' as const }}
      className="rounded-xl border border-neutral-200 dark:border-white/10 bg-card dark:bg-neutral-900 overflow-hidden"
    >
      <Box
        as="header"
        display="flex"
        px={6}
        py={4}
        className="items-center gap-3 border-b border-[var(--bellum-border)]"
      >
        <Box rounded="lg" display="flex" className="size-9 items-center justify-center bg-[var(--bellum-surface-2)]">
          <Calendar className="size-4 text-[var(--bellum-text-secondary)]" />
        </Box>
        <Box>
          <Text element="h3" size="sm" weight="semibold" color="text-[var(--bellum-text-primary)]">
            {t('invoiceHistoryCard.title')}
          </Text>
          <Text size="xs" color="text-[var(--bellum-text-secondary)]" className="mt-0.5">
            {t('invoiceHistoryCard.subtitle')}
          </Text>
        </Box>
      </Box>

      <Box
        px={6}
        py={3}
        className="grid gap-4 border-b border-[var(--bellum-border)]"
        style={{ gridTemplateColumns: '1fr 120px 100px 80px' }}
      >
        {columns.map(h => (
          <Text key={h} element="span" size="sm" color="text-[var(--bellum-text-secondary)]">
            {h}
          </Text>
        ))}
      </Box>

      <Box px={6} py={10} className="text-center">
        <Text size="sm" color="text-[var(--bellum-text-secondary)]">
          {t('invoiceHistoryCard.empty')}
        </Text>
      </Box>
    </motion.section>
  )
})
