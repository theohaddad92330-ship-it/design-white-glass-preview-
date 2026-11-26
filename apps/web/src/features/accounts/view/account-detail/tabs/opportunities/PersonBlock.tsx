import type { AccountSignalLine, Contact, SignalLinePeriod } from '@bellum/contracts'
import { Button, Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { PenLine, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { formatDate } from '@/lib/locale'
import { useOptionalContactEngagement } from '../../components/contact-engagement/ContactEngagementContext'
import { COMPACT_44 } from './SignalLineBody'
import type { ContactReason, ProposableContact } from './signal-contacts'

function initials(name: string | null | undefined): string {
  return (name ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() ?? '')
    .join('')
}

function reasonLabel(
  t: (key: string, options?: Record<string, unknown>) => string,
  reason: ContactReason | null,
  period: SignalLinePeriod,
): string | null {
  if (!reason) return null
  switch (reason.kind) {
    case 'named':
      return t(`signalTable.person.reason.${period === 'past' ? 'then' : 'named'}`)
    case 'carried':
      return t('signalTable.person.reason.carried')
    case 'role':
      return t('signalTable.person.reason.role')
    case 'craft':
      return reason.words.length > 0 ? t('signalTable.person.reason.craft', { words: reason.words.join(', ') }) : null
    case 'place':
      return reason.place ? t('signalTable.person.reason.place', { place: reason.place }) : null
  }
}

/**
 * LE rendu d'une personne à contacter sur une ligne — l'onglet du compte ET Signaux › Historique (lot 768, GA-26).
 * Dans l'Historique global la fiche complète n'est pas chargée : `onPrepare` va la chercher AU CLIC (une requête
 * pour la personne choisie, jamais une par compte) et `emailVerified` dit l'état de l'e-mail sans l'adresse.
 */
export function PersonBlock({
  person,
  reason,
  full,
  line,
  onAddToPlan,
  onPrepare,
  emailVerified,
}: {
  person: ProposableContact
  reason: ContactReason | null
  full: Contact | null
  line: AccountSignalLine
  onAddToPlan: () => void
  onPrepare?: () => void
  emailVerified?: boolean
}) {
  const { t } = useTranslation('projects')
  const engagement = useOptionalContactEngagement()
  const named = (line.contact_ids ?? []).includes(person.id)
  const left = full?.employment_left ?? null
  const contactedOn = formatDate(full?.email_sent_at ?? null, { day: 'numeric', month: 'short', year: 'numeric' })
  const reach = [
    person.email || emailVerified ? t('signalTable.person.email') : null,
    person.phone ? t('signalTable.person.phone') : null,
  ]
    .filter(Boolean)
    .join(' · ')
  const why = reasonLabel(t, reason, line.period)
  return (
    <div data-testid="signal-person" className="flex min-w-0 flex-col gap-1.5">
      <div className="flex min-w-0 items-start gap-2">
        <span
          aria-hidden
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft-bg)] text-xs font-semibold text-[var(--accent-soft-text)]"
        >
          {initials(person.full_name)}
        </span>
        <div className="flex min-w-0 flex-col">
          <p className="min-w-0 break-words text-sm">
            <Link
              to="/contacts/$id"
              params={{ id: person.id }}
              className="font-medium underline-offset-2 hover:underline"
            >
              {person.full_name}
            </Link>
            {person.title ? <span className="text-[var(--bellum-text-secondary)]">{` · ${person.title}`}</span> : null}
          </p>
          {why ? (
            <Text size="xs" color="text-[var(--bellum-text-secondary)]" data-testid="signal-person-reason">
              {why}
            </Text>
          ) : null}
          {line.period === 'past' && named ? (
            <Text size="xs" color="text-[var(--bellum-text-muted)]">
              {left ? t('signalTable.person.left') : t('signalTable.person.stillThere')}
            </Text>
          ) : null}
          {reach ? (
            <Text size="xs" color="text-[var(--bellum-text-muted)]">
              {reach}
            </Text>
          ) : null}
          {contactedOn ? (
            <Text size="xs" color="text-[var(--bellum-text-muted)]">
              {t('signalTable.person.contactedOn', { date: contactedOn })}
            </Text>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {onPrepare || (engagement && full) ? (
          <Button
            type="button"
            size="sm"
            variant="default"
            icon={PenLine}
            className={`${COMPACT_44} text-xs`}
            aria-label={t('opportunityCards.prepareMessageFor', { name: person.full_name })}
            onClick={onPrepare ?? (() => engagement?.openEngagement(full ? [full] : [], 'email'))}
          >
            {t('opportunityCards.prepareMessage')}
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="outline"
          icon={Plus}
          className={`${COMPACT_44} text-xs`}
          aria-label={t('signalTable.toPlanFor', { name: person.full_name })}
          onClick={onAddToPlan}
        >
          {t('signalTable.toPlan')}
        </Button>
      </div>
    </div>
  )
}
