import { SUBMISSION_CHANNELS, type Submission, type SubmissionChannel } from '@bellum/contracts'
import {
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FilterChips,
  Input,
  Label,
  SelectField,
  Text,
  Textarea,
} from '@bellum/ui'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatDate } from '@/lib/locale'
import { useRecordSubmissionDetails, useSubmissionPreview, useSubmissionRecipientContacts } from '../api'

const TEXT_MAX = 2000
const AVAILABILITY_MAX = 300
const MESSAGE_MAX = 5000

/**
 * #2887 (#2371.9) — trois états, jamais deux : « personne ne l'a déclaré »
 * n'est ni « oui » ni « non ». Même patron que la clause de non-sollicitation
 * partenaire (`PartnerPipeline.tsx`, `CLAUSE_CHOICES`).
 */
const AGREEMENT_CHOICES = ['unknown', 'yes', 'no'] as const
const agreementValue = (declared: boolean | null): (typeof AGREEMENT_CHOICES)[number] =>
  declared === null ? 'unknown' : declared ? 'yes' : 'no'
const agreementFrom = (choice: string): boolean | null => (choice === 'unknown' ? null : choice === 'yes')

/**
 * #2177.6 / .8 / .24 / .25 / .28 / .30 — le DÉTAIL d'un positionnement,
 * absent du contrat jusqu'à ce lot : destinataire, canal, message préparé,
 * disponibilité annoncée, conditions.
 *
 * Même patron que `SubmissionFeedbackDialog`/`ScheduleInterviewDialog` : une
 * seule fenêtre, montée par `SubmissionRow`, réamorcée à chaque ouverture
 * depuis la fiche COURANTE — un second positionnement ne doit jamais hériter
 * du détail du précédent.
 *
 * Le message reste un texte PRÉPARÉ : cette fenêtre n'envoie jamais rien,
 * elle pose seulement ce que le copilote ou le commercial ont écrit — même
 * doctrine que « préparer le mail » (#2177.47), qui reste une action séparée.
 */
export function SubmissionDetailsDialog({
  submission,
  open,
  onClose,
}: {
  submission: Submission
  open: boolean
  onClose: () => void
}) {
  const { t } = useTranslation('submissions')
  const record = useRecordSubmissionDetails()
  const contacts = useSubmissionRecipientContacts(submission.accountId)
  // #2189.10-.16 (épopée #2940) — l'aperçu : l'objet, le CV réellement figé, la
  // source des arguments. Lu à l'ouverture, jamais mis en cache au-delà.
  const preview = useSubmissionPreview(open ? submission.id : undefined)

  const [recipientContactId, setRecipientContactId] = useState('')
  const [channel, setChannel] = useState<SubmissionChannel | ''>('')
  const [message, setMessage] = useState('')
  const [availability, setAvailability] = useState('')
  const [conditions, setConditions] = useState('')
  const [agreement, setAgreement] = useState<(typeof AGREEMENT_CHOICES)[number]>('unknown')
  const [agreementDate, setAgreementDate] = useState('')

  useEffect(() => {
    if (!open) return
    setRecipientContactId(submission.recipientContactId ?? '')
    setChannel(submission.channel ?? '')
    setMessage(submission.message ?? '')
    setAvailability(submission.availability ?? '')
    setConditions(submission.conditions ?? '')
    setAgreement(agreementValue(submission.consultantAgreement))
    setAgreementDate(submission.consultantAgreementDate ?? '')
  }, [open, submission])

  const submit = () => {
    if (record.isPending) return
    const consultantAgreement = agreementFrom(agreement)
    record.mutate(
      {
        id: submission.id,
        recipientContactId: recipientContactId || null,
        channel: channel || null,
        message: message.trim() || null,
        availability: availability.trim() || null,
        conditions: conditions.trim() || null,
        // #2887 (#2371.9) — une date n'a de sens QUE si l'accord (oui OU non)
        // est renseigné ; « non déclaré » efface les deux ensemble.
        consultantAgreement,
        consultantAgreementDate: consultantAgreement === null ? null : agreementDate || null,
      },
      { onSuccess: () => onClose() },
    )
  }

  return (
    <Dialog open={open} onOpenChange={next => (next ? undefined : onClose())}>
      <DialogContent closeLabel={t('common:actions.close')} className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('details.title', { name: submission.consultantName ?? t('unknownTalent') })}</DialogTitle>
          <DialogDescription>{t('details.description')}</DialogDescription>
        </DialogHeader>

        {preview.data ? (
          <Box className="space-y-1 rounded-md border border-dashed border-border p-3">
            <Text element="p" size="xs" weight="semibold" color="text-muted-foreground">
              {t('details.preview.title')}
            </Text>
            <Text element="p" size="sm">
              {t('details.preview.subject')} : {preview.data.subject}
            </Text>
            <Text element="p" size="sm" color="text-muted-foreground">
              {preview.data.cv
                ? formatDate(preview.data.cv.capturedAt)
                  ? t('details.preview.cv', { date: formatDate(preview.data.cv.capturedAt) })
                  : t('details.preview.cvUnknownDate')
                : t('details.preview.noCv')}
            </Text>
            {preview.data.argumentsSource ? (
              <Text element="p" size="sm" color="text-muted-foreground">
                {t('details.preview.argumentsSource', { source: preview.data.argumentsSource })}
              </Text>
            ) : null}
          </Box>
        ) : null}

        <Box className="space-y-4">
          {/* #2887 (#2371.9) — L'ÉCONOMIE de la proposition. Lue sur la fiche,
              jamais recalculée ici (GA-26) : `proposedRateCents` est déjà la
              vérité affichée sur la ligne du positionnement. */}
          <Text element="p" size="sm" color="text-muted-foreground">
            {submission.proposedRateCents === null
              ? t('noRate')
              : t('rate', { value: Math.round(submission.proposedRateCents / 100) })}
          </Text>

          {/* #2887 (#2371.9) — LE RETOUR DU CONSULTANT sur cette proposition
              de mission. Trois états, jamais deux (GA-18/GA-19) : « non
              déclaré » n'est ni un oui ni un non. */}
          <Box className="space-y-1.5">
            <Label htmlFor="submission-details-agreement">{t('details.agreement.label')}</Label>
            <SelectField
              id="submission-details-agreement"
              size="sm"
              ariaLabel={t('details.agreement.label')}
              value={agreement}
              onChange={next => {
                const choice = next as (typeof AGREEMENT_CHOICES)[number]
                setAgreement(choice)
                // #2887 — un refus se date aussi ; seul « non déclaré » efface la date.
                if (choice === 'unknown') setAgreementDate('')
              }}
              options={AGREEMENT_CHOICES.map(choice => ({ value: choice, label: t(`details.agreement.${choice}`) }))}
            />
            {agreement !== 'unknown' && (
              <Box className="space-y-1.5">
                <Label htmlFor="submission-details-agreement-date">{t('details.agreementDate')}</Label>
                <Input
                  id="submission-details-agreement-date"
                  type="date"
                  value={agreementDate}
                  onChange={event => setAgreementDate(event.target.value)}
                />
              </Box>
            )}
          </Box>

          <Box className="space-y-1">
            <Text element="p" size="xs" weight="semibold" color="text-muted-foreground">
              {t('details.recipient')}
            </Text>
            <SelectField
              size="sm"
              ariaLabel={t('details.recipient')}
              value={recipientContactId}
              disabled={contacts.isLoading}
              emptyOption={{ label: t('details.noRecipient') }}
              options={(contacts.data ?? []).map(contact => ({ value: contact.id, label: contact.full_name }))}
              onChange={setRecipientContactId}
            />
          </Box>

          <FilterChips
            ariaLabel={t('details.channel')}
            legend={t('details.channel')}
            value={channel || null}
            clearable
            onChange={next => setChannel(next ?? '')}
            options={SUBMISSION_CHANNELS.map(value => ({ value, label: t(`details.channels.${value}`) }))}
          />

          <Box className="space-y-1.5">
            <Label htmlFor="submission-details-message">{t('details.message')}</Label>
            <Textarea
              id="submission-details-message"
              value={message}
              maxLength={MESSAGE_MAX}
              rows={3}
              placeholder={t('details.messagePlaceholder')}
              onChange={event => setMessage(event.target.value.slice(0, MESSAGE_MAX))}
            />
          </Box>

          <Box className="space-y-1.5">
            <Label htmlFor="submission-details-availability">{t('details.availability')}</Label>
            <Textarea
              id="submission-details-availability"
              value={availability}
              maxLength={AVAILABILITY_MAX}
              rows={1}
              onChange={event => setAvailability(event.target.value.slice(0, AVAILABILITY_MAX))}
            />
          </Box>

          <Box className="space-y-1.5">
            <Label htmlFor="submission-details-conditions">{t('details.conditions')}</Label>
            <Textarea
              id="submission-details-conditions"
              value={conditions}
              maxLength={TEXT_MAX}
              rows={2}
              onChange={event => setConditions(event.target.value.slice(0, TEXT_MAX))}
            />
          </Box>
        </Box>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('common:actions.cancel')}
          </Button>
          <Button type="button" onClick={submit} disabled={record.isPending} isLoading={record.isPending}>
            {t('details.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
