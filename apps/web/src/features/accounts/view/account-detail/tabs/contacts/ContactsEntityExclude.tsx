import { Button, Text } from '@bellum/ui'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { contactKeys, contactsApi } from '@/features/contacts/api'

/**
 * #4928.5 — « Écarter les contacts de cette entité » : le commercial nettoie sans attendre un rejeu de collecte.
 *
 * Un geste EXPLICITE et CONFIRMÉ (nommant l'entité et le nombre), jamais lancé par un filtre seul. C'est un archivage :
 * l'API écarte chaque contact avec son motif (`contactsApi.excludeEntity`, réversible par « Réintégrer »), jamais supprimé.
 * Aucun contact dans l'entité : aucun bouton (jamais « écarter 0 »).
 */
export function ContactsEntityExclude({
  accountId,
  entity,
  contactIds,
}: {
  accountId: string
  entity: string
  contactIds: readonly string[]
}) {
  const { t } = useTranslation('accountOrg')
  const queryClient = useQueryClient()
  const [confirming, setConfirming] = useState(false)
  const [pending, setPending] = useState(false)
  if (contactIds.length === 0) return null

  const undo = async () => {
    const outcome = await Promise.allSettled([contactsApi.restoreEntity(accountId, entity)])
    void queryClient.invalidateQueries({ queryKey: contactKeys.all })
    if (outcome[0].status === 'rejected') toast.error(t('entityExclude.undoFailed', { entity }))
    else toast.success(t('entityExclude.undone', { count: outcome[0].value.restored, entity }))
  }

  const run = async () => {
    setPending(true)
    const reason = t('entityExclude.reason', { entity })
    // UN geste serveur (`POST /contacts/account/:id/exclude-entity`) : l'espace et le périmètre se vérifient côté API.
    const outcome = await Promise.allSettled([contactsApi.excludeEntity(accountId, entity, reason)])
    void queryClient.invalidateQueries({ queryKey: contactKeys.all })
    if (outcome[0].status === 'rejected') toast.error(t('entityExclude.failed', { count: contactIds.length }))
    else
      toast.success(t('entityExclude.done', { count: outcome[0].value.excluded, entity }), {
        // #4928.5 — le geste inverse reste visible : un clic réintègre les contacts écartés avec cette entité.
        action: { label: t('entityExclude.undo'), onClick: () => void undo() },
      })
    setPending(false)
    setConfirming(false)
  }

  if (!confirming) {
    return (
      <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={() => setConfirming(true)}>
        {t('entityExclude.action')}
      </Button>
    )
  }
  return (
    <div role="group" className="flex flex-wrap items-center gap-2">
      <Text size="sm">{t('entityExclude.confirm', { count: contactIds.length, entity })}</Text>
      <Button type="button" size="sm" className="min-h-11" disabled={pending} onClick={() => void run()}>
        {t('entityExclude.confirmButton')}
      </Button>
      <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={() => setConfirming(false)}>
        {t('entityExclude.cancel')}
      </Button>
    </div>
  )
}
