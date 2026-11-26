import { Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { useEnrichmentInFlight } from '@/features/contacts/hooks/useEnrichmentInFlight'

/**
 * #AM.39 (#4063) — « N enrichissements en cours », lu au MÊME index serveur que la ligne de la liste et la fiche :
 * l'opération lancée avant de quitter l'écran se retrouve ici, sans relancer. Aucun job ⇒ aucune ligne.
 */
export function EnrichmentInFlightLine({ className }: { className?: string }) {
  const { t } = useTranslation('contacts')
  const { count } = useEnrichmentInFlight()
  if (count === 0) return null
  return (
    <Text size="sm" role="status" className={className} data-testid="enrichment-in-flight">
      {t('enrich.inFlightCount', { count })}
    </Text>
  )
}
