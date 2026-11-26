import { Link } from '@tanstack/react-router'
import { Text, cn } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { personInitials } from '@/features/chat/view/reply-blocks/person-initials'
import type { AccountRow } from './types'

/**
 * Refonte Théo (comptes-liste) — « PERSONNES » : deux visages (initiales, jamais une photo — c58), le nombre de
 * contacts et, quand l'un d'eux porte un rôle décisionnel, le badge « Décideur » teinté.
 *
 * Une absence ne fait pas de ligne : un compte sans contact (ou dont la lecture a échoué) rend un tiret
 * nommé, jamais « 0 personne ». Le clic ouvre le dossier du compte sans déclencher le clic de ligne.
 */
export function AccountPeopleCell({
  accountId,
  people,
  className,
  variant = 'table',
}: {
  accountId: string
  people: AccountRow['people']
  className?: string
  /** `card` (« Reprendre le fil », V22) écrit le nombre en mots — « 8 contacts » ; `table` le chiffre seul. */
  variant?: 'table' | 'card'
}) {
  const { t } = useTranslation('accounts')
  // #4497 (V22, GA-18/19) — une absence ne fait AUCUNE ligne : ni « - », ni « 0 personne ».
  if (!people || people.count === 0) return null
  return (
    <Link
      to="/accounts/$id"
      params={{ id: accountId }}
      onClick={event => event.stopPropagation()}
      aria-label={t('people.open', { count: people.count })}
      className={cn('inline-flex min-h-11 flex-wrap items-center gap-1.5 md:min-h-0', className)}
      data-testid="account-people"
    >
      <span className="flex -space-x-1">
        {people.top.map(person => (
          <span
            key={person.name}
            className="flex size-6 items-center justify-center rounded-full border border-[var(--bellum-surface-1)] bg-[var(--bellum-surface-2)] text-xs font-medium text-[var(--bellum-text-secondary)]"
            aria-hidden
          >
            {personInitials(person.name)}
          </span>
        ))}
      </span>
      <Text element="span" size="xs" className="tabular-nums text-[var(--bellum-text-secondary)]">
        {variant === 'card' ? t('people.count', { count: people.count }) : people.count}
      </Text>
      {people.has_decider ? (
        <span
          data-testid="decider-badge"
          className="inline-flex items-center rounded-full bg-[color-mix(in_srgb,var(--bellum-text-accent)_14%,transparent)] px-2 py-0.5 text-xs font-medium text-[var(--bellum-text-accent)]"
        >
          {t('people.decider')}
        </span>
      ) : null}
    </Link>
  )
}
