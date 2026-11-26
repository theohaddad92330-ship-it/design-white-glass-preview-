import { Badge, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { useAccountEntities } from '@/features/adv/api'
import { useAccountTeam } from '../hooks'

/**
 * #4996 L6 — qui COUVRE chaque entité du compte, en pastilles de noms (lecture seule). Une entité que personne ne
 * couvre n'a pas de ligne : ni « non couverte », ni pourcentage (GA-259 : un taux mesure ce qu'on SAIT, pas ce que
 * le marché fait). Une zone en texte libre ne couvre aucune entité.
 */
export function EntityCoverage({ accountId }: { accountId: string }) {
  const { t } = useTranslation('teamGuardrails', { keyPrefix: 'coverage' })
  const team = useAccountTeam(accountId).data
  const entities = useAccountEntities(accountId).data?.items ?? []
  if (!team) return null
  const people = [...(team.responsible ? [team.responsible] : []), ...team.members]
  const rows = entities
    .map(entity => ({
      entity,
      names: people.filter(p => (p.scopes ?? []).some(s => s.entity_id === entity.id)).map(p => p.name),
    }))
    .filter(row => row.names.length > 0)
    .sort((a, b) => a.entity.name.localeCompare(b.entity.name, 'fr'))
  if (rows.length === 0) return null
  return (
    <div className="mt-3 border-t border-[var(--bellum-border)] pt-2">
      <Text element="h4" size="xs" weight="medium" color="text-[var(--bellum-text-muted)]">
        {t('title')}
      </Text>
      <ul className="mt-1 space-y-1">
        {rows.map(({ entity, names }) => (
          <li key={entity.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <Text size="sm">{entity.name}</Text>
            <Badge variant="outline">{t('by', { names: names.join(', ') })}</Badge>
          </li>
        ))}
      </ul>
    </div>
  )
}
