import type { MarketBrief } from '@bellum/contracts'
import { Badge, Card, Text } from '@bellum/ui'
import { ResponsiveTable } from '@/components/primitives/ResponsiveTable'
import { useTranslation } from 'react-i18next'
import { ShowMoreButton, useRevealed } from '@/features/brief-blocks/ShowMore'
import { safeHref } from '@/lib/safe-href'

// Recette 06/10/2026 : 453 personnes à plat = un mur ; dix d'abord, puis vingt-cinq par clic.
const PEOPLE_INITIAL = 10
const PEOPLE_STEP = 25

const linkClass =
  'inline-flex min-h-11 items-center break-all text-[var(--bellum-text-accent)] underline-offset-2 hover:underline'

/**
 * Personnes de la zone, EN CLAIR : nom, poste, employeur, e-mail, téléphone,
 * LinkedIn — jamais masqués (décision D5, « coordonnées pro toujours en
 * clair »). Une coordonnée absente ne fait aucune ligne.
 */
export function ZonePeople({ people }: { people: MarketBrief['people'] }) {
  const { t } = useTranslation('marketBrief')
  const { visible, nextCount, revealMore } = useRevealed(people.length, PEOPLE_INITIAL, PEOPLE_STEP)
  if (people.length === 0) return null
  return (
    <Card data-testid="market-people" className="min-w-0 rounded-card p-5">
      <Text element="h3" size="base" weight="semibold">
        {t('people.title')}
      </Text>
      <ResponsiveTable
        className="mt-3"
        rows={people.slice(0, visible)}
        rowKey={person => `${person.name}-${person.entity ?? ''}`}
        scrollLabel={t('people.title')}
        columns={[
          {
            key: 'person',
            header: t('people.columns.person'),
            mobile: 'title',
            render: person => (
              <span className="inline-flex flex-wrap items-center gap-1.5">
                <span data-testid="market-person" className="font-semibold">
                  {person.name}
                </span>
                {/* Refonte Théo — le décideur se repère dans la liste : badge teinté, dit par le brief (`role`). */}
                {person.role === 'decision_maker' ? (
                  <Badge variant="primary" data-testid="market-person-decision-maker">
                    {t('people.decisionMaker')}
                  </Badge>
                ) : null}
              </span>
            ),
          },
          {
            key: 'role',
            header: t('people.columns.role'),
            mobile: 'meta',
            render: person => (person.function ? <span>{person.function}</span> : null),
          },
          {
            key: 'employer',
            header: t('people.columns.employer'),
            mobile: 'meta',
            render: person => (person.entity ? <span>{person.entity}</span> : null),
          },
          {
            key: 'contact',
            header: t('people.columns.contact'),
            render: person => {
              const linkedin = safeHref(person.linkedin)
              return (
                <div className="flex flex-wrap gap-x-4">
                  {person.email ? (
                    <a href={`mailto:${person.email}`} className={linkClass}>
                      {person.email}
                    </a>
                  ) : null}
                  {person.phone ? (
                    <a href={`tel:${person.phone}`} className={linkClass}>
                      {person.phone}
                    </a>
                  ) : null}
                  {person.mobile ? (
                    <a href={`tel:${person.mobile}`} className={linkClass}>
                      {person.mobile}
                    </a>
                  ) : null}
                  {linkedin ? (
                    <a href={linkedin} target="_blank" rel="noopener noreferrer" className={linkClass}>
                      {t('people.linkedin')}
                    </a>
                  ) : null}
                </div>
              )
            },
          },
        ]}
      />
      <ShowMoreButton
        t={t}
        nextCount={nextCount}
        visible={visible}
        total={people.length}
        onClick={revealMore}
        testId="market-people-more"
      />
    </Card>
  )
}
