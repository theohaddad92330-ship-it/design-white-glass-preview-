import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import { ANALYSIS_BATCH_ITEM_STATES, type AnalysisBatch, type AnalysisBatchItem } from '@bellum/contracts'
import { ArrowLeft } from 'lucide-react'
import { Badge, Box, Button, Card, Text } from '@bellum/ui'
import { formatDateTime } from '@/lib/locale'
import { ResponsiveTable } from '@/components/primitives/ResponsiveTable'
import { useAnalysisBatch, useAnalysisBatchMutations } from '../api'
import { batchItemTone, batchStatusTone } from '../lib/batch-tones'

const KNOWN_FAILURES = ['insufficient_credits', 'invalid_name', 'launch_error']

/**
 * #2293.5 / .6 / .7 — UN LOT : son statut agrégé, ses sous-jobs et leurs huit
 * états, lus sur LEUR analyse. Une entreprise en échec ne bloque pas les
 * autres ; un nom ambigu se confirme ici, entité par entité ; « Annuler »
 * arrête ce qui tourne (crédit rendu), « Relancer les échecs » reprend les
 * seuls sous-jobs échoués.
 */
export function AnalysisBatchDetail({ batchId }: { batchId: string }) {
  const { t } = useTranslation('discover')
  const batch = useAnalysisBatch(batchId)

  return (
    <Box display="flex" className="mx-auto w-full max-w-6xl flex-col gap-6 px-4">
      <Link
        to="/discover/lots"
        className="inline-flex min-h-11 items-center gap-1 self-start text-sm text-[var(--bellum-text-accent)] underline-offset-2 hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {t('batches.back')}
      </Link>
      {batch.isError && (
        <Text size="sm" className="text-[var(--danger-soft-text)]">
          {t('batches.loadFailed')}
        </Text>
      )}
      {batch.isLoading && (
        <Text size="sm" className="text-[var(--bellum-text-secondary)]">
          {t('batches.loading')}
        </Text>
      )}
      {batch.data && <BatchBody batch={batch.data} />}
    </Box>
  )
}

/** La phrase de tête du lot : ce qui attend l'utilisateur, en mots — jamais un score. */
function batchHeadline(batch: AnalysisBatch, t: (key: string, options?: Record<string, unknown>) => string): string {
  const waiting = batch.canceledAt === null ? batch.counts.to_confirm + batch.counts.needs_resolution : 0
  if (waiting > 0) return t('batches.headline.waiting', { count: waiting })
  if (batch.status === 'running') return t('batches.headline.running')
  if (batch.status === 'finished_with_failures') return t('batches.headline.failures', { count: batch.counts.failed })
  if (batch.status === 'canceled') return t('batches.headline.canceled')
  return t('batches.headline.finished')
}

function BatchBody({ batch }: { batch: AnalysisBatch }) {
  const { t } = useTranslation('discover')
  const { cancel, retry, confirm, exclude } = useAnalysisBatchMutations()
  const [confirmingCancel, setConfirmingCancel] = useState(false)
  const cancellable = batch.status === 'running' || batch.status === 'needs_confirmation'
  const retryable = batch.canceledAt === null && batch.counts.failed > 0
  const canceled = batch.canceledAt !== null

  return (
    <>
      {/* Refonte Théo (PR12) — l'en-tête du lot : la question qu'il pose, puis son
          origine, sa taille et son statut sur une ligne discrète. */}
      <section aria-labelledby="batch-headline" className="flex flex-col gap-3">
        <Box display="flex" className="flex-wrap items-start justify-between gap-4">
          <Box display="flex" className="min-w-0 flex-col gap-2">
            <Text element="h2" id="batch-headline" size="2xl" weight="semibold" className="tracking-tight">
              {batchHeadline(batch, t)}
            </Text>
            <Box display="flex" className="flex-wrap items-center gap-x-2 gap-y-1">
              <Text size="sm" className="text-[var(--bellum-text-secondary)]">
                {t('batches.detailMeta', {
                  source: t(`batches.source.${batch.source}`),
                  companies: t('batches.recentCompanies', { count: batch.total }),
                  date: formatDateTime(batch.createdAt),
                })}
              </Text>
              <Badge variant={batchStatusTone(batch.status)}>{t(`batches.status.${batch.status}`)}</Badge>
            </Box>
          </Box>
          {retryable && (
            <Button
              variant="outline"
              className="min-h-11"
              disabled={retry.isPending}
              onClick={() => retry.mutate(batch.id)}
            >
              {t('batches.retry')}
            </Button>
          )}
        </Box>
        {/* On n'affiche pas ce qu'on n'a pas : un état à zéro ne fait aucune pastille. */}
        <Box display="flex" className="flex-wrap items-center gap-2">
          {ANALYSIS_BATCH_ITEM_STATES.filter(state => batch.counts[state] > 0).map(state => (
            <Badge key={state} variant={batchItemTone(state)}>
              {`${batch.counts[state]} ${t(`batches.state.${state}`).toLowerCase()}`}
            </Badge>
          ))}
          {batch.charged > 0 && (
            <Text size="xs" className="text-[var(--bellum-text-secondary)]">
              {t('batches.charged', { count: batch.charged })}
            </Text>
          )}
        </Box>
      </section>

      {/* Le tableau COMMUN : une ligne par entreprise, numérotée, son état en
          pastille teintée et ce qu'il reste à faire écrit en clair. */}
      <Card className="p-2 sm:p-3">
        <ResponsiveTable
          rows={batch.items}
          rowKey={item => item.id}
          scrollLabel={t('batches.itemsTitle')}
          columns={[
            {
              key: 'position',
              header: '#',
              mobile: 'hidden',
              className: 'w-px text-right tabular-nums',
              render: item => (
                <Text size="xs" className="tabular-nums text-[var(--bellum-text-muted)]">
                  {item.position + 1}
                </Text>
              ),
            },
            {
              key: 'name',
              header: t('batches.companyColumn'),
              mobile: 'title',
              render: item => (
                <Text size="sm" weight="medium">
                  {item.name}
                </Text>
              ),
            },
            {
              key: 'state',
              header: t('batches.stateColumn'),
              render: item => <BatchItemState item={item} />,
            },
            {
              key: 'todo',
              header: t('batches.todoColumn'),
              mobile: 'field',
              render: item => (
                <BatchItemTodo
                  item={item}
                  canceled={canceled}
                  confirmPending={confirm.isPending}
                  onConfirm={siren => confirm.mutate({ batchId: batch.id, itemId: item.id, siren })}
                />
              ),
            },
            {
              key: 'actions',
              header: t('batches.actionColumn'),
              mobile: 'meta',
              className: 'w-px whitespace-nowrap',
              render: item => (
                <BatchItemActions
                  item={item}
                  canceled={canceled}
                  excludePending={exclude.isPending}
                  onExclude={() => exclude.mutate({ batchId: batch.id, itemId: item.id })}
                />
              ),
            },
          ]}
        />
      </Card>

      {cancellable && (
        <Box display="flex" className="flex-col gap-2">
          {!confirmingCancel ? (
            <Box display="flex" className="flex-wrap items-center gap-x-3 gap-y-1">
              <Button variant="ghost" className="min-h-11" onClick={() => setConfirmingCancel(true)}>
                {t('batches.cancel')}
              </Button>
              <Text size="xs" className="text-[var(--bellum-text-muted)]">
                {t('batches.cancelHint')}
              </Text>
            </Box>
          ) : (
            <Box
              display="flex"
              className="flex-col gap-2 rounded-card border border-[var(--warning-soft-border)] bg-[var(--warning-soft-bg)] p-4"
            >
              <Text size="sm" className="text-[var(--warning-soft-text)]">
                {t('batches.cancelHint')}
              </Text>
              <Box display="flex" className="flex-wrap gap-2">
                <Button
                  variant="destructive"
                  className="min-h-11"
                  disabled={cancel.isPending}
                  onClick={() => cancel.mutate(batch.id, { onSettled: () => setConfirmingCancel(false) })}
                >
                  {t('batches.cancelConfirm')}
                </Button>
                <Button variant="ghost" className="min-h-11" onClick={() => setConfirmingCancel(false)}>
                  {t('batches.keep')}
                </Button>
              </Box>
            </Box>
          )}
        </Box>
      )}
    </>
  )
}

/** États où une décision humaine reste ouverte — les deux seuls que `exclude` accepte (#2283.32). */
const EXCLUDABLE_STATES: readonly AnalysisBatchItem['state'][] = ['to_confirm', 'needs_resolution']

/** « Ce qu'il faut faire » : le geste attendu sur une entreprise, ou rien. */
function BatchItemTodo({
  item,
  canceled,
  confirmPending,
  onConfirm,
}: {
  item: AnalysisBatchItem
  canceled: boolean
  confirmPending: boolean
  onConfirm: (siren: string) => void
}) {
  const { t } = useTranslation('discover')
  if (canceled) return null
  if (item.state === 'to_confirm') {
    return (
      <Box display="flex" className="flex-col gap-1.5 py-1">
        <Text size="xs" className="text-[var(--bellum-text-secondary)]">
          {item.candidates.length > 0 ? t('batches.chooseHint') : t('batches.noCandidate')}
        </Text>
        <Box display="flex" className="flex-wrap gap-2">
          {item.candidates.map(candidate => (
            <ConfirmCandidateButton
              key={candidate.siren}
              candidate={candidate}
              pending={confirmPending}
              onConfirm={onConfirm}
            />
          ))}
        </Box>
      </Box>
    )
  }
  if (item.state === 'needs_resolution') {
    return (
      <Box display="flex" className="flex-col gap-1 py-1">
        <Text size="xs" className="text-[var(--bellum-text-secondary)]">
          {t('batches.resolutionHint')}
        </Text>
        {item.candidates.length > 0 && (
          <Text size="xs" className="text-[var(--bellum-text-secondary)]">
            {item.candidates
              .map(candidate => (candidate.city ? `${candidate.name} (${candidate.city})` : candidate.name))
              .join(' · ')}
          </Text>
        )}
      </Box>
    )
  }
  return null
}

function BatchItemState({ item }: { item: AnalysisBatchItem }) {
  const { t } = useTranslation('discover')
  const failure = item.failureCode
    ? t(`batches.failure.${KNOWN_FAILURES.includes(item.failureCode) ? item.failureCode : 'other'}`)
    : null
  return (
    <Box display="flex" className="flex-col items-start gap-1">
      <Badge variant={batchItemTone(item.state)}>{t(`batches.state.${item.state}`)}</Badge>
      {failure ? (
        <Text size="xs" className="text-[var(--bellum-text-secondary)]">
          {failure}
        </Text>
      ) : null}
    </Box>
  )
}

function BatchItemActions({
  item,
  canceled,
  excludePending,
  onExclude,
}: {
  item: AnalysisBatchItem
  canceled: boolean
  excludePending: boolean
  onExclude: () => void
}) {
  const { t } = useTranslation('discover')
  const excludable = EXCLUDABLE_STATES.includes(item.state) && !canceled
  if (!item.accountId && !excludable) return null
  return (
    <Box display="flex" className="flex-wrap items-center justify-end gap-x-2">
      {item.accountId && (
        <Link
          to="/accounts/$id"
          params={{ id: item.accountId }}
          className="inline-flex min-h-11 items-center text-xs text-[var(--bellum-text-accent)] underline-offset-2 hover:underline"
        >
          {t('batches.openAccount')}
        </Link>
      )}
      {excludable && (
        <Button variant="ghost" className="min-h-11" disabled={excludePending} onClick={onExclude}>
          {t('batches.exclude')}
        </Button>
      )}
    </Box>
  )
}

/**
 * Confirmer une entité LANCE son analyse. #4463 — le bouton ne dit plus ce que
 * le lancement coûte : plus aucun crédit visible côté client.
 */
function ConfirmCandidateButton({
  candidate,
  pending,
  onConfirm,
}: {
  candidate: AnalysisBatchItem['candidates'][number]
  pending: boolean
  onConfirm: (siren: string) => void
}) {
  const { t } = useTranslation('discover')
  const name = t('batches.choose', { name: candidate.city ? `${candidate.name} (${candidate.city})` : candidate.name })
  return (
    <Button variant="outline" className="min-h-11" disabled={pending} onClick={() => onConfirm(candidate.siren)}>
      {name}
    </Button>
  )
}
