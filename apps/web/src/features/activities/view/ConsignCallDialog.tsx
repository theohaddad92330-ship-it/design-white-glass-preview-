import type { Contact } from '@bellum/contracts'
import { useTranslation } from 'react-i18next'
import { useLogActivity } from '../hooks/useTimeline'
import { LogActivityDialog } from './LogActivityDialog'

/**
 * #3697.2 / #3697.6 — « Consigner un appel » : UN seul formulaire, ouvert depuis la carte
 * Appel de la fiche ET depuis le support d'appel (« Consigner le résultat »). Un appel PASSÉ
 * devient une activité ; il ne crée aucune tâche future et n'envoie rien.
 *
 * Le contact et le compte sont posés ; AUCUN autre champ n'est prérempli. En particulier, les
 * objections que le support anticipait ne deviennent jamais des déclarations : une objection
 * possible n'est pas une objection exprimée (doctrine, #3697 « Données et protections »).
 */
export function ConsignCallDialog({
  contact,
  open,
  onOpenChange,
}: {
  contact: Pick<Contact, 'id' | 'account_id'>
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation('activities')
  const log = useLogActivity('contact', contact.id)
  if (!open) return null

  return (
    <LogActivityDialog
      open
      heading={t('log.callTitle')}
      onOpenChange={onOpenChange}
      isPending={log.isPending}
      onSubmit={input =>
        log.mutate(
          { ...input, accountId: contact.account_id ?? undefined, contactId: contact.id },
          { onSuccess: () => onOpenChange(false) },
        )
      }
    />
  )
}
