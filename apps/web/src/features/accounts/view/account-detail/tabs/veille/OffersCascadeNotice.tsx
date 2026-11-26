import { Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { offersCascadeView, readOffersCascade } from '@bellum/contracts'
import { Box, Text } from '@bellum/ui'

/**
 * CASCADE-ECRAN — la cascade d'offres du métier (plancher de 5) s'écrit : jusqu'où la recherche s'est élargie,
 * et, quand le plancher n'est pas atteint, combien d'offres DU MÉTIER on a — jamais complétées par du hors métier.
 * Absente (plancher atteint au palier 0) ou illisible : rien, aucune ligne. Le web affiche, il ne recalcule pas.
 */
export function OffersCascadeNotice({ rawAnalysis }: { rawAnalysis: unknown }) {
  const { t } = useTranslation('accountWatch')
  const view = offersCascadeView(readOffersCascade(rawAnalysis))
  if (!view) return null
  return (
    <Box
      role="status"
      data-testid="offers-cascade-notice"
      display="flex"
      rounded="lg"
      className="items-start gap-3 border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] p-3"
    >
      <Search className="mt-0.5 size-4 shrink-0 text-[var(--bellum-text-secondary)]" aria-hidden="true" />
      <div className="space-y-1">
        {view.widenedTo ? (
          <Text size="sm">{t('offersCascade.widened', { tier: t(`offersCascade.tier.${view.widenedTo}`) })}</Text>
        ) : null}
        {view.belowFloor ? (
          <Text size="sm" data-testid="offers-cascade-floor">
            {view.found === null
              ? t('offersCascade.floorNone', { floor: view.floor })
              : t('offersCascade.floor', { count: view.found, floor: view.floor })}
          </Text>
        ) : null}
        {view.carried !== null ? (
          <Text size="sm" data-testid="offers-cascade-carried">
            {t('offersCascade.carried', { count: view.carried })}
          </Text>
        ) : null}
      </div>
    </Box>
  )
}
