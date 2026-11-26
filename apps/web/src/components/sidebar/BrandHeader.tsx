import { Logo, Text, Box } from '@bellum/ui'
import { useBrand } from '@/features/brand/brand-context'
import { memo } from 'react'
import { BackgroundTasksIndicator } from './background-tasks/BackgroundTasksIndicator'
import { useBackgroundEntries } from './background-tasks/useBackgroundEntries'
import { useHasRunningAnalysis } from './background-tasks/useHasRunningAnalysis'

export const BrandHeader = memo(function BrandHeader() {
  const { entries } = useBackgroundEntries()
  const hasRunningAnalysis = useHasRunningAnalysis(entries)
  const brand = useBrand()

  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm ">
        {brand.logoUrl ? (
          // Bornée en hauteur ET en largeur : un logo vient de quelqu'un
          // d'autre, on ne sait rien de ses proportions.
          <img src={brand.logoUrl} alt={brand.name} className="h-6 w-6 rounded-lg object-contain" />
        ) : (
          <Logo aria-label={brand.name} className="rounded-lg text-[var(--bellum-text-primary)]" />
        )}
      </div>
      {hasRunningAnalysis ? (
        <BackgroundTasksIndicator />
      ) : (
        <Box display="flex" className="min-w-0 items-center gap-2">
          {' '}
          <Text weight="medium" size="sm" className="truncate">
            {brand.name}
          </Text>
        </Box>
      )}
    </div>
  )
})
