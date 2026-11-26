import {
  canTransition,
  SUBMISSION_CHANNELS,
  SUBMISSION_OUTCOME_REASONS,
  type Submission,
  type SubmissionChannel,
  type SubmissionOutcomeReason,
  type SubmissionStage,
  type SubmissionSubstatus,
} from '@bellum/contracts'
import {
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  SelectField,
  Text,
} from '@bellum/ui'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAdvanceSubmission, useAdvanceSubstatus, useRecordSubmissionDetails } from '../api'
import { presentationState, type PresentationState } from '../lib/presentationStates'

/** Les états que « Mettre à jour » sait poser — « Convertie en mission » naît de la création de la mission. */
const SETTABLE = [
  'preselection',
  'to_present',
  'presented',
  'client_interview',
  'retained',
  'declined',
  'withdrawn',
  'no_response',
] as const satisfies readonly PresentationState[]
type SettableState = (typeof SETTABLE)[number]

/** L'état de Théo → l'étape de la machine (inchangée) + le sous-statut qui le précise. */
const TARGET: Record<
  SettableState,
  { stage: SubmissionStage; substatus: SubmissionSubstatus | null; needsReason: boolean }
> = {
  preselection: { stage: 'shortlisted', substatus: 'to_qualify', needsReason: false },
  to_present: { stage: 'shortlisted', substatus: 'ready_to_present', needsReason: false },
  presented: { stage: 'submitted', substatus: 'presented', needsReason: false },
  client_interview: { stage: 'interview', substatus: null, needsReason: false },
  retained: { stage: 'accepted', substatus: null, needsReason: false },
  declined: { stage: 'rejected', substatus: null, needsReason: true },
  withdrawn: { stage: 'withdrawn', substatus: null, needsReason: true },
  no_response: { stage: 'submitted', substatus: 'no_response', needsReason: false },
}

/**
 * Théo C projects-presentations — « METTRE À JOUR LA PRÉSENTATION » : « Tu consignes ce qui s'est passé.
 * Aucun message ne part et aucune mission n'est créée automatiquement. »
 *
 * Étape (les quatre états de Théo + les sorties, A4), canal, accord à présenter (N1), motif de clôture —
 * demandé SEULEMENT pour une sortie (refusé, retiré). Une étape que la machine du contrat interdit n'est pas
 * proposée : en montrer une ferait cliquer sur un refus. « Retenu » passe par la route d'orchestration du
 * besoin (#4195) — c'est `useAdvanceSubmission` qui choisit.
 */
export function PresentationUpdateDialog({
  submission,
  open,
  onClose,
}: {
  submission: Submission
  open: boolean
  onClose: () => void
}) {
  const { t } = useTranslation('submissions')
  const advance = useAdvanceSubmission()
  const advanceSubstatus = useAdvanceSubstatus()
  const recordDetails = useRecordSubmissionDetails()
  const current = presentationState(submission)
  const [state, setState] = useState<PresentationState>(current)
  const [channel, setChannel] = useState<SubmissionChannel | ''>(submission.channel ?? '')
  const [reason, setReason] = useState<SubmissionOutcomeReason | ''>(submission.outcomeReason ?? '')
  const [detail, setDetail] = useState('')
  const [agreed, setAgreed] = useState(submission.consultantAgreement === true)

  useEffect(() => {
    if (!open) return
    setState(presentationState(submission))
    setChannel(submission.channel ?? '')
    setReason(submission.outcomeReason ?? '')
    setDetail('')
    setAgreed(submission.consultantAgreement === true)
  }, [open, submission])

  const options = SETTABLE.filter(option => {
    if (option === current) return true
    const target = TARGET[option]
    return target.stage === submission.stage || canTransition(submission.stage, target.stage)
  })
  const target = (SETTABLE as readonly PresentationState[]).includes(state) ? TARGET[state as SettableState] : null
  const changed = state !== current
  const needsReason = Boolean(changed && target?.needsReason)
  const canSave =
    !(needsReason && !reason) && !advance.isPending && !advanceSubstatus.isPending && !recordDetails.isPending

  const save = async () => {
    if (!canSave) return
    if (changed && target) {
      if (target.stage !== submission.stage) {
        await advance.mutateAsync({
          id: submission.id,
          needId: submission.needId,
          stage: target.stage,
          ...(needsReason && reason ? { outcomeReason: reason } : {}),
          ...(needsReason && detail.trim() ? { outcomeDetail: detail.trim() } : {}),
        })
      }
      if (target.substatus && target.substatus !== submission.substatus) {
        await advanceSubstatus.mutateAsync({ id: submission.id, substatus: target.substatus })
      }
    }
    const channelChanged = (channel || null) !== submission.channel
    const agreementChanged = agreed !== (submission.consultantAgreement === true)
    if (channelChanged || agreementChanged) {
      await recordDetails.mutateAsync({
        id: submission.id,
        ...(channelChanged ? { channel: channel || null } : {}),
        // Un accord vérifié se date du jour : une date n'a de sens que si l'accord est déclaré.
        ...(agreementChanged && agreed
          ? { consultantAgreement: true, consultantAgreementDate: new Date().toISOString().slice(0, 10) }
          : {}),
      })
    }
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={next => (next ? undefined : onClose())}>
      <DialogContent closeLabel={t('common:actions.close')} className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('presentations.update.title')}</DialogTitle>
          <DialogDescription>{t('presentations.update.description')}</DialogDescription>
        </DialogHeader>
        <Box className="space-y-3">
          <label className="block">
            <Text size="xs" weight="medium" element="span">
              {t('presentations.update.stage')}
            </Text>
            <SelectField
              ariaLabel={t('presentations.update.stage')}
              value={state}
              onChange={next => setState(next as PresentationState)}
              options={options.map(option => ({ value: option, label: t(`presentations.states.${option}`) }))}
              className="mt-1 w-full"
            />
          </label>
          <label className="block">
            <Text size="xs" weight="medium" element="span">
              {t('presentations.update.channel')}
            </Text>
            <SelectField
              ariaLabel={t('presentations.update.channel')}
              value={channel}
              onChange={next => setChannel(next as SubmissionChannel | '')}
              emptyOption={{ label: t('presentations.row.channelUnknown') }}
              options={SUBMISSION_CHANNELS.map(value => ({ value, label: t(`details.channels.${value}`) }))}
              className="mt-1 w-full"
            />
          </label>
          <label className="flex min-h-11 items-center gap-2">
            <input type="checkbox" checked={agreed} onChange={event => setAgreed(event.target.checked)} />
            <Text size="sm" element="span">
              {t('presentations.update.agreement')}
            </Text>
          </label>
          {needsReason ? (
            <>
              <label className="block">
                <Text size="xs" weight="medium" element="span">
                  {t('presentations.update.reason')}
                </Text>
                <SelectField
                  ariaLabel={t('presentations.update.reason')}
                  value={reason}
                  onChange={next => setReason(next as SubmissionOutcomeReason | '')}
                  emptyOption={{ label: t('presentations.add.choose') }}
                  options={SUBMISSION_OUTCOME_REASONS.map(value => ({ value, label: t(`reasons.${value}`) }))}
                  className="mt-1 w-full"
                />
              </label>
              <label className="block">
                <Text size="xs" weight="medium" element="span">
                  {t('presentations.update.detail')}
                </Text>
                <textarea
                  value={detail}
                  onChange={event => setDetail(event.target.value)}
                  rows={2}
                  className="mt-1 w-full rounded-control border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-2 text-sm"
                />
              </label>
            </>
          ) : null}
        </Box>
        <DialogFooter>
          <Button type="button" variant="outline" className="pointer-coarse:min-h-11" onClick={onClose}>
            {t('presentations.add.cancel')}
          </Button>
          <Button type="button" className="pointer-coarse:min-h-11" disabled={!canSave} onClick={() => void save()}>
            {t('presentations.update.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
