import type { MissionBillingAlert } from '@bellum/contracts'
import { Badge } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

/**
 * #2408 (épopée #2979, décision Louis 15/10/2026) — LE BADGE DE FACTURATION D'UNE LIGNE DE MISSION.
 *
 * Facture bloquée, facture échue ou paiement en retard : un seul badge, qui mène à Facturation. Aucune vue ni
 * tuile de plus. Le serveur ne rend `billingAlert` qu'avec `finance:read` ; sans alerte, rien ne s'affiche
 * (« tout va bien » ne se déduit pas d'un silence).
 */
export function MissionBillingBadge({ alert }: { alert: MissionBillingAlert | null | undefined }) {
  const { t } = useTranslation('missions')
  if (!alert) return null
  return (
    <Link
      to="/missions/facturation"
      className="inline-flex min-h-11 items-center self-start"
      data-testid="mission-billing-badge"
    >
      <Badge variant="warning">{t(`table.billingAlert.${alert}`)}</Badge>
    </Link>
  )
}
