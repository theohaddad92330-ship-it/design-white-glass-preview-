import type { AgendaEvent, AgendaPreferences, ProtectedTime } from '@bellum/contracts'
import { Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { agendaCompactSummary } from '../agenda-compact'

/**
 * L'AGENDA DU JOUR, EN UNE LIGNE (#2101.1, #2101.2).
 *
 * « Version jour compacte, pas 2/3 de la page » : la ligne tient sous le titre
 * du bloc, au-dessus du plateau, et ne prend pas sa place. Elle dit les quatre
 * choses que l'écran ne savait pas dire — client, interne, proposé, créneaux
 * libres — et rien de ce qu'il dit déjà ailleurs (le prochain rendez-vous, le
 * temps en réunion, les conflits ont chacun leur endroit).
 *
 * ⚠️ UN SEGMENT À ZÉRO NE FAIT AUCUNE LIGNE. « 0 interne » n'est pas une
 * information : c'est un mot de plus à lire pour apprendre qu'il n'y a rien à
 * lire. Dans une liste, une absence ne fait aucune ligne (GA-18 / GA-19).
 * Quand il n'y a RIEN à compter, le composant ne rend rien du tout — le
 * plateau juste en dessous montre déjà la journée.
 */
export function AgendaCompact({
  events,
  now,
  protectedTime = null,
  agendaPreferences = null,
  labelled = false,
}: {
  events: AgendaEvent[]
  now: Date
  /** #2101.13 — absent = comportement inchangé, personne ne l'a réglé. */
  protectedTime?: ProtectedTime | null
  /** #2101.17 — absent (ou champ par champ) = défauts globaux inchangés. */
  agendaPreferences?: Partial<AgendaPreferences> | null
  /**
   * F2-FIX — « 1 interne » seul sous la rangée de chiffres du Tableau de bord ne disait pas ce
   * qu'il comptait. Sur `/briefing` le titre du bloc (« Ton agenda ») porte déjà ce contexte ;
   * ailleurs, la ligne se nomme elle-même.
   */
  labelled?: boolean
}) {
  const { t } = useTranslation('briefing')
  const summary = agendaCompactSummary(events, now, protectedTime, agendaPreferences)

  const segments = (
    [
      ['client', summary.client],
      ['internal', summary.internal],
      ['proposed', summary.proposed],
      ['freeSlots', summary.freeSlots],
      ['capacity', summary.capacity],
    ] as const
  )
    .filter(([, count]) => count > 0)
    .map(([key, count]) => t(`agenda.compact.${key}`, { count }))

  if (!segments.length) return null

  return (
    <Text size="xs" className="text-[var(--bellum-text-secondary)]" data-testid="briefing-agenda-compact">
      {labelled ? `${t('agenda.compact.lead')} ` : ''}
      {segments.join(' · ')}
    </Text>
  )
}
