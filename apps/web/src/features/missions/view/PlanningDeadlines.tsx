import { Box, Button, TYPE_SCALE, Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { ArrowRight, Clock, Flag, UserRound } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { formatDate } from '@/lib/locale'
import { deadlineCards, type DeadlineMission } from '../planning-deadlines'

/**
 * Théo missions-planning.N1 — « LES ÉCHÉANCES À PRÉPARER ».
 *
 * Les échéances du planning, pas un deuxième gestionnaire de tâches : une carte
 * nomme l'échéance, dit quoi faire en une phrase et mène à l'action, elle ne
 * porte aucun état de tâche. Les quatre tuiles de tête vivent dans
 * `PlanningSummary`.
 */
/** Théo — un geste de carte est un lien d'accent suivi d'une flèche, jamais un bouton plein. */
const CARD_LINK =
  'pointer-coarse:min-h-11 inline-flex min-h-8 items-center gap-1.5 text-sm font-medium text-[var(--bellum-text-accent)] hover:underline'

export function PlanningDeadlines({
  missions,
  today,
  intercontractCount,
}: {
  missions: readonly DeadlineMission[]
  today: string
  intercontractCount: number
}) {
  const { t } = useTranslation('missions')
  const cards = deadlineCards(missions, today)

  return (
    <section aria-label={t('planning.deadlines.title')} className="space-y-3">
      <Box display="flex" className="flex-wrap items-end justify-between gap-2">
        <Box>
          <Text element="h2" className={TYPE_SCALE.sectionTitle}>
            {t('planning.deadlines.title')}
          </Text>
          <Text size="sm" color="text-[var(--bellum-text-muted)]">
            {t('planning.deadlines.subtitle')}
          </Text>
        </Box>
        <Button asChild size="sm" variant="ghost" className="pointer-coarse:min-h-11">
          <Link to="/actions">
            <ArrowRight aria-hidden className="size-4" />
            {t('planning.screen.seeActions')}
          </Link>
        </Button>
      </Box>
      {cards.length === 0 && intercontractCount === 0 ? (
        <Text size="sm" color="text-[var(--bellum-text-muted)]">
          {t('planning.deadlines.empty')}
        </Text>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {cards.map(card => {
            const Icon = card.kind === 'ending' ? Clock : Flag
            return (
              <li
                key={`${card.missionId}-${card.kind}`}
                data-slot="planning-deadline-card"
                className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-5"
              >
                {/* Théo — le sur-titre en capitales (« Fin dans 7 jours »), l'icône du type à droite. */}
                <Box display="flex" className="items-start justify-between gap-2">
                  <Text
                    element="span"
                    size="xs"
                    weight="medium"
                    color={
                      card.kind === 'ending' ? 'text-[var(--warning-soft-text)]' : 'text-[var(--bellum-text-muted)]'
                    }
                    className="uppercase tracking-wider"
                  >
                    {card.kind === 'ending'
                      ? t('planning.deadlines.endsIn', { count: card.daysUntil })
                      : t('planning.deadlines.startsOn', {
                          date: formatDate(card.date, { day: 'numeric', month: 'short', timeZone: 'UTC' }) ?? card.date,
                        })}
                  </Text>
                  <Icon aria-hidden className="size-4 shrink-0 text-[var(--bellum-text-muted)]" />
                </Box>
                {card.personNames.length > 0 ? (
                  <Text element="h3" size="lg" weight="semibold">
                    {card.personNames.join(', ')}
                  </Text>
                ) : null}
                <Text size="sm" color="text-[var(--bellum-text-secondary)]">
                  {[card.accountName, card.label].filter(Boolean).join(' · ')}
                </Text>
                <Text size="sm" color="text-[var(--bellum-text-secondary)]">
                  {card.kind === 'ending'
                    ? t('planning.deadlines.endingAction')
                    : t('planning.deadlines.startingAction')}
                </Text>
                <Box display="flex" className="mt-auto flex-col items-start gap-1 pt-2">
                  {card.kind === 'ending' ? (
                    <Link to="/actions" className={CARD_LINK}>
                      {t('planning.deadlines.prepareNext')}
                      <ArrowRight aria-hidden className="size-4" />
                    </Link>
                  ) : (
                    <Link to="/missions/$id" params={{ id: card.missionId }} className={CARD_LINK}>
                      {t('planning.deadlines.checkStart')}
                      <ArrowRight aria-hidden className="size-4" />
                    </Link>
                  )}
                </Box>
              </li>
            )
          })}
          {intercontractCount > 0 ? (
            <li
              data-slot="planning-deadline-card"
              className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-5"
            >
              <Box display="flex" className="items-start justify-between gap-2">
                <Text
                  element="span"
                  size="xs"
                  weight="medium"
                  color="text-[var(--bellum-text-muted)]"
                  className="uppercase tracking-wider"
                >
                  {t('planning.deadlines.intercontract', { count: intercontractCount })}
                </Text>
                <UserRound aria-hidden className="size-4 shrink-0 text-[var(--bellum-text-muted)]" />
              </Box>
              <Text size="sm" color="text-[var(--bellum-text-secondary)]">
                {t('planning.deadlines.intercontractHint')}
              </Text>
              <Box display="flex" className="mt-auto flex-col items-start gap-1 pt-2">
                <Link to="/consultants" className={CARD_LINK}>
                  {t('planning.deadlines.findMissions')}
                  <ArrowRight aria-hidden className="size-4" />
                </Link>
                <Link to="/projects/needs" className={CARD_LINK}>
                  {t('planning.rowMenu.createInternalNeed')}
                  <ArrowRight aria-hidden className="size-4" />
                </Link>
              </Box>
            </li>
          ) : null}
        </ul>
      )}
    </section>
  )
}
