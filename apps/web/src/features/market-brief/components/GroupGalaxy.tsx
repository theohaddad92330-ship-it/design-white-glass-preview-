import type { MarketBrief } from '@bellum/contracts'
import { Card, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'

/**
 * Galaxies de groupes (une enseigne et ses filiales) : seuls les chiffres portés
 * par le brief s'écrivent — un membre sans chiffre n'a pas de « 0 » (GA-18/19).
 */
export function GroupGalaxy({ groups }: { groups: NonNullable<MarketBrief['groups']> }) {
  const { t } = useTranslation('marketBrief')
  if (groups.length === 0) return null
  return (
    <section data-testid="market-groups" className="flex min-w-0 flex-col gap-3">
      <Text element="h3" size="base" weight="semibold">
        {t('groups.title')}
      </Text>
      {groups.map(group => (
        <Card key={group.name} className="min-w-0 p-4">
          <Text size="sm" weight="semibold">
            {group.name}
          </Text>
          {group.note ? (
            <Text size="sm" className="mt-1 text-[var(--bellum-text-secondary)]">
              {group.note}
            </Text>
          ) : null}
          <ul className="mt-3 flex flex-col gap-2">
            {group.members.map(member => (
              <li key={member.name} className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <Text size="sm" className="min-w-0">
                  {member.name}
                </Text>
                <Text size="xs" className="text-[var(--bellum-text-muted)]">
                  {[
                    member.profiles !== undefined ? t('groups.profiles', { count: member.profiles }) : null,
                    member.externals !== undefined ? t('groups.externals', { count: member.externals }) : null,
                    member.needs !== undefined ? t('groups.needs', { count: member.needs }) : null,
                  ]
                    .filter((part): part is string => part !== null)
                    .join(' · ')}
                </Text>
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </section>
  )
}
