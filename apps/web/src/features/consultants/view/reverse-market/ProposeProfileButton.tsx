import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Send } from 'lucide-react'
import type { Contact } from '@bellum/contracts'
import {
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Text,
} from '@bellum/ui'
import { outreachApi, outreachKeys } from '@/features/outreach/api'

/**
 * #5029 — « PROPOSER CE PROFIL » : un consultant en intercontrat, proposé à UN
 * compte du Reverse Market, par UNE séquence (playbook F) sur UN interlocuteur.
 *
 * Revient sur le NO-GO « Préparer un push profil » (#2968), levé par Louis le
 * 31/10/2026 : SEULEMENT sur geste explicite par compte, profil anonymisé (le
 * serveur le compose, jamais l'écran), chaque e-mail relu et validé à la main.
 *
 * #5029.3 — un bouton radio, jamais une case à cocher : un lancement = un
 * compte = un contact. Aucun « tous les comptes », aucune audience.
 *
 * « Déjà proposé à ce compte » : une séquence existe pour CE consultant et CE
 * compte (`consultant_id`, lu par `GET /outreach/sequences?consultant_id=`) —
 * le rappel n'interdit rien, il évite de repousser le même profil sans le voir.
 */
export function ProposeProfileButton({
  consultantId,
  accountId,
  accountName,
  accountContext,
  contacts,
}: {
  consultantId: string
  accountId: string
  accountName: string
  /** Ce que le Reverse Market dit du compte (le besoin rapproché) — il nourrit le brouillon. */
  accountContext: string | null
  contacts: readonly Contact[]
}) {
  const { t } = useTranslation('consultants')
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [contactId, setContactId] = useState<string | null>(null)

  const proposed = useQuery({
    queryKey: outreachKeys.byConsultant(consultantId),
    queryFn: () => outreachApi.listForConsultant(consultantId),
  })
  const alreadyProposed = (proposed.data ?? []).some(sequence => sequence.account_id === accountId)

  const push = useMutation({
    mutationFn: (chosen: string) =>
      outreachApi.benchPush({
        consultant_id: consultantId,
        contact_id: chosen,
        ...(accountContext?.trim() ? { account_context: accountContext.trim().slice(0, 300) } : {}),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: outreachKeys.byConsultant(consultantId) })
    },
  })

  const close = (next: boolean) => {
    setOpen(next)
    if (!next) {
      setContactId(null)
      push.reset()
    }
  }

  const k = 'reverseMarket.internal.interlocutors.propose'
  return (
    <>
      <Button size="sm" variant="outline" icon={Send} onClick={() => setOpen(true)}>
        {t(`${k}.action`)}
      </Button>
      {alreadyProposed ? (
        <Text size="xs" className="self-center text-[var(--bellum-text-secondary)]">
          {t(`${k}.already`)}
        </Text>
      ) : null}

      <Dialog open={open} onOpenChange={close}>
        <DialogContent closeLabel={t(`${k}.close`)} className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t(`${k}.title`, { account: accountName })}</DialogTitle>
            <DialogDescription>{t(`${k}.description`)}</DialogDescription>
          </DialogHeader>

          {push.isSuccess ? (
            <Box className="flex flex-col gap-2 px-1">
              <Text size="sm">{t(`${k}.done`)}</Text>
              <Button asChild size="sm" variant="outline">
                <Link to="/actions/sequences">{t(`${k}.openSequences`)}</Link>
              </Button>
            </Box>
          ) : contacts.length === 0 ? (
            <Text size="sm" className="px-1 text-[var(--bellum-text-secondary)]">
              {t(`${k}.noContacts`)}
            </Text>
          ) : (
            <fieldset className="flex flex-col gap-1 px-1">
              <legend className="mb-1 text-xs text-[var(--bellum-text-secondary)]">{t(`${k}.contactsLegend`)}</legend>
              {contacts.map(contact => {
                // GA-120 vise un nom de TALENT ; `contact` est un interlocuteur CRM (même patron
                // qu'`InterlocutorRow`) — une variable locale, jamais la forme brute qu'elle scanne.
                const contactName = contact.full_name
                const contactLabel = contact.title ? `${contactName} · ${contact.title}` : contactName
                return (
                  <label key={contact.id} className="flex min-h-11 items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name={`propose-profile-${accountId}`}
                      value={contact.id}
                      checked={contactId === contact.id}
                      onChange={() => setContactId(contact.id)}
                    />
                    <span>{contactLabel}</span>
                  </label>
                )
              })}
            </fieldset>
          )}

          {push.isError ? (
            <p role="alert" className="px-1 text-sm text-[var(--bellum-text-secondary)]">
              {t(`${k}.error`, { message: push.error instanceof Error ? push.error.message : '' })}
            </p>
          ) : null}

          {push.isSuccess ? null : (
            <DialogFooter>
              <Button variant="outline" onClick={() => close(false)}>
                {t(`${k}.cancel`)}
              </Button>
              <Button
                variant="black"
                disabled={!contactId || push.isPending}
                isLoading={push.isPending}
                onClick={() => contactId && push.mutate(contactId)}
              >
                {t(`${k}.confirm`)}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
