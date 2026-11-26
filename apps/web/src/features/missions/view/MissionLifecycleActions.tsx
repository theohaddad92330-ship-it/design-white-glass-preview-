import { MISSION_END_REASONS, MISSION_RUNNING_STATUSES, type MissionEndReason } from '@bellum/contracts'
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
  SelectField,
  Text,
} from '@bellum/ui'
import { CalendarPlus, CircleCheck } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useEndMission, useExtendMission, type MissionView } from '../api'

/**
 * #4196 (épopée #4191, lot L5) — « Prolonger » et « Terminer », dans la zone
 * propriétés du panneau d'une mission.
 *
 * Les deux boutons ne portent AUCUNE requête : seul le dialogue ouvert appelle
 * l'API. Les écrans qui montent le panneau (liste, board, cockpit) n'ont donc pas
 * à fournir de client de requêtes pour afficher deux boutons.
 *
 * Rien ne s'affiche sur une mission qui n'est pas en cours (brouillon, terminée,
 * annulée) : on ne prolonge pas ce qui n'a pas commencé, on ne termine pas deux fois.
 */
export function MissionLifecycleActions({ mission }: { mission: MissionView }) {
  const { t } = useTranslation('missions')
  const [open, setOpen] = useState<'extend' | 'end' | null>(null)
  if (!(MISSION_RUNNING_STATUSES as readonly string[]).includes(mission.status)) return null

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        icon={CalendarPlus}
        className="pointer-coarse:min-h-11"
        onClick={() => setOpen('extend')}
      >
        {t('lifecycle.extend')}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        icon={CircleCheck}
        className="pointer-coarse:min-h-11"
        onClick={() => setOpen('end')}
      >
        {t('lifecycle.end')}
      </Button>
      {open === 'extend' ? <ExtendDialog mission={mission} onClose={() => setOpen(null)} /> : null}
      {open === 'end' ? <EndDialog mission={mission} onClose={() => setOpen(null)} /> : null}
    </>
  )
}

/**
 * Théo missions-dossier — le cycle de la mission vit dans le menu « ⋯ » du dossier : le menu ouvre CE
 * dialogue, le même que les boutons ci-dessus (un seul chemin d'écriture).
 */
export function MissionLifecycleDialog({
  mission,
  kind,
  onClose,
}: {
  mission: MissionView
  kind: 'extend' | 'end'
  onClose: () => void
}) {
  return kind === 'extend' ? (
    <ExtendDialog mission={mission} onClose={onClose} />
  ) : (
    <EndDialog mission={mission} onClose={onClose} />
  )
}

/** Le cycle ne se propose que sur une mission en cours. */
export function canRunLifecycle(mission: MissionView): boolean {
  return (MISSION_RUNNING_STATUSES as readonly string[]).includes(mission.status)
}

function ExtendDialog({ mission, onClose }: { mission: MissionView; onClose: () => void }) {
  const { t } = useTranslation('missions')
  const extend = useExtendMission(mission.id)
  const [newEndsOn, setNewEndsOn] = useState('')
  const [newDailyRate, setNewDailyRate] = useState('')
  const [proof, setProof] = useState('')

  const rate = newDailyRate.trim() === '' ? null : Number(newDailyRate)
  const beyondCurrent = Boolean(newEndsOn) && (!mission.ends_on || newEndsOn > mission.ends_on)
  const ready = beyondCurrent && proof.trim().length > 0 && (rate === null || rate > 0)

  const submit = () => {
    if (!ready) return
    extend.mutate(
      { newEndsOn, proof: proof.trim(), ...(rate !== null ? { newDailyRate: rate } : {}) },
      { onSuccess: onClose },
    )
  }

  return (
    <LifecycleDialog
      title={t('lifecycle.extendTitle')}
      description={t('lifecycle.extendDescription')}
      onClose={onClose}
    >
      <Field id="lifecycle-new-ends-on" label={t('lifecycle.newEndsOn')}>
        <Input
          id="lifecycle-new-ends-on"
          type="date"
          value={newEndsOn}
          min={mission.ends_on ?? undefined}
          onChange={event => setNewEndsOn(event.target.value)}
        />
      </Field>
      <Field id="lifecycle-new-rate" label={t('lifecycle.newDailyRate')}>
        <Input
          id="lifecycle-new-rate"
          type="number"
          inputMode="decimal"
          min={0}
          value={newDailyRate}
          onChange={event => setNewDailyRate(event.target.value)}
        />
      </Field>
      <Field id="lifecycle-proof" label={t('lifecycle.proof')}>
        <Input id="lifecycle-proof" value={proof} onChange={event => setProof(event.target.value)} />
      </Field>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose} className="min-h-11">
          {t('lifecycle.cancel')}
        </Button>
        <Button
          type="button"
          onClick={submit}
          disabled={!ready || extend.isPending}
          isLoading={extend.isPending}
          className="min-h-11"
        >
          {t('lifecycle.extendSubmit')}
        </Button>
      </DialogFooter>
    </LifecycleDialog>
  )
}

function EndDialog({ mission, onClose }: { mission: MissionView; onClose: () => void }) {
  const { t } = useTranslation('missions')
  const end = useEndMission(mission.id)
  const [endedOn, setEndedOn] = useState('')
  const [reason, setReason] = useState<MissionEndReason>('date_prevue')

  const submit = () => {
    if (!endedOn) return
    end.mutate({ endedOn, reason }, { onSuccess: onClose })
  }

  return (
    <LifecycleDialog title={t('lifecycle.endTitle')} description={t('lifecycle.endDescription')} onClose={onClose}>
      <Field id="lifecycle-ended-on" label={t('lifecycle.endedOn')}>
        <Input id="lifecycle-ended-on" type="date" value={endedOn} onChange={event => setEndedOn(event.target.value)} />
      </Field>
      <Field id="lifecycle-reason" label={t('lifecycle.reason')}>
        <SelectField
          id="lifecycle-reason"
          ariaLabel={t('lifecycle.reason')}
          value={reason}
          onChange={next => setReason(next as MissionEndReason)}
          options={MISSION_END_REASONS.map(value => ({ value, label: t(`lifecycle.reasons.${value}`) }))}
        />
      </Field>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose} className="min-h-11">
          {t('lifecycle.cancel')}
        </Button>
        <Button
          type="button"
          onClick={submit}
          disabled={!endedOn || end.isPending}
          isLoading={end.isPending}
          className="min-h-11"
        >
          {t('lifecycle.endSubmit')}
        </Button>
      </DialogFooter>
    </LifecycleDialog>
  )
}

function LifecycleDialog({
  title,
  description,
  onClose,
  children,
}: {
  title: string
  description: string
  onClose: () => void
  children: ReactNode
}) {
  const { t } = useTranslation('missions')
  return (
    <Dialog open onOpenChange={next => (next ? undefined : onClose())}>
      <DialogContent closeLabel={t('lifecycle.cancel')}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Box className="space-y-3">{children}</Box>
      </DialogContent>
    </Dialog>
  )
}

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <Box className="flex flex-col gap-1">
      <label htmlFor={id}>
        <Text size="xs" color="text-muted-foreground">
          {label}
        </Text>
      </label>
      {children}
    </Box>
  )
}
