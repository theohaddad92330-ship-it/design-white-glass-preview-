import type { Contact } from '@bellum/contracts'
import { Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'

/** Une relation est ENGAGÉE dès qu'un échange a eu lieu : contacté, répondu, rendez-vous. */
const ENGAGED_STATUSES: readonly string[] = ['contacted', 'replied', 'meeting']

/**
 * Théo A comptes-fiche.R5 — les trois repères des interlocuteurs : contacts retenus ·
 * avec e-mail · relations engagées. Un écarté ou masqué ne compte pas (le même
 * périmètre que la liste). Un compte absent ne s'écrit pas « 0 » (GA-18/19).
 */
export function countContactFigures(contacts: readonly Contact[]) {
  const kept = contacts.filter(contact => !contact.excluded_at && !contact.hidden)
  return {
    contacts: kept.length,
    withEmail: kept.filter(contact => (contact.email ?? '').trim() !== '').length,
    engaged: kept.filter(contact => ENGAGED_STATUSES.includes(contact.user_status)).length,
  }
}

export function ContactsCountersLine({ contacts }: { contacts: readonly Contact[] }) {
  const { t } = useTranslation('accountOrg', { keyPrefix: 'contactsFigures' })
  const figures = countContactFigures(contacts)
  if (figures.contacts === 0) return null
  return (
    <div data-testid="contacts-figures" className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
      <Text size="sm" weight="semibold">
        {t('contacts', { count: figures.contacts })}
      </Text>
      {figures.withEmail > 0 ? <Text size="sm">{t('withEmail', { count: figures.withEmail })}</Text> : null}
      {figures.engaged > 0 ? <Text size="sm">{t('engaged', { count: figures.engaged })}</Text> : null}
    </div>
  )
}
