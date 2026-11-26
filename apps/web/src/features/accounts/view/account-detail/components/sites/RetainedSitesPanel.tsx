import { useAccountEntities } from '@/features/adv/api'
import { useAccountSites } from '@/features/accounts/hooks/useAccountSites'
import { RetainedSitesCard } from './RetainedSitesCard'

/**
 * #2284.56 — le branchement écran de la relation `site_of` : lit les sites
 * RETENUS du compte (`GET :id/site-list`) et les entités du compte (`GET
 * :id/entities`, déjà exposée et déjà consommée côté ADV — réutilisée ici
 * plutôt que refaite, GA-26) pour nommer, sur chaque site, l'entité à
 * laquelle il est rattaché.
 */
export function RetainedSitesPanel({ accountId }: { accountId: string }) {
  const sitesQuery = useAccountSites(accountId)
  const entitiesQuery = useAccountEntities(accountId)
  const sites = sitesQuery.data?.items ?? []
  if (sites.length === 0) return null
  const entityNameById = new Map((entitiesQuery.data?.items ?? []).map(entity => [entity.id, entity.name]))
  return <RetainedSitesCard sites={sites} entityNameById={entityNameById} />
}
