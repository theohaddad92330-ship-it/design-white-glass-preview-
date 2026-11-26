import { Badge, Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import type { KnownOrgContact } from './knownOrgContacts'

/**
 * #4679 — la carte d'un contact CONNU (import / CRM) dans l'organigramme : pastille « Connu », nom, titre.
 * Quand un contact déduit semble occuper la même place, la carte le DIT (« doublon probable : <nom> ») et mène à la
 * file de propositions de fusion qui existe déjà (`/contacts/imports`). Aucun geste de fusion ici : on propose.
 * UN composant pour l'arbre et le bloc épinglé (GA-26).
 */
export function OrgKnownContactCard({ contact, onOpen }: { contact: KnownOrgContact; onOpen?: () => void }) {
  const { t } = useTranslation('accountOrg')
  const body = (
    <>
      <Badge variant="outline">{t('hierarchy.knownBadge')}</Badge>
      <Text size="sm" weight="semibold" className="mt-1.5 text-[var(--bellum-text-primary)]">
        {contact.fullName}
      </Text>
      {contact.title ? (
        <Text size="xs" className="text-[var(--bellum-text-secondary)]">
          {contact.title}
        </Text>
      ) : null}
    </>
  )
  return (
    <div
      data-testid="org-known-contact"
      className="min-w-[13rem] max-w-[18rem] rounded-lg border border-[var(--bellum-primary-500)] bg-[var(--bellum-surface-1)] p-3"
    >
      {onOpen ? (
        <button type="button" onClick={onOpen} className="min-h-11 w-full text-left">
          {body}
        </button>
      ) : (
        body
      )}
      {contact.probableDuplicate ? (
        <div className="mt-2 space-y-1" data-testid="org-known-duplicate">
          <Text size="xs" className="text-[var(--warning-soft-text)]">
            {t('hierarchy.knownDuplicate', { name: contact.probableDuplicate.fullName })}
          </Text>
          <Link to="/contacts/imports" className="inline-flex min-h-11 items-center text-xs underline">
            {t('hierarchy.knownDuplicateLink')}
          </Link>
        </div>
      ) : null}
    </div>
  )
}
