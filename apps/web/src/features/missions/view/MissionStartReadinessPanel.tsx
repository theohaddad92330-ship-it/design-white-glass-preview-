import { useState, type ReactNode } from 'react'
import { Badge, Box, Button, Card, Input, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import type { MissionStartDeclaredKey, MissionStartReadiness } from '@bellum/contracts'
import { formatDate } from '@/lib/locale'
import { useMissionStartCheck, useMissionStartReadiness } from '../api'

/** Les statuts AVANT démarrage — le seul moment où la checklist a un sens. */
const PRE_START = new Set(['draft', 'onboarding', 'ready_to_start'])

export function isPreStartStatus(status: string): boolean {
  return PRE_START.has(status)
}

const VERDICT_VARIANT = {
  ready: 'success',
  ready_with_reserves: 'warning',
  blocked: 'destructive',
  incomplete: 'warning',
} as const

/**
 * #2338 (DOUBLE ACCORD) + #2409 (CHECKLIST J1) — sur le dossier d'une mission
 * pas encore démarrée : les deux accords, le contrat, le consultant, la date,
 * le TJM et l'accès du premier jour, chacun avec son état propre, et le
 * verdict à quatre issues. Ce qui manque est NOMMÉ ; c'est ce que l'API
 * opposera au passage « prête à démarrer » (409), dit ici AVANT le clic.
 *
 * Un prérequis DÉCLARÉ se confirme avec sa preuve (#2409.7) et se retire —
 * archivé côté serveur, jamais supprimé. Un prérequis DÉRIVÉ se répare sur la
 * mission elle-même : il n'a pas de case à cocher.
 */
export function MissionStartReadinessPanel({
  missionId,
  status,
  adminSlot,
}: {
  missionId: string
  status: string
  /** Théo C missions-dossier — les manques administratifs (ex-ADV) fondus dans la MÊME liste. */
  adminSlot?: ReactNode
}) {
  const { t } = useTranslation('missions')
  const visible = PRE_START.has(status)
  const { data } = useMissionStartReadiness(missionId, visible)
  if (!visible || !data) return null

  return (
    <Card className="p-4" aria-label={t('startReadiness.title')}>
      <Box display="flex" className="flex-wrap items-center gap-2">
        <Text element="h2" size="base" weight="semibold">
          {t('startReadiness.title')}
        </Text>
        <Badge variant={VERDICT_VARIANT[data.verdict]}>{t(`startReadiness.verdict.${data.verdict}`)}</Badge>
        {data.agreementsPending ? <Badge variant="warning">{t('startReadiness.agreementsPending')}</Badge> : null}
      </Box>
      <ul className="mt-3 flex flex-col gap-2">
        {data.items.map(item => (
          <StartItemRow key={item.key} missionId={missionId} item={item} />
        ))}
      </ul>
      {adminSlot}
    </Card>
  )
}

function StartItemRow({ missionId, item }: { missionId: string; item: MissionStartReadiness['items'][number] }) {
  const { t } = useTranslation('missions')
  const check = useMissionStartCheck(missionId)
  const [editing, setEditing] = useState(false)
  const [proof, setProof] = useState('')
  const declared = item.kind === 'declared'
  const key = item.key as MissionStartDeclaredKey

  return (
    <li data-testid={`start-item-${item.key}`} className="flex flex-col gap-1">
      <Box display="flex" className="flex-wrap items-center gap-2">
        <Text size="sm" weight="medium">
          {t(`startReadiness.items.${item.key}`)}
        </Text>
        <Badge variant={item.state === 'done' ? 'secondary' : 'outline'}>
          {t(`startReadiness.state.${item.state}`)}
        </Badge>
        {!item.blocking ? <Text size="xs">{t('startReadiness.reserve')}</Text> : null}
        {declared && item.state === 'done' ? (
          <Button
            size="sm"
            variant="ghost"
            className="pointer-coarse:min-h-11"
            disabled={check.isPending}
            onClick={() => check.mutate({ action: 'withdraw', item: key })}
          >
            {t('startReadiness.withdraw')}
          </Button>
        ) : null}
        {declared && item.state !== 'done' && !editing ? (
          <Button size="sm" variant="outline" className="pointer-coarse:min-h-11" onClick={() => setEditing(true)}>
            {t('startReadiness.confirm')}
          </Button>
        ) : null}
      </Box>
      {item.confirmedAt ? (
        <Text size="xs" className="text-[var(--bellum-text-muted)]">
          {t('startReadiness.confirmedOn', { date: formatDate(item.confirmedAt), proof: item.proof ?? '' })}
        </Text>
      ) : null}
      {editing ? (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={event => {
            event.preventDefault()
            if (proof.trim().length < 3) return
            check.mutate({ action: 'confirm', input: { item: key, proof: proof.trim() } })
            setEditing(false)
            setProof('')
          }}
        >
          <Input
            value={proof}
            onChange={event => setProof(event.target.value)}
            placeholder={t('startReadiness.proofPlaceholder')}
            aria-label={t('startReadiness.proofLabel')}
            className="min-w-0 flex-1"
          />
          <Button
            type="submit"
            size="sm"
            className="pointer-coarse:min-h-11"
            disabled={proof.trim().length < 3 || check.isPending}
          >
            {t('startReadiness.save')}
          </Button>
        </form>
      ) : null}
    </li>
  )
}
