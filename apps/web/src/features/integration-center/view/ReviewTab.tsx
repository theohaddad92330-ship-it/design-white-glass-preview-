import type { CrmReadConflict } from '@bellum/contracts'
import { clientToolName } from '@bellum/contracts'
import { Box, Button, Card, Spinner, Text } from '@bellum/ui'
import { ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { crmImportApi, useCrmReadStatus } from '@/features/crm-import/api'
import { useQueryClient } from '@tanstack/react-query'
import { formatDateTime } from '@/lib/locale'
import { buildReviewGroups, type ReviewGroup } from '../lib/review-groups'

type Choice = 'bellum' | 'crm'

/**
 * Théo D settings-integrations.N3 — l'onglet « À relire » : comparer champ par champ ce qu'un outil annonce avec ce
 * que Bellum a gardé, AVANT qu'un dossier soit mis à jour. Aucun « Tout approuver » : un bloc par fiche, un choix par
 * champ, un bouton par bloc.
 *
 * La source, ce sont les écarts que la synchro propose déjà (`conflictItems`) — rien n'est inventé. « Bellum » retient
 * la valeur gardée sans rien écrire ; l'outil la remplace par un geste explicite, tracé sur la fiche, jamais sur une
 * correction humaine postérieure au passage (le serveur refuse). En salle de démonstration, les gestes sont des
 * aperçus : aucune écriture.
 */
export function ReviewTab() {
  const { t } = useTranslation('integrationCenter', { keyPrefix: 'grid.review' })
  const status = useCrmReadStatus(true)

  if (status.isLoading) {
    return (
      <Box className="flex h-32 items-center justify-center">
        <Spinner />
      </Box>
    )
  }

  // #4590 — un échec de lecture se DIT : « Rien à relire » serait un faux « rien à signaler ».
  if (status.isError) {
    return (
      <Text size="sm" role="alert">
        {t('unavailable')}
      </Text>
    )
  }

  const groups = buildReviewGroups(status.data ?? [])
  return (
    <Box className="flex flex-col gap-4">
      <Text size="sm" className="text-[var(--bellum-text-secondary)]">
        {t('intro')}
      </Text>
      {groups.length === 0 ? (
        <Text size="sm">{t('empty')}</Text>
      ) : (
        groups.map(group => <ReviewGroupCard key={group.key} group={group} />)
      )}
    </Box>
  )
}

function ReviewGroupCard({ group }: { group: ReviewGroup }) {
  const { t } = useTranslation('integrationCenter', { keyPrefix: 'grid.review' })
  const { t: tFields } = useTranslation('settings', { keyPrefix: 'integrations.crmReadScope.conflictFields' })
  const qc = useQueryClient()
  const tool = clientToolName(group.provider) ?? group.provider
  const [choices, setChoices] = useState<Record<string, Choice>>({})
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [preview, setPreview] = useState(false)

  const choiceOf = (field: string): Choice => choices[field] ?? 'bellum'
  const title = group.entityLabel

  const apply = async () => {
    if (group.demo || !group.eventId) {
      setPreview(true)
      return
    }
    setBusy(true)
    try {
      for (const item of group.fields) {
        const input = { eventId: group.eventId, field: item.field }
        if (choiceOf(item.field) === 'crm' && item.crmValue) await crmImportApi.keepCrmValue(input)
        else await crmImportApi.keepBellumValue(input)
      }
      setDone(true)
      toast.success(t('applied'))
      await qc.invalidateQueries({ queryKey: ['crm', 'import'] })
    } catch (error) {
      toast.error(error instanceof Error && error.message ? error.message : t('failed'))
    } finally {
      setBusy(false)
    }
  }

  if (done) return null

  return (
    <Card className="flex flex-col gap-3 p-4" data-testid="review-group">
      <Box>
        <Text size="sm" weight="semibold">
          {title || t('unnamed')}
        </Text>
        <Text size="xs" className="text-[var(--bellum-text-secondary)]">
          {t('received', { tool, date: formatDateTime(group.at) })}
        </Text>
      </Box>
      <ul className="flex flex-col gap-3">
        {group.fields.map(item => (
          <ReviewFieldRow
            key={item.field}
            item={item}
            tool={tool}
            label={tFields(item.field in FIELD_KEYS ? item.field : 'other')}
            choice={choiceOf(item.field)}
            onChoice={value => setChoices(current => ({ ...current, [item.field]: value }))}
          />
        ))}
      </ul>
      <Text size="xs" className="flex items-center gap-1.5 text-[var(--bellum-text-secondary)]">
        <ShieldCheck className="size-3.5 shrink-0" aria-hidden />
        {t('lockNote')}
      </Text>
      {preview && (
        <Text size="xs" className="text-[var(--bellum-text-secondary)]">
          {t('demoPreview')}
        </Text>
      )}
      <Box display="flex" className="flex-wrap gap-2">
        <Button type="button" size="sm" className="min-h-11" disabled={busy} onClick={() => void apply()}>
          {t('apply')}
        </Button>
      </Box>
    </Card>
  )
}

const FIELD_KEYS: Readonly<Record<string, true>> = { email: true, full_name: true, company_name: true }

function ReviewFieldRow({
  item,
  tool,
  label,
  choice,
  onChoice,
}: {
  item: CrmReadConflict
  tool: string
  label: string
  choice: Choice
  onChoice: (value: Choice) => void
}) {
  const { t } = useTranslation('integrationCenter', { keyPrefix: 'grid.review' })
  const name = `review-${item.id ?? item.entityLabel ?? item.entityType}-${item.field}`
  return (
    <li className="grid grid-cols-1 gap-2 md:grid-cols-[10rem_1fr_1fr_auto] md:items-start">
      <Text size="sm" weight="medium">
        {label}
      </Text>
      <Box>
        <Text size="xs" className="text-[var(--bellum-text-secondary)]">
          {t('inBellum')}
        </Text>
        <Text size="sm">{item.bellumValue ?? t('absent')}</Text>
      </Box>
      <Box>
        <Text size="xs" className="text-[var(--bellum-text-secondary)]">
          {t('inTool', { tool })}
        </Text>
        <Text size="sm">{item.crmValue ?? t('absent')}</Text>
      </Box>
      <Box role="radiogroup" aria-label={t('keep', { field: label })} className="flex gap-2">
        <label className="flex min-h-11 cursor-pointer items-center gap-1.5 text-sm">
          <input
            type="radio"
            name={name}
            checked={choice === 'bellum'}
            onChange={() => onChoice('bellum')}
            className="size-4"
          />
          {t('keepBellum')}
        </label>
        {item.crmValue ? (
          <label className="flex min-h-11 cursor-pointer items-center gap-1.5 text-sm">
            <input
              type="radio"
              name={name}
              checked={choice === 'crm'}
              onChange={() => onChoice('crm')}
              className="size-4"
            />
            {tool}
          </label>
        ) : null}
      </Box>
    </li>
  )
}
