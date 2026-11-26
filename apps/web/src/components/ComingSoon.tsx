import { Box, Text } from '@bellum/ui'
import { Construction } from 'lucide-react'
import { memo } from 'react'
import { useTranslation } from 'react-i18next'

type ComingSoonProps = {
  title: string
  description?: string
}

/**
 * Placeholder for routes that exist in the navigation but aren't built yet.
 * Used by settings sub-pages that haven't been split out of the main
 * preferences screen.
 */
export const ComingSoon = memo<ComingSoonProps>(function ComingSoon({ title, description }) {
  const { t } = useTranslation('common')
  return (
    <Box className="flex flex-col items-center justify-center py-20 text-center gap-4">
      <Box className="flex size-12 items-center justify-center rounded-full bg-[var(--bg-surface-hover)] text-[var(--text-muted)]">
        <Construction className="size-6" />
      </Box>
      <Box className="space-y-1">
        <Text element="h2" size="lg" weight="semibold" className="text-[color:var(--text-primary)]">
          {title}
        </Text>
        <Text size="sm" className="text-[var(--text-ghost)]">
          {description ?? t('comingSoon.sectionSoon')}
        </Text>
      </Box>
    </Box>
  )
})
