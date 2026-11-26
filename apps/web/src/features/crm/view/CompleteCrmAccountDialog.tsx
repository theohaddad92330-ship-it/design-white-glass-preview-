import { contactsToComplete, type Contact, type CrmPushRequest, type CrmPushResult } from '@bellum/contracts'
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Text } from '@bellum/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { readImpersonationState } from '@/features/impersonation/impersonation-state'
import { crmPushApi } from '../api'
import { useAccountCrmProvenance } from '../hooks/useAccountCrmProvenance'
import { PushItems } from './CrmPushDialog'

type CompleteContact = Pick<Contact, 'id' | 'full_name' | 'title'>

/**
 * #4459.3 — « Compléter le compte » : l'APERÇU de tous les contacts que l'analyse a apportés et que le CRM
 * n'a pas encore (cochés d'office, décochables), puis UN geste qui les pousse par la porte d'écriture
 * existante (`POST /crm/push`, #4188 → `CrmWriteService` : un clic EST la décision, chaque contact garde
 * son propre résultat). Un contact déjà poussé (`contact_crm_exports`) n'est jamais reproposé.
 *
 * Le CRM visé est le principal de l'espace (celui que la porte choisit quand on n'en nomme aucun) : son nom
 * vient de la réponse, jamais d'un fournisseur écrit ici (GA-252).
 *
 * En incarnation, `/crm` est refusé en écriture côté API (politique d'incarnation) : le dialogue le DIT et
 * n'offre pas un bouton voué à l'échec.
 */
export function CompleteCrmAccountDialog({
  open,
  onOpenChange,
  contacts,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  contacts: readonly CompleteContact[]
}) {
  const { t } = useTranslation('crm')
  const queryClient = useQueryClient()
  const provenance = useAccountCrmProvenance()
  const proposed = useMemo(() => {
    const ids = new Set(contactsToComplete(provenance?.contacts ?? []))
    return contacts.filter(contact => ids.has(contact.id))
  }, [provenance, contacts])
  // Les décochés, pas les cochés : un contact apporté arrivé pendant que la fenêtre est ouverte est proposé coché.
  const [unchecked, setUnchecked] = useState<ReadonlySet<string>>(new Set())
  const chosen = proposed.filter(contact => !unchecked.has(contact.id)).map(contact => contact.id)
  const impersonating = open && readImpersonationState() !== null

  const push = useMutation<CrmPushResult, Error, string[]>({
    mutationFn: contactIds => {
      const body: CrmPushRequest = { accountIds: [], contactIds, withAccountContacts: false }
      return crmPushApi.push(body)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['crm', 'push', 'provenance'] })
      void queryClient.invalidateQueries({ queryKey: ['contact-crm-exports'] })
    },
  })
  const { reset: resetPush } = push
  useEffect(() => {
    if (open) return
    resetPush()
    setUnchecked(new Set())
  }, [open, resetPush])

  const toggle = (id: string, on: boolean) => {
    setUnchecked(previous => {
      const next = new Set(previous)
      if (on) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('provenance.complete.close')} className="max-w-lg space-y-4">
        <DialogHeader>
          <DialogTitle>{t('provenance.complete.title')}</DialogTitle>
          <DialogDescription>{t('provenance.complete.description')}</DialogDescription>
        </DialogHeader>

        {push.data ? (
          <PushItems items={push.data.items} label={t('push.listLabel')} />
        ) : provenance && proposed.length === 0 ? (
          <Text size="sm">{t('provenance.complete.nothing')}</Text>
        ) : (
          <fieldset className="max-h-72 space-y-1 overflow-y-auto">
            <legend className="sr-only">{t('provenance.complete.listLabel')}</legend>
            {proposed.map(contact => (
              <label key={contact.id} className="flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4 shrink-0"
                  checked={!unchecked.has(contact.id)}
                  onChange={event => toggle(contact.id, event.target.checked)}
                />
                <span className="min-w-0">
                  <span className="font-medium">{contact.full_name}</span>
                  {contact.title ? <span className="text-[var(--bellum-text-muted)]"> · {contact.title}</span> : null}
                </span>
              </label>
            ))}
          </fieldset>
        )}

        {impersonating && !push.data ? (
          <Text size="sm" role="status">
            {t('provenance.complete.impersonating')}
          </Text>
        ) : null}
        {push.isError ? (
          <Text size="sm" color="text-[var(--danger-soft-text)]" role="alert">
            {push.error.message}
          </Text>
        ) : null}

        <div className="flex justify-end gap-2">
          {push.data ? (
            <Button type="button" className="min-h-11" onClick={() => onOpenChange(false)}>
              {t('push.done')}
            </Button>
          ) : proposed.length > 0 ? (
            <Button
              type="button"
              className="min-h-11"
              disabled={impersonating || push.isPending || chosen.length === 0}
              onClick={() => push.mutate(chosen)}
            >
              {push.isPending
                ? t('provenance.complete.sending')
                : chosen.length === 0
                  ? t('provenance.complete.sendNone')
                  : t('provenance.complete.send', { count: chosen.length })}
            </Button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
