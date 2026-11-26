import type { OutreachSequence, OutreachSequenceStep } from '@bellum/contracts'
import { Box, Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Text } from '@bellum/ui'
import type { TFunction } from 'i18next'
import { CalendarCheck, Check, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { callScriptOf, linkedinDraftOf, outcomeOptions } from '../step-channels'

/**
 * Lot L-B (#4165) — LE GESTE DE CHAQUE CANAL, sous la ligne de l'étape.
 *
 *  · LinkedIn : « Copier le message et ouvrir le profil », puis « Marquer
 *    envoyé ». Bellum ne pilote JAMAIS LinkedIn — le clic d'envoi est celui du
 *    commercial, sur LinkedIn ; « Marquer envoyé » est une déclaration (c81),
 *    jamais une preuve d'envoi.
 *  · Appel : la trame préparée, puis l'issue (joint / messagerie / pas de
 *    réponse) DÉCLARÉE à la main.
 *  · Invitation : son issue (acceptée / en attente) est ce qui décide du saut du
 *    message suivant.
 *
 * Aucun texte n'est inventé : sans message ni trame préparés, l'écran le dit.
 */

const UNDECLARED = '__undeclared__'

export function StepChannelGestures({
  step,
  sequence,
  onDone,
  onOutcome,
  onMeetingBooked,
  pending,
  t,
}: {
  step: OutreachSequenceStep
  sequence: OutreachSequence
  onDone: () => void
  onOutcome: (outcome: string | null) => void
  onMeetingBooked: () => void
  pending: boolean
  t: TFunction<'outreach'>
}) {
  const alive = sequence.status === 'active' || sequence.status === 'paused'
  const outcomes = outcomeOptions(step.kind)
  const outcome = typeof step.payload['outcome'] === 'string' ? (step.payload['outcome'] as string) : null
  const isLinkedin = step.kind === 'linkedin_invite' || step.kind === 'linkedin_message'
  const isCall = step.kind === 'call'
  if (!isLinkedin && !isCall) return null
  // Une étape sautée ou une séquence terminée n'a plus de geste à proposer.
  if (step.status === 'skipped' || !alive) return null

  const draft = isLinkedin ? linkedinDraftOf(step) : null
  const script = isCall ? callScriptOf(step) : null

  const copyAndOpen = async (): Promise<void> => {
    if (draft?.body) {
      try {
        if (!navigator.clipboard) throw new Error('clipboard unavailable')
        await navigator.clipboard.writeText(draft.body)
        toast.success(t('multichannel.gesture.linkedinCopied'))
      } catch {
        // Un presse-papiers refusé se DIT, il ne se contourne pas en silence.
        toast.error(t('multichannel.gesture.linkedinCopyFailed'))
      }
    }
    if (draft?.profileUrl) window.open(draft.profileUrl, '_blank', 'noopener,noreferrer')
    else toast.error(t('multichannel.gesture.linkedinNoProfile'))
  }

  return (
    <Box
      className="flex flex-col gap-2 rounded-md bg-[var(--bellum-surface-2)] p-2"
      data-testid={`gesture-${step.kind}`}
    >
      {isLinkedin ? (
        draft?.body ? (
          <Text size="xs" className="whitespace-pre-wrap text-[var(--bellum-text-secondary)]">
            {draft.body}
          </Text>
        ) : (
          <Text size="xs" className="text-[var(--bellum-text-muted)]">
            {t('multichannel.gesture.linkedinNoDraft')}
          </Text>
        )
      ) : script ? (
        <Box className="flex flex-col gap-0.5">
          <Text size="xs" weight="medium">
            {t('multichannel.gesture.callScript')}
          </Text>
          <Text size="xs" className="whitespace-pre-wrap text-[var(--bellum-text-secondary)]">
            {script}
          </Text>
        </Box>
      ) : (
        <Text size="xs" className="text-[var(--bellum-text-muted)]">
          {t('multichannel.gesture.callNoScript')}
        </Text>
      )}
      <Text size="xs" className="text-[var(--bellum-text-muted)]">
        {t('multichannel.gesture.manualNote')}
      </Text>
      <Box className="flex flex-wrap items-center gap-2">
        {isLinkedin && step.status === 'pending' ? (
          <>
            <Button size="sm" variant="outline" onClick={() => void copyAndOpen()}>
              <ExternalLink className="size-3.5" aria-hidden="true" />
              {t('multichannel.gesture.linkedinCopyOpen')}
            </Button>
            <Button size="sm" variant="outline" disabled={pending || sequence.status !== 'active'} onClick={onDone}>
              <Check className="size-3.5" aria-hidden="true" />
              {t('multichannel.gesture.linkedinSent')}
            </Button>
          </>
        ) : null}
        {isCall && step.status === 'pending' ? (
          <Button size="sm" variant="outline" disabled={pending || sequence.status !== 'active'} onClick={onDone}>
            <Check className="size-3.5" aria-hidden="true" />
            {t('multichannel.gesture.callDone')}
          </Button>
        ) : null}
        {outcomes.length > 0 ? (
          <Select
            value={outcome ?? UNDECLARED}
            onValueChange={next => onOutcome(next === UNDECLARED ? null : next)}
            disabled={pending}
          >
            <SelectTrigger aria-label={t('multichannel.gesture.outcomeLabel')} className="h-8 w-48 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UNDECLARED}>{t('multichannel.gesture.outcomeUnspecified')}</SelectItem>
              {outcomes.map(option => (
                <SelectItem key={option} value={option}>
                  {t(`multichannel.outcome.${option}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        {isCall ? (
          <Button size="sm" variant="outline" disabled={pending} onClick={onMeetingBooked}>
            <CalendarCheck className="size-3.5" aria-hidden="true" />
            {t('multichannel.meeting.button')}
          </Button>
        ) : null}
      </Box>
    </Box>
  )
}
