import { useTranslation } from 'react-i18next'
import type { Site, SiteFit } from '@bellum/contracts'
import { Card, CardContent, Text } from '@bellum/ui'

/**
 * #2284.56 — la relation `site_of` : quel site RETENU appartient à quelle
 * entité (division/BU/filiale) du compte. `sites.entity_id` porte cette
 * relation depuis le 24/08/2026 ; jusqu'ici, aucun écran ne la lisait — voir
 * `RetainedSitesPanel` pour le branchement (`GET :id/site-list` + `GET
 * :id/entities`).
 *
 * Muette sans aucun site retenu : distinct des sites du REGISTRE
 * (`raw_analysis.branches`, la carte au-dessus dans `TabSites`), un compte
 * qui n'a encore RETENU aucun site ne doit pas afficher une section vide.
 *
 * Un site sans entité connue ne montre AUCUNE ligne de relation — « on
 * n'affiche pas ce qu'on n'a pas » (agent_docs/doctrine.md:15).
 */
export function RetainedSitesCard({
  sites,
  entityNameById,
}: {
  sites: readonly (Site & { fit: SiteFit })[]
  entityNameById: ReadonlyMap<string, string>
}) {
  const { t } = useTranslation('accountSites')
  if (sites.length === 0) return null
  return (
    <Card>
      <CardContent className="space-y-2 p-4">
        <Text element="h3" size="sm" weight="semibold">
          {t('retained.title')}
        </Text>
        <ul className="space-y-1.5">
          {sites.map(site => {
            const entityName = site.entity_id ? entityNameById.get(site.entity_id) : undefined
            return (
              <li key={site.id} className="text-sm text-[var(--bellum-text-secondary)]">
                <span className="font-medium text-[var(--bellum-text-primary)]">{site.label}</span>
                {site.city ? <span className="text-[var(--bellum-text-muted)]"> · {site.city}</span> : null}
                {entityName ? (
                  <span className="ml-2 rounded-md border border-[var(--bellum-border)] px-1.5 py-0.5 text-xs text-[var(--bellum-text-secondary)]">
                    {t('retained.entityOf', { name: entityName })}
                  </span>
                ) : null}
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}
