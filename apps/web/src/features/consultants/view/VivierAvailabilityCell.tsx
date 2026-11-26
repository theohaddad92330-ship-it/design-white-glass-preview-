import { Badge, Text, cn } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { vivierAvailability, type TalentRow, type VivierAvailabilityStatus } from '@bellum/contracts'
import { formatDate } from '@/lib/locale'

const MUTED = 'text-[var(--bellum-text-muted)]'

const DECLARED_VARIANT: Record<string, 'success' | 'info' | 'warning'> = {
  immediate: 'success',
  sous_1_mois: 'info',
  sous_3_mois: 'info',
  indisponible: 'warning',
  en_mission: 'warning',
}

const VARIANT: Record<VivierAvailabilityStatus, 'success' | 'info' | 'warning' | 'outline'> = {
  declared: 'success',
  available: 'success',
  upcoming: 'info',
  in_mission: 'warning',
  to_reconfirm: 'warning',
  unknown: 'outline',
}

/** `YYYY-MM-DD` → « 3 nov. 2026 » dans la langue de l'interface ; illisible ⇒ `null`, jamais l'ISO brut. */
function dayLabel(value: string | null): string | null {
  return formatDate(value ? `${value}T12:00:00` : null, { day: 'numeric', month: 'short', year: 'numeric' })
}

/**
 * Théo C talents-vivier.R4 / N1 / N2 — LA COLONNE « DISPONIBILITÉ & PLANNING ».
 *
 * Deux informations DISTINCTES par ligne (la phrase permanente de l'écran le dit) : la disponibilité
 * DÉCLARÉE, datée, et le planning de missions. La déclaration gagne quand elle existe — elle passe en
 * badge, le planning descend en ligne secondaire. Une confirmation périmée bascule en « À reconfirmer »
 * avec l'âge de la confirmation ; rien de déclaré = « Non renseignée », jamais une date supposée.
 */
export function VivierAvailabilityCell({ row, className }: { row: TalentRow; className?: string }) {
  const { t } = useTranslation('consultants')
  const view = vivierAvailability(row, new Date())
  const date = dayLabel(view.date)
  const declaredOn = dayLabel(view.declaredOn)
  const confirmedOn = dayLabel(view.confirmedOn)
  const planningEnd = dayLabel(view.planning?.endsOn ?? null)
  const client = view.planning?.client ?? null

  // #4500 — une déclaration NON datée se lit telle quelle (« Sous 1 mois », « Indisponible ») : elle gagne.
  const undatedDeclaration = view.status === 'declared' && !date
  const badge = undatedDeclaration
    ? t(`availability.${row.declaredAvailability}`)
    : view.status === 'declared' && date
      ? t('vivier.availability.declaredOn', { date })
      : t(`vivier.availability.${view.status}`)
  const variant = undatedDeclaration ? (DECLARED_VARIANT[row.declaredAvailability] ?? 'outline') : VARIANT[view.status]

  // La ligne sous le badge : l'âge ou la source de ce que le badge annonce.
  let line: string | null = null
  if (view.status === 'declared') {
    line = declaredOn
      ? view.planning
        ? t('vivier.availability.declaredWins', { date: declaredOn })
        : t('vivier.availability.declaredAt', { date: declaredOn })
      : t('vivier.availability.declaredUndated')
  } else if (view.status === 'upcoming') {
    line = [date, client].filter(Boolean).join(' · ')
  } else if (view.status === 'in_mission') {
    line = [
      planningEnd ? t('vivier.availability.endsOn', { date: planningEnd }) : t('vivier.availability.noEnd'),
      client,
    ]
      .filter(Boolean)
      .join(' · ')
  } else if (view.status === 'available') {
    line = confirmedOn ? t('vivier.availability.confirmedOn', { date: confirmedOn }) : null
  } else if (view.status === 'to_reconfirm') {
    line = [
      date ? t('vivier.availability.announced', { date }) : t('vivier.availability.noAnnouncedDate'),
      confirmedOn
        ? t('vivier.availability.lastConfirmation', { date: confirmedOn })
        : t('vivier.availability.noConfirmation'),
    ].join(' · ')
  } else {
    line = t('vivier.availability.unknownLine')
  }

  // Le planning, en ligne secondaire, seulement quand la déclaration l'a fait descendre.
  const planningLine =
    view.status === 'declared' && view.planning
      ? [
          planningEnd
            ? t('vivier.availability.planningEnds', { date: planningEnd })
            : t('vivier.availability.planningOpen'),
          client,
        ]
          .filter(Boolean)
          .join(' · ')
      : null

  return (
    <div className={cn('flex min-w-0 flex-col gap-0.5', className)} data-testid="vivier-availability">
      <Badge variant={variant} className="max-w-full self-start whitespace-normal break-words">
        {badge}
      </Badge>
      {line ? (
        <Text size="xs" element="span" className={cn('break-words', MUTED)}>
          {line}
        </Text>
      ) : null}
      {planningLine ? (
        <Text size="xs" element="span" className={cn('break-words', MUTED)}>
          {planningLine}
        </Text>
      ) : null}
    </div>
  )
}
