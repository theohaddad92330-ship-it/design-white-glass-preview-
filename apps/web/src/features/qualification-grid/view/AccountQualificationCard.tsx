import type { QualificationAxis, QualificationEvaluationStatus, QualificationManualInput } from '@bellum/contracts'
import {
  Box,
  Button,
  Card,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Text,
} from '@bellum/ui'
import { RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAccountQualification } from '../hooks/useQualificationGrid'
import { axisOriginKey, axisValue, scoreValue } from '../lib/qualificationViewData'

/**
 * #3755 — LA QUALIFICATION DU COMPTE CONTRE LA GRILLE DE L'ESPACE, axe par axe.
 *
 * - un filtre éliminatoire en FAIL : NO-GO, le filtre NOMMÉ ;
 * - le score : des points sur la somme des poids ÉVALUABLES, jamais une
 *   probabilité (c26), jamais nu — chaque axe est listé avec sa preuve ;
 * - un critère non évaluable est NOMMÉ et sort du calcul, il n'affiche pas « 0 »
 *   (GA-18/19) ;
 * - le commercial corrige un critère à la main : sa saisie gagne toujours.
 *
 * Sans grille active, la carte ne s'affiche pas : la fiche reste celle d'avant.
 */
export function AccountQualificationCard({ accountId }: { accountId: string }) {
  const { t } = useTranslation('qualificationGrid')
  const state = useAccountQualification(accountId)
  const [editing, setEditing] = useState<string | null>(null)
  const q = state.qualification
  if (state.isLoading || !q) return null

  const { result } = q
  const score = scoreValue(result)
  const stale = q.evaluated_version !== null && q.evaluated_version !== q.current_version

  return (
    <Card aria-labelledby={`qualification-${accountId}`} className="p-4">
      <Box className="flex flex-wrap items-start justify-between gap-2">
        <Box className="min-w-0">
          <Text
            element="h3"
            id={`qualification-${accountId}`}
            size="base"
            weight="semibold"
            color="text-[var(--bellum-text-primary)]"
          >
            {t('account.title')}
          </Text>
          <Text element="p" size="xs" color="text-[var(--bellum-text-secondary)]">
            {q.evaluated_version === null
              ? t('account.notEvaluatedYet')
              : stale
                ? t('account.staleVersion', { evaluated: q.evaluated_version, current: q.current_version })
                : t('account.evaluatedOn', { version: q.evaluated_version })}
          </Text>
        </Box>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="min-h-11"
          disabled={state.busy}
          onClick={() => state.evaluate()}
        >
          <RefreshCw className="size-4" aria-hidden />
          {t('account.evaluate')}
        </Button>
      </Box>

      <Box className="mt-3 flex flex-col gap-1">
        <Text element="p" size="sm" weight="semibold" color="text-[var(--bellum-text-primary)]">
          {t('account.verdict')} :{' '}
          {result.eliminated_by.length > 0
            ? result.eliminated_by
                .map(filter => t('account.eliminatedBy', { code: filter.code, label: filter.label }))
                .join(' · ')
            : (result.verdict ?? t('account.noVerdict'))}
        </Text>
        <Text element="p" size="sm" color="text-[var(--bellum-text-secondary)]">
          {score ? t('account.score', { value: score }) : t('account.noScore')}
        </Text>
        {result.not_evaluable.length > 0 ? (
          <Text element="p" size="xs" color="text-[var(--bellum-text-secondary)]">
            {t('account.notEvaluableTitle')} : {result.not_evaluable.map(c => `${c.code} ${c.label}`).join(', ')}
          </Text>
        ) : null}
      </Box>

      <ul className="mt-3 flex flex-col divide-y divide-[var(--bellum-border)]">
        {result.axes.map(axis => (
          <li key={axis.code} className="py-2">
            <AxisRow
              axis={axis}
              editing={editing === axis.code}
              busy={state.busy}
              onEdit={() => setEditing(axis.code)}
              onCancel={() => setEditing(null)}
              onSave={input => {
                state.setManual(axis.code, input)
                setEditing(null)
              }}
              onRevert={() => state.clearManual(axis.code)}
            />
          </li>
        ))}
      </ul>
    </Card>
  )
}

function AxisRow({
  axis,
  editing,
  busy,
  onEdit,
  onCancel,
  onSave,
  onRevert,
}: {
  axis: QualificationAxis
  editing: boolean
  busy: boolean
  onEdit: () => void
  onCancel: () => void
  onSave: (input: QualificationManualInput) => void
  onRevert: () => void
}) {
  const { t } = useTranslation('qualificationGrid')
  const value = axisValue(axis)
  const origin = axisOriginKey(axis)
  const valueText =
    value.kind === 'points'
      ? value.text
      : value.kind === 'not_evaluable'
        ? t('account.notEvaluable')
        : t(`account.${value.kind}`)

  return (
    <Box className="flex flex-col gap-1">
      <Box className="flex flex-wrap items-center justify-between gap-2">
        <Text element="p" size="sm" color="text-[var(--bellum-text-primary)]" className="min-w-0">
          <span className="font-semibold">{axis.code}</span> {axis.label}
        </Text>
        <Box className="flex items-center gap-2">
          <Text element="span" size="sm" weight="semibold" color="text-[var(--bellum-text-primary)]">
            {valueText}
          </Text>
          {origin ? (
            <Text element="span" size="xs" color="text-[var(--bellum-text-secondary)]">
              {t(origin)}
            </Text>
          ) : null}
          {!editing ? (
            <Button type="button" size="sm" variant="ghost" className="min-h-11" disabled={busy} onClick={onEdit}>
              {t('account.correct', { code: axis.code })}
            </Button>
          ) : null}
        </Box>
      </Box>
      {axis.evidence ? (
        <Text element="p" size="xs" color="text-[var(--bellum-text-secondary)]">
          {t('account.evidence')} : {axis.evidence}
        </Text>
      ) : null}
      {editing ? <ManualForm axis={axis} busy={busy} onCancel={onCancel} onSave={onSave} onRevert={onRevert} /> : null}
    </Box>
  )
}

function ManualForm({
  axis,
  busy,
  onCancel,
  onSave,
  onRevert,
}: {
  axis: QualificationAxis
  busy: boolean
  onCancel: () => void
  onSave: (input: QualificationManualInput) => void
  onRevert: () => void
}) {
  const { t } = useTranslation('qualificationGrid')
  const statuses: QualificationEvaluationStatus[] =
    axis.kind === 'eliminatory' ? ['pass', 'fail', 'not_evaluable'] : ['scored', 'not_evaluable']
  const [status, setStatus] = useState<QualificationEvaluationStatus>(
    statuses.includes(axis.status) ? axis.status : statuses[0]!,
  )
  const [points, setPoints] = useState<string>(axis.points === null ? '' : String(axis.points))
  const [evidence, setEvidence] = useState<string>(axis.evidence ?? '')
  const parsedPoints = points === '' ? null : Number(points)
  const invalid =
    status === 'scored' &&
    (parsedPoints === null ||
      !Number.isFinite(parsedPoints) ||
      parsedPoints < 0 ||
      axis.weight === null ||
      parsedPoints > axis.weight)

  return (
    <form
      className="mt-1 flex flex-wrap items-end gap-2"
      onSubmit={event => {
        event.preventDefault()
        if (invalid) return
        onSave({ status, points: status === 'scored' ? parsedPoints : null, evidence: evidence.trim() || null })
      }}
    >
      <Select value={status} onValueChange={next => setStatus(next as QualificationEvaluationStatus)}>
        <SelectTrigger aria-label={t('account.status')} className="w-40 min-h-11">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {statuses.map(s => (
            <SelectItem key={s} value={s}>
              {s === 'not_evaluable' ? t('account.notEvaluable') : t(`account.${s}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {status === 'scored' ? (
        <Input
          type="number"
          min={0}
          max={axis.weight ?? undefined}
          aria-label={t('account.points', { weight: axis.weight })}
          placeholder={t('account.points', { weight: axis.weight })}
          value={points}
          className="w-28 min-h-11"
          onChange={event => setPoints(event.target.value)}
        />
      ) : null}
      <Input
        aria-label={t('account.evidence')}
        placeholder={t('account.evidence')}
        value={evidence}
        className="min-h-11 min-w-0 flex-1"
        onChange={event => setEvidence(event.target.value)}
      />
      <Button type="submit" size="sm" className="min-h-11" disabled={busy || invalid}>
        {t('account.save')}
      </Button>
      <Button type="button" size="sm" variant="ghost" className="min-h-11" onClick={onCancel}>
        {t('account.cancel')}
      </Button>
      {axisOriginKey(axis) === 'account.sourceManual' ? (
        <Button type="button" size="sm" variant="ghost" className="min-h-11" disabled={busy} onClick={onRevert}>
          {t('account.revert')}
        </Button>
      ) : null}
    </form>
  )
}
