import { Box, Text, cn } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { ContactAvatar } from '@/components/ui/ContactAvatar'
import { deadlineTiles, type DeadlineMission } from '../planning-deadlines'
import type { PlanningQuickChip } from '../planning-views'

type Person = { name: string; photoUrl?: string | null }

/** Au plus six visages : une pile de 40 avatars n'est plus une information. */
const FACEPILE_MAX = 6

/**
 * Théo missions-planning.R2 — LA TUILE DE TÊTE ET LES TROIS TUILES D'ÉCHÉANCE.
 *
 * Aucun montant : un écran de staffing répond « qui, jusqu'à quand », pas
 * « combien ». Chaque tuile d'échéance est un VRAI bouton : elle ouvre la même
 * pastille que celle de la barre de filtres (un seul état, deux portes). Une
 * fin non renseignée s'écrit « Aucune », jamais « 0 » (GA-18).
 */
export function PlanningSummary({
  missions,
  today,
  people,
  activeChips,
  onToggleChip,
}: {
  missions: readonly DeadlineMission[]
  today: string
  people: readonly Person[]
  activeChips: readonly PlanningQuickChip[]
  onToggleChip: (chip: PlanningQuickChip) => void
}) {
  const { t } = useTranslation('missions')
  const tiles = deadlineTiles(missions, today)
  const stats: readonly { chip: PlanningQuickChip; label: string; value: string; hint: string }[] = [
    {
      chip: 'ending',
      label: t('planning.deadlines.endingSoon'),
      value: String(tiles.endingSoon),
      hint: t('planning.deadlines.endingSoonHint'),
    },
    {
      chip: 'starting',
      label: t('planning.deadlines.starting'),
      value: String(tiles.starting),
      hint: t('planning.deadlines.startingHint'),
    },
    {
      chip: 'noEnd',
      label: t('planning.deadlines.endUnset'),
      value: tiles.endUnset > 0 ? String(tiles.endUnset) : t('planning.deadlines.none'),
      hint: t('planning.deadlines.endUnsetHint'),
    },
  ]
  const shown = people.slice(0, FACEPILE_MAX)

  return (
    <Box
      data-slot="planning-summary"
      className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,2fr)]"
      role="group"
      aria-label={t('planning.deadlines.tilesLabel')}
    >
      {/* Théo .m5-feature — la tuile de tête : un grand nombre, un dégradé d'accent, la pile de visages. */}
      <Box
        data-slot="planning-feature"
        className="flex min-h-28 items-center gap-5 rounded-2xl border border-[var(--bellum-accent-line)] bg-gradient-to-br from-[var(--bellum-accent-bg)] to-card p-5 md:px-7"
      >
        <Text
          element="span"
          className="text-6xl font-semibold leading-none tracking-tighter tabular-nums text-[var(--bellum-text-primary)]"
        >
          {String(tiles.toAccompany).padStart(2, '0')}
        </Text>
        <Box className="min-w-0 space-y-2">
          <Text element="h3" size="lg" weight="semibold">
            {t('planning.deadlines.toAccompany')}
          </Text>
          <Text size="xs" color="text-[var(--bellum-text-secondary)]" className="max-w-64">
            {t('planning.screen.featureText')}
          </Text>
          {shown.length > 0 ? (
            <ul className="flex -space-x-1.5 pt-1" aria-label={t('planning.screen.facepile')}>
              {shown.map(person => (
                <li key={person.name} title={person.name} className="rounded-full ring-2 ring-card">
                  <ContactAvatar name={person.name} photoUrl={person.photoUrl} size="sm" />
                </li>
              ))}
            </ul>
          ) : null}
        </Box>
      </Box>

      {/* Théo .m5-stats — UNE carte, trois colonnes séparées d'un filet ; chaque colonne est un bouton. */}
      <ul
        data-slot="planning-stats"
        className="grid grid-cols-1 sm:grid-cols-3 rounded-2xl border border-border bg-card py-4 md:py-5"
      >
        {stats.map((stat, index) => {
          const pressed = activeChips.includes(stat.chip)
          return (
            <li key={stat.chip} className={cn('min-w-0', index > 0 && 'border-l border-border')}>
              <button
                type="button"
                aria-pressed={pressed}
                onClick={() => onToggleChip(stat.chip)}
                className={cn(
                  'group pointer-coarse:min-h-11 flex h-full w-full flex-col items-start gap-1 rounded-control px-3 py-1 text-left transition-colors duration-immediate ease-bellum-out hover:bg-[var(--bg-surface-hover)] md:px-5',
                  pressed && 'bg-[var(--bellum-accent-bg)]',
                )}
              >
                <Text element="span" size="xs" color="text-[var(--bellum-text-secondary)]">
                  {stat.label}
                </Text>
                <Text
                  element="span"
                  className="text-2xl font-medium tracking-tight tabular-nums group-hover:text-[var(--bellum-text-accent)] md:text-4xl"
                >
                  {stat.value}
                </Text>
                <Text element="span" size="xs" color="text-[var(--bellum-text-muted)]">
                  {stat.hint}
                </Text>
              </button>
            </li>
          )
        })}
      </ul>
    </Box>
  )
}
