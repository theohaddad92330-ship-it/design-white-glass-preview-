import {
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Text,
  Textarea,
} from '@bellum/ui'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useContact } from '@/features/contacts/hooks/useContact'
import { useCreateDraft } from '@/features/mailbox/api'
import { useFirstName } from '@/hooks/useFirstName'
import { formatDate } from '@/lib/locale'
import { assigneesOf, type MissionView } from '../api'
import { pointClientDraft } from '../point-client-draft'

type Variant = 'default' | 'shorter' | 'direct'

/**
 * Théo missions-dossier.R4 — « PRÉPARER LE POINT CLIENT ».
 *
 * La fenêtre s'ouvre DÉJÀ rédigée (objet et message à partir des faits de la mission), relisible et
 * modifiable ; « Régénérer », « Plus court » et « Plus direct » reprennent le texte. « Conserver le brouillon »
 * dépose un brouillon dans la messagerie connectée — RIEN n'est envoyé : le commercial relit et envoie lui-même.
 *
 * Le destinataire est l'interlocuteur client de la mission ; sans adresse connue, le geste se DIT (il ne devine
 * aucune adresse) et le texte reste copiable.
 */
export function MissionPointClientDialog({
  mission,
  open,
  onOpenChange,
}: {
  mission: MissionView
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation('missions')
  const firstName = useFirstName()
  const contact = useContact(mission.clientManagerContactId ?? '')
  const createDraft = useCreateDraft()
  const people = assigneesOf(mission)

  const compose = (variant: Variant) =>
    pointClientDraft({
      missionLabel: mission.label,
      consultantName: people[0]?.fullName ?? null,
      clientFirstName: mission.clientManagerName?.split(' ')[0] ?? null,
      senderFirstName: firstName || null,
      endsOnLabel: mission.ends_on
        ? (formatDate(mission.ends_on, { day: 'numeric', month: 'short', timeZone: 'UTC' }) ?? null)
        : null,
      variant,
    })

  const [initial] = useState(() => compose('default'))
  const [subject, setSubject] = useState(initial.subject)
  const [body, setBody] = useState(initial.body)

  const regenerate = (variant: Variant) => {
    const next = compose(variant)
    setSubject(next.subject)
    setBody(next.body)
  }

  const email = mission.clientManagerContactId ? (contact.data?.email ?? null) : null
  const reason = !mission.clientManagerName
    ? t('dossier.pointClient.noRecipient')
    : email === null
      ? t('dossier.pointClient.noEmail')
      : null

  const keep = () => {
    if (email === null) return
    createDraft.mutate(
      { to: email, cc: [], subject, body, appendSignature: true, documentIds: [] },
      {
        onSuccess: () => {
          toast.success(t('dossier.pointClient.kept'))
          onOpenChange(false)
        },
        onError: error => toast.error(error.message || t('dossier.pointClient.keepError')),
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('common:actions.close')} className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('dossier.pointClient.title')}</DialogTitle>
          <DialogDescription>{t('dossier.pointClient.intro')}</DialogDescription>
        </DialogHeader>

        <Box className="space-y-3">
          <Box className="space-y-1">
            <label htmlFor="point-client-to" className="text-sm font-medium">
              {t('dossier.pointClient.to')}
            </label>
            <Input
              id="point-client-to"
              readOnly
              value={
                mission.clientManagerName
                  ? `${mission.clientManagerName}${email ? ` · ${email}` : ''}`
                  : t('dossier.pointClient.noRecipient')
              }
            />
          </Box>
          <Box className="space-y-1">
            <label htmlFor="point-client-subject" className="text-sm font-medium">
              {t('dossier.pointClient.subject')}
            </label>
            <Input id="point-client-subject" value={subject} onChange={event => setSubject(event.target.value)} />
          </Box>
          <Box className="space-y-1">
            <label htmlFor="point-client-body" className="text-sm font-medium">
              {t('dossier.pointClient.body')}
            </label>
            <Textarea id="point-client-body" rows={9} value={body} onChange={event => setBody(event.target.value)} />
          </Box>
          <Box display="flex" className="flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="pointer-coarse:min-h-11"
              onClick={() => regenerate('default')}
            >
              {t('dossier.pointClient.regenerate')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="pointer-coarse:min-h-11"
              onClick={() => regenerate('shorter')}
            >
              {t('dossier.pointClient.shorter')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="pointer-coarse:min-h-11"
              onClick={() => regenerate('direct')}
            >
              {t('dossier.pointClient.direct')}
            </Button>
          </Box>
          {reason ? (
            <Text size="sm" color="text-[var(--bellum-text-muted)]">
              {reason}
            </Text>
          ) : null}
        </Box>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="pointer-coarse:min-h-11"
            onClick={() => onOpenChange(false)}
          >
            {t('dossier.pointClient.cancel')}
          </Button>
          <Button
            type="button"
            className="pointer-coarse:min-h-11"
            disabled={email === null || subject.trim() === '' || body.trim() === '' || createDraft.isPending}
            onClick={keep}
          >
            {t('dossier.pointClient.keep')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
