import { useState } from 'react'
import {
  Badge,
  Box,
  Button,
  Card,
  Checkbox,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Text,
  Textarea,
} from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import {
  MISSION_INTERRUPTION_RESPONSIBILITIES,
  MISSION_INTERRUPTION_RISKS,
  type MissionInterruptionResponsibility,
  type MissionInterruptionRisk,
} from '@bellum/contracts'
import { formatDate } from '@/lib/locale'
import { useMissionInterruption, useMissionInterruptionAction } from '../api'

const NOTE_MIN_LENGTH = 20

/**
 * #2414 (LAU-FINAL-128) / épopée #2986 — mission interrompue, traitement
 * spécifique : motif, responsabilité, risque, les deux accusés. NO-GO : la
 * disponibilité ne se confirme JAMAIS à la déclaration — {@link
 * ConfirmAvailabilityBanner} en est le SEUL chemin, un second geste humain.
 */
export function MissionInterruptionPanel({ missionId, status }: { missionId: string; status: string }) {
  const { t } = useTranslation('missions')
  const visible = status === 'terminated'
  const { data } = useMissionInterruption(missionId, visible)
  if (!visible || data === undefined) return null

  return (
    <Card className="p-4" aria-label={t('interruption.title')}>
      <Text element="h2" size="base" weight="semibold">
        {t('interruption.title')}
      </Text>
      {data === null ? (
        <DeclareInterruptionForm missionId={missionId} />
      ) : (
        <DeclaredInterruption missionId={missionId} interruption={data} />
      )}
    </Card>
  )
}

function DeclareInterruptionForm({ missionId }: { missionId: string }) {
  const { t } = useTranslation('missions')
  const action = useMissionInterruptionAction(missionId)
  const [responsibility, setResponsibility] = useState<MissionInterruptionResponsibility>('client')
  const [risk, setRisk] = useState<MissionInterruptionRisk>('faible')
  const [confidentialityAcknowledged, setConfidentialityAcknowledged] = useState(false)
  const [nonSolicitationAcknowledged, setNonSolicitationAcknowledged] = useState(false)
  const [note, setNote] = useState('')

  const canSubmit = confidentialityAcknowledged && nonSolicitationAcknowledged && note.trim().length >= NOTE_MIN_LENGTH

  return (
    <form
      className="mt-3 flex flex-col gap-3"
      onSubmit={event => {
        event.preventDefault()
        if (!canSubmit) return
        action.mutate({
          action: 'declare',
          input: { responsibility, risk, confidentialityAcknowledged, nonSolicitationAcknowledged, note: note.trim() },
        })
      }}
    >
      <Box display="flex" className="flex-wrap gap-3">
        <Box>
          <Text size="xs" weight="medium">
            {t('interruption.responsibility.label')}
          </Text>
          <Select
            value={responsibility}
            onValueChange={value => setResponsibility(value as MissionInterruptionResponsibility)}
          >
            <SelectTrigger aria-label={t('interruption.responsibility.label')} className="h-10 w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MISSION_INTERRUPTION_RESPONSIBILITIES.map(value => (
                <SelectItem key={value} value={value}>
                  {t(`interruption.responsibility.${value}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Box>
        <Box>
          <Text size="xs" weight="medium">
            {t('interruption.risk.label')}
          </Text>
          <Select value={risk} onValueChange={value => setRisk(value as MissionInterruptionRisk)}>
            <SelectTrigger aria-label={t('interruption.risk.label')} className="h-10 w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MISSION_INTERRUPTION_RISKS.map(value => (
                <SelectItem key={value} value={value}>
                  {t(`interruption.risk.${value}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Box>
      </Box>
      <Textarea
        value={note}
        onChange={event => setNote(event.target.value)}
        aria-label={t('interruption.noteLabel')}
        placeholder={t('interruption.noteLabel')}
        maxLength={2000}
      />
      <Box display="flex" className="items-center gap-2">
        <Checkbox
          checked={confidentialityAcknowledged}
          onCheckedChange={value => setConfidentialityAcknowledged(value === true)}
          aria-label={t('interruption.confidentialityAcknowledged')}
        />
        <Text size="sm">{t('interruption.confidentialityAcknowledged')}</Text>
      </Box>
      <Box display="flex" className="items-center gap-2">
        <Checkbox
          checked={nonSolicitationAcknowledged}
          onCheckedChange={value => setNonSolicitationAcknowledged(value === true)}
          aria-label={t('interruption.nonSolicitationAcknowledged')}
        />
        <Text size="sm">{t('interruption.nonSolicitationAcknowledged')}</Text>
      </Box>
      <Button type="submit" className="self-start pointer-coarse:min-h-11" disabled={!canSubmit || action.isPending}>
        {t('interruption.declare')}
      </Button>
    </form>
  )
}

function DeclaredInterruption({
  missionId,
  interruption,
}: {
  missionId: string
  interruption: NonNullable<ReturnType<typeof useMissionInterruption>['data']>
}) {
  const { t } = useTranslation('missions')
  const action = useMissionInterruptionAction(missionId)

  return (
    <Box className="mt-3 flex flex-col gap-2">
      <Box display="flex" className="flex-wrap gap-2">
        <Badge variant="outline">{t(`interruption.responsibility.${interruption.responsibility}`)}</Badge>
        <Badge variant="outline">{t(`interruption.risk.${interruption.risk}`)}</Badge>
      </Box>
      <Text size="sm">{interruption.note}</Text>
      {interruption.availabilityConfirmed ? (
        <Text size="sm" className="text-[var(--bellum-text-muted)]">
          {t('interruption.availabilityConfirmed', {
            date: formatDate(interruption.availabilityConfirmedAt as string),
          })}
        </Text>
      ) : (
        <Box className="flex flex-col gap-2">
          <Text size="sm" className="text-[var(--warning-soft-text)]">
            {t('interruption.availabilityPending')}
          </Text>
          <Button
            size="sm"
            variant="outline"
            className="self-start pointer-coarse:min-h-11"
            disabled={action.isPending}
            onClick={() => action.mutate({ action: 'confirm_availability' })}
          >
            {t('interruption.confirmAvailability')}
          </Button>
        </Box>
      )}
    </Box>
  )
}
