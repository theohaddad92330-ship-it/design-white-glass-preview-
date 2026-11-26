import { Badge, Box, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Text } from '@bellum/ui'
import { Globe } from 'lucide-react'
import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { SettingsBlock } from '@/features/settings/components/SettingsBlocks'
import { workspaceMarketValues, type WorkspaceMarket } from '@bellum/contracts'
import { useWorkspaceMarket } from '@/features/team/hooks/useWorkspaceMarket'
import {
  getMarketLegalBasisLabels,
  getMarketLocaleLabels,
  getMarketOptionLabels,
  getMarketSectionLabels,
} from '@/features/team/market-labels'

function ConsequenceRow({ label, value }: { label: string; value: string }) {
  return (
    <Box display="flex" className="items-baseline gap-2">
      <Text size="xs" weight="medium" color="text-[var(--bellum-text-secondary)]" className="w-20 shrink-0">
        {label}
      </Text>
      <Text size="xs" color="text-[var(--bellum-text-primary)]">
        {value}
      </Text>
    </Box>
  )
}

/**
 * Workspace-level "Marché cible" selector on the Équipe settings screen. Reads
 * and (for owners/admins) writes the workspace's target market, and surfaces its
 * consequences — default language, legal basis and data sources — so the choice
 * is legible before it drives a run's country pack on the IA side.
 *
 * All copy comes from the centralized `market-labels` module (backed by the
 * `settings.market.*` react-i18next keys).
 */
export const MarketSelector = memo(function MarketSelector({ canManage }: { canManage: boolean }) {
  // Subscribes the component to language changes; labels below resolve via market-labels.
  useTranslation('settings')
  const sectionLabels = getMarketSectionLabels()
  const optionLabels = getMarketOptionLabels()
  const localeLabels = getMarketLocaleLabels()
  const legalBasisLabels = getMarketLegalBasisLabels()
  const { market, isLoading, setMarket } = useWorkspaceMarket()
  const current = market?.market ?? 'FR'

  return (
    <SettingsBlock
      title={sectionLabels.title}
      description={sectionLabels.subtitle}
      testId="market-selector"
      action={
        market?.activeCountryPack ? (
          <Badge variant="info" className="gap-1">
            <Globe aria-hidden className="size-3.5" />
            {sectionLabels.packActive}
          </Badge>
        ) : undefined
      }
    >
      <Select
        value={current}
        disabled={!canManage || isLoading || setMarket.isPending}
        onValueChange={next => setMarket.mutate(next as WorkspaceMarket)}
      >
        <SelectTrigger className="min-h-11 w-full border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] text-sm sm:w-64">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {workspaceMarketValues.map(code => (
            <SelectItem key={code} value={code}>
              {optionLabels[code].name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {market && (
        <Box className="space-y-1 rounded-lg bg-[var(--bellum-surface-2)] p-3">
          <ConsequenceRow label={sectionLabels.localeLabel} value={localeLabels[market.defaultLocale]} />
          <ConsequenceRow label={sectionLabels.legalLabel} value={legalBasisLabels[market.legalBasis]} />
          <ConsequenceRow label={sectionLabels.sourcesLabel} value={optionLabels[market.market].sources} />
        </Box>
      )}

      {!canManage && (
        <Text size="xs" color="text-[var(--bellum-text-secondary)]">
          {sectionLabels.readOnly}
        </Text>
      )}
    </SettingsBlock>
  )
})
