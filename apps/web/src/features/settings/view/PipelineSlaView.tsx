import { Box, Button, Input, Text } from '@bellum/ui'
import { SettingsBlock } from '@/features/settings/components/SettingsBlock'
import { DEAL_STAGE_SLA_BOUNDS, DEFAULT_STAGE_LABELS, resolveScreenState, type PipelineStage } from '@bellum/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { ScreenState } from '@/components/primitives/ScreenState'
import { UnknownValue } from '@/components/primitives/UnknownValue'
import { stageSlaApi, type StageSlaRow } from '@/features/settings/lib/stage-sla-api'
import { SettingsViewHeader } from '@/features/settings/components/SettingsViewHeader'

/**
 * LES DURÉES CIBLES D'ÉTAPE — PDF 3 §3.5, ticket `BEL-CRM-203` PR5.
 *
 * « Chaque étape porte une durée cible, réglable par espace. »
 * « Le SLA n'est pas une contrainte, c'est un révélateur. Il dit où le pipe
 * coince, pas qui est en retard. » — cette phrase est le sous-titre de l'écran,
 * et ce n'est pas de la décoration : un seuil qu'on lit comme un reproche se
 * fait desserrer jusqu'à ne plus rien signaler.
 *
 * Ce que l'écran rend possible, et qui n'existait nulle part : un espace VOIT
 * les quatre défauts du produit, sait lesquels il a changés, et peut revenir en
 * arrière sans ouvrir la base.
 */
export function PipelineSlaView() {
  const { t, i18n } = useTranslation('pipelineSla')
  const queryClient = useQueryClient()
  const [drafts, setDrafts] = useState<Partial<Record<PipelineStage, string>>>({})

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['pipeline-stage-sla'],
    queryFn: () => stageSlaApi.list(),
    staleTime: 60_000,
  })

  const save = useMutation({
    mutationFn: ({ stage, slaDays }: { stage: PipelineStage; slaDays: number | null }) =>
      stageSlaApi.set(stage, slaDays),
    onSuccess: result => {
      queryClient.setQueryData(['pipeline-stage-sla'], result)
      toast.success(t('saved'))
    },
    onError: () => toast.error(t('saveFailed')),
  })

  const screenState = resolveScreenState({
    isLoading,
    failed: isError,
    canRead: true,
    needsIntegration: false,
    integrationConnected: true,
    awaitingApproval: false,
    // Le pipe a toujours ses cinq étapes : cet écran ne peut pas être vide.
    everHadRows: true,
    visibleRows: (data?.items ?? []).length,
    isNarrowed: false,
    missingParts: [],
    computedAt: null,
    freshForDays: null,
    now: new Date(),
  })

  /** Les étapes RÉGLABLES : celles qui ont une durée cible. `won` n'en a pas. */
  const tunable = (data?.items ?? []).filter(row => row.slaDays !== null)
  const language = i18n.language === 'en' ? 'en' : 'fr'
  // #2170.43 — lecture pour tous, réglage par le propriétaire ou l'administrateur (arbitrage
  // Louis 31/10). Lu sur la réponse de l'API, jamais recalculé ici (GA-26).
  const readOnly = data?.canEdit === false

  return (
    <Box className="w-full">
      <SettingsViewHeader scope="space" title={t('title')} subtitle={t('subtitle')} />

      {screenState === 'loading' && <ScreenState state="loading" message={t('loadingMessage')} />}
      {screenState === 'error' && (
        <ScreenState
          state="error"
          message={t('errorMessage')}
          action={{ label: t('retry'), onClick: () => void refetch() }}
        />
      )}

      {data ? (
        <Text element="p" size="sm" color="text-[var(--bellum-text-secondary)]" className="mb-3">
          {t('staleNote')}
        </Text>
      ) : null}
      {readOnly ? (
        <Text element="p" size="sm" color="text-[var(--bellum-text-muted)]" className="mb-3">
          {t('readOnlyNote')}
        </Text>
      ) : null}

      {data ? (
        <SettingsBlock label={t('groupLabel')}>
          {tunable.map(row => (
            <StageRow
              key={row.stage}
              row={row}
              label={DEFAULT_STAGE_LABELS[row.stage][language]}
              draft={drafts[row.stage]}
              busy={save.isPending}
              readOnly={readOnly}
              onDraft={value => setDrafts(current => ({ ...current, [row.stage]: value }))}
              onSave={value => save.mutate({ stage: row.stage, slaDays: value })}
            />
          ))}
        </SettingsBlock>
      ) : null}

      {data ? (
        <Text element="p" size="xs" color="text-[var(--bellum-text-muted)]" className="mt-4">
          {t('wonNote')}
        </Text>
      ) : null}
    </Box>
  )
}

function StageRow({
  row,
  label,
  draft,
  busy,
  readOnly,
  onDraft,
  onSave,
}: {
  row: StageSlaRow
  label: string
  draft: string | undefined
  busy: boolean
  readOnly: boolean
  onDraft: (value: string) => void
  onSave: (value: number | null) => void
}) {
  const { t } = useTranslation('pipelineSla')
  const current = draft ?? String(row.slaDays ?? '')
  const parsed = Number.parseInt(current, 10)
  const valid = Number.isFinite(parsed) && parsed >= DEAL_STAGE_SLA_BOUNDS.min && parsed <= DEAL_STAGE_SLA_BOUNDS.max

  return (
    <Box
      display="flex"
      className="flex-col gap-2 border-b border-[var(--bellum-border)] px-4 py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between"
    >
      <Box className="min-w-0">
        <Text size="sm" weight="medium" color="text-[var(--bellum-text-primary)]">
          {label}
        </Text>
        {/* Une durée cible ABSENTE ne s'écrit pas « 0 jour » — c'est le piège
            exact que ce chantier ferme. */}
        {row.slaDays === null ? (
          <UnknownValue reason={t('noTarget')} />
        ) : (
          <Text size="xs" color="text-[var(--bellum-text-muted)]">
            {row.isDefault ? t('isDefault', { count: row.slaDays }) : t('isCustom', { count: row.slaDays })}
          </Text>
        )}
      </Box>
      <Box display="flex" className="shrink-0 items-center gap-2">
        <Input
          type="number"
          inputMode="numeric"
          min={DEAL_STAGE_SLA_BOUNDS.min}
          max={DEAL_STAGE_SLA_BOUNDS.max}
          value={current}
          aria-label={t('daysFor', { stage: label })}
          className="w-24"
          disabled={readOnly}
          onChange={event => onDraft(event.target.value)}
        />
        <Button type="button" size="sm" disabled={readOnly || !valid || busy} onClick={() => onSave(parsed)}>
          {t('save')}
        </Button>
        {/* Revenir au défaut sans passer par la base — le même geste qu'un
            libellé d'étape vidé. */}
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={readOnly || row.isDefault || busy}
          className="pointer-coarse:min-h-11"
          onClick={() => onSave(null)}
        >
          {t('reset')}
        </Button>
      </Box>
    </Box>
  )
}
