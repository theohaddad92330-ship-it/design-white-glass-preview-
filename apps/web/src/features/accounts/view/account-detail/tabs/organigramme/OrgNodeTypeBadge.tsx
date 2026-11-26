import type { EntityKind, OrgEntityType } from '@bellum/contracts'
import { Badge } from '@bellum/ui'
import { useTranslation } from 'react-i18next'

/**
 * #2284.5-.9 — le badge de TYPE d'un nœud de l'organigramme. GA-26 : le nœud
 * porte son `type` (structure) et, quand il l'affine, un `kind` de la taxonomie
 * d'entité (`orgNodeRefinedKind`). L'écran n'en affiche qu'UN : le kind s'il
 * existe (« Marque » au lieu de « Filiale »), sinon le libellé du type — jamais
 * les deux côte à côte. Le libellé du kind est celui de la carte « Entité
 * résolue » : une seule forme dans tout le produit.
 */
export function OrgNodeTypeBadge({
  type,
  kind,
  typeKey,
  variant,
  unconfirmed = false,
}: {
  type: OrgEntityType
  kind: EntityKind | null
  /** La clé i18n du libellé de TYPE propre à la vue (`entityType` ou `orgMap.entityTypes`). */
  typeKey: 'entityType' | 'orgMap.entityTypes'
  variant: 'outline' | 'info'
  /** #4327.2 — le lien de cette filiale à son groupe n'est appuyé par aucune source : « Filiale non confirmée ». */
  unconfirmed?: boolean
}) {
  const { t } = useTranslation('accountOrg')
  const label = kind
    ? t(`overview.entityResolution.kind.${kind}`, { ns: 'accountDetail' })
    : t(unconfirmed && type === 'filiale' ? `${typeKey}.filialeUnconfirmed` : `${typeKey}.${type}`, type)
  return <Badge variant={variant}>{label}</Badge>
}
