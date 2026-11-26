import { Badge } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import type { LineNature } from '@/features/accounts/model/lineNature'

/**
 * #3676.6 — la nature d'une ligne de « Signaux et besoins », en français simple
 * (demande confirmée · piste à explorer · signal récent · historique).
 * `null` : la ligne ne s'affirme d'aucune nature (un non daté n'est ni récent
 * ni historique) — le badge se tait.
 */
export function LineNatureBadge({ nature }: { nature: LineNature | null }) {
  const { t } = useTranslation('projects')
  if (!nature) return null
  return (
    <Badge variant="outline" data-testid="line-nature" data-nature={nature}>
      {t(`accountOpportunity.nature.${nature}`)}
    </Badge>
  )
}
