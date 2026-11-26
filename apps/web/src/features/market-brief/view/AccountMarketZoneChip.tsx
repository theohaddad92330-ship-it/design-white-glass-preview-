import { Link } from '@tanstack/react-router'
import { Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { useAccountMarketZones } from '../hooks/useMarketZones'

/**
 * Puce « Marché local : Lille → » sur la fiche d'un compte lié à une zone
 * (D7, 04/10/2026). Un compte sans zone n'a AUCUNE ligne : une absence ne
 * s'écrit pas. Cible tactile ≥ 44 px (GA-35).
 */
export function AccountMarketZoneChip({ accountId }: { accountId: string }) {
  const { t } = useTranslation('marketBrief')
  const { zones } = useAccountMarketZones(accountId)
  if (zones.length === 0) return null
  return (
    <div data-testid="account-market-zone-chip" className="flex flex-wrap gap-2">
      {zones.map(zone => (
        <Link
          key={zone.id}
          to="/accounts/marches/$zoneId"
          params={{ zoneId: zone.id }}
          className="inline-flex min-h-11 items-center rounded-full border border-[var(--bellum-border)] px-3 text-[var(--bellum-text-accent)] hover:underline"
        >
          <Text size="sm">{t('chip.label', { zone: zone.label })}</Text>
        </Link>
      ))}
    </div>
  )
}
