import { useState } from 'react'
import { Badge, Box, Button, Card, Input, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import type { MissionEndCheckKey, MissionEndChecklist } from '@bellum/contracts'
import { formatDate } from '@/lib/locale'
import { useMissionEndCheck, useMissionEndChecklist } from '../api'

/** Les statuts AVANT démarrage — la sortie n'a pas de sens tant qu'une mission n'a pas commencé. */
const PRE_START = new Set(['draft', 'onboarding', 'ready_to_start'])

const VERDICT_VARIANT = {
  complete: 'success',
  in_progress: 'warning',
  not_started: 'outline',
} as const

/**
 * #2414 (LAU-FINAL-128) / épopée #2986 — la checklist de sortie d'une mission
 * (client / consultant / interne), sur le dossier. Ce n'est PAS une porte
 * (à la différence de {@link import('./MissionStartReadinessPanel.js')}) :
 * rien n'empêche une mission de finir tant qu'elle est incomplète — elle est
 * NOMMÉE, jamais bloquante.
 */
export function MissionEndChecklistPanel({ missionId, status }: { missionId: string; status: string }) {
  const { t } = useTranslation('missions')
  const visible = !PRE_START.has(status)
  const { data } = useMissionEndChecklist(missionId, visible)
  if (!visible || !data) return null

  return (
    <Card className="p-4" aria-label={t('endChecklist.title')}>
      <Box display="flex" className="flex-wrap items-center gap-2">
        <Text element="h2" size="base" weight="semibold">
          {t('endChecklist.title')}
        </Text>
        <Badge variant={VERDICT_VARIANT[data.verdict]}>{t(`endChecklist.verdict.${data.verdict}`)}</Badge>
      </Box>
      {/* #2953 — les lignes ci-dessous SONT le détail de ce qui manque : aucune phrase ne les relit. */}
      {(['client', 'consultant', 'internal'] as const).map(group => (
        <Box key={group} className="mt-3">
          <Text size="xs" weight="medium" className="text-[var(--bellum-text-muted)]">
            {t(`endChecklist.groups.${group}`)}
          </Text>
          <ul className="mt-1 flex flex-col gap-2">
            {data.items
              .filter(item => item.group === group)
              .map(item => (
                <EndCheckRow key={item.key} missionId={missionId} item={item} />
              ))}
          </ul>
        </Box>
      ))}
    </Card>
  )
}

function EndCheckRow({ missionId, item }: { missionId: string; item: MissionEndChecklist['items'][number] }) {
  const { t } = useTranslation('missions')
  const check = useMissionEndCheck(missionId)
  const [editing, setEditing] = useState(false)
  const [note, setNote] = useState('')
  const key = item.key as MissionEndCheckKey

  return (
    <li data-testid={`end-item-${item.key}`} className="flex flex-col gap-1">
      <Box display="flex" className="flex-wrap items-center gap-2">
        <Text size="sm" weight="medium">
          {t(`endChecklist.items.${item.key}`)}
        </Text>
        <Badge variant={item.state === 'done' ? 'secondary' : 'outline'}>{t(`endChecklist.state.${item.state}`)}</Badge>
        {item.state === 'done' ? (
          <Button
            size="sm"
            variant="ghost"
            className="pointer-coarse:min-h-11"
            disabled={check.isPending}
            onClick={() => check.mutate({ action: 'withdraw', item: key })}
          >
            {t('endChecklist.withdraw')}
          </Button>
        ) : !editing ? (
          <Button size="sm" variant="outline" className="pointer-coarse:min-h-11" onClick={() => setEditing(true)}>
            {t('endChecklist.confirm')}
          </Button>
        ) : null}
      </Box>
      {item.confirmedAt ? (
        <Text size="xs" className="text-[var(--bellum-text-muted)]">
          {t('endChecklist.confirmedOn', { date: formatDate(item.confirmedAt), note: item.note ?? '' })}
        </Text>
      ) : null}
      {editing ? (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={event => {
            event.preventDefault()
            if (note.trim().length < 3) return
            check.mutate({ action: 'confirm', input: { item: key, note: note.trim() } })
            setEditing(false)
            setNote('')
          }}
        >
          <Input
            value={note}
            onChange={event => setNote(event.target.value)}
            placeholder={t('endChecklist.notePlaceholder')}
            aria-label={t('endChecklist.noteLabel')}
            className="min-w-0 flex-1"
          />
          <Button
            type="submit"
            size="sm"
            className="pointer-coarse:min-h-11"
            disabled={note.trim().length < 3 || check.isPending}
          >
            {t('endChecklist.save')}
          </Button>
        </form>
      ) : null}
    </li>
  )
}
