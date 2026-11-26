import { useTranslation } from 'react-i18next'
import type { GlobalContact } from '@/features/contacts/hooks/useContacts'
import { CreateTargetListFromSelectionDialog } from '@/features/target-lists/view/CreateTargetListFromSelectionDialog'

/**
 * #2157.5 / #2157.57 — « Créer une cible depuis Contacts ». Le MÊME aperçu que
 * depuis Comptes (GA-26 : un réglage à un seul endroit) : ce dialogue ne
 * réinvente pas le formulaire, il lui donne la sélection de contacts — les
 * désinscrits sont ÉCARTÉS et nommés, les fiches sans e-mail nommées aussi.
 */
export function CreateTargetListDialog({
  open,
  onOpenChange,
  contacts,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  contacts: readonly GlobalContact[]
}) {
  const { t } = useTranslation('contacts')
  const kept = contacts.filter(contact => !contact.excluded_at)
  const excluded = contacts
    .filter(contact => Boolean(contact.excluded_at))
    .map(contact => ({ label: contact.full_name, reason: t('selection.targetList.excludedReason') }))
  return (
    <CreateTargetListFromSelectionDialog
      open={open}
      onOpenChange={onOpenChange}
      items={kept.map(contact => ({
        kind: 'contact' as const,
        id: contact.id,
        label: contact.full_name,
        email: contact.email ?? null,
      }))}
      excluded={excluded}
      onDone={() => onOpenChange(false)}
    />
  )
}
