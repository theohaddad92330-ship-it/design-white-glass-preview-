import { useState } from 'react'
import {
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Text,
  Textarea,
} from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { useAddDoNotContact, useContactGuardrails } from '../hooks'
import { DoNotContactBadge } from './DoNotContactBadge'

/**
 * #4158.22 — proposer d'ajouter CE contact à la liste « ne pas contacter » de
 * l'espace. Tout membre propose ; le motif est obligatoire (le serveur le refuse
 * sinon) ; retirer se fait dans Réglages › Ne pas contacter, sous `team:manage`.
 *
 * ⚠️ Distinct du refus de la PERSONNE (`ContactStopCard`) et de l'effacement
 * RGPD : ici c'est NOTRE décision d'espace, elle ne retire aucun moyen d'envoi.
 */
export function ContactDoNotContactAction({ contactId }: { contactId: string }) {
  const { t } = useTranslation('teamGuardrails')
  const { data } = useContactGuardrails([contactId])
  const add = useAddDoNotContact()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const listed = Boolean(data?.items.find(item => item.contact_id === contactId)?.do_not_contact)

  return (
    <Box display="flex" className="flex-wrap items-center gap-2">
      <DoNotContactBadge contactId={contactId} />
      {listed ? null : (
        <Button
          size="sm"
          variant="outline"
          className="min-h-11"
          title={t('dnc.contactActionTitle')}
          onClick={() => setOpen(true)}
        >
          {t('dnc.contactAction')}
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent closeLabel={t('common:actions.close')}>
          <DialogHeader>
            <DialogTitle>{t('dnc.contactAction')}</DialogTitle>
            <DialogDescription>{t('dnc.contactActionTitle')}</DialogDescription>
          </DialogHeader>
          <Label htmlFor={`dnc-reason-${contactId}`}>{t('dnc.contactReasonLabel')}</Label>
          <Textarea
            id={`dnc-reason-${contactId}`}
            value={reason}
            onChange={event => setReason(event.target.value)}
            placeholder={t('dnc.contactReasonPlaceholder')}
            maxLength={500}
          />
          <Text size="xs" color="text-[var(--bellum-text-muted)]">
            {t('colleagueActivity.readOnly')}
          </Text>
          <DialogFooter>
            <Button variant="outline" className="min-h-11" onClick={() => setOpen(false)}>
              {t('guard.cancel')}
            </Button>
            <Button
              className="min-h-11"
              disabled={reason.trim().length < 3 || add.isPending}
              onClick={() =>
                add.mutate(
                  { contact_id: contactId, reason: reason.trim() },
                  {
                    onSuccess: () => {
                      setOpen(false)
                      setReason('')
                    },
                  },
                )
              }
            >
              {t('dnc.contactConfirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Box>
  )
}
