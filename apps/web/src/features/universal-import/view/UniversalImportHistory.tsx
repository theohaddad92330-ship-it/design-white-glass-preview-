import { Badge, Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Text } from '@bellum/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { formatDateTime } from '@/lib/locale'
import type { UniversalImportReasonCount } from '@bellum/contracts'
import type { ContextPackHistoryItem } from '@bellum/contracts'
import {
  fetchContextPackHistory,
  fetchUniversalImportHistory,
  resumeUniversalImport,
  type UniversalImportHistoryItem,
} from '../api'
import { ContextPackOriginalLine } from './ContextPackOriginalPreview'
import { hasFamilyReport, ImportFamilyReport } from './ImportFamilyReport'
import { ValidateCompaniesButton } from './ValidateCompaniesButton'

/**
 * #4051.10 — L'HISTORIQUE des imports de fichier : quand, quel fichier, combien, et où ça en est. Chaque ligne qui
 * porte un bilan par famille le déplie (#4051.2, le même composant que la fin d'un import). Un volume absent ne
 * s'écrit pas « 0 ».
 *
 * Théo B C3 — le MÊME tableau que les autres listes, avec ses trois états distincts : des imports, AUCUN import (« Ton
 * prochain import apparaîtra ici »), et « Bellum n'a pas pu récupérer tes imports précédents » — qui n'est JAMAIS
 * « aucun import » (C3.R7). Un import interrompu se reprend d'un clic (C3.A4).
 */
export function UniversalImportHistory() {
  const { t } = useTranslation('importWizard')
  const { data, isError, isLoading } = useQuery({
    queryKey: ['universal-import', 'history'],
    queryFn: fetchUniversalImportHistory,
    staleTime: 30_000,
  })
  // #4422.1 — les imports de l'assistant (postes, grille, séquences, connaissances) y figurent aussi.
  const { data: assistant, isError: assistantError } = useQuery({
    queryKey: ['universal-import', 'history', 'assistant'],
    queryFn: fetchContextPackHistory,
    staleTime: 30_000,
  })
  const queryClient = useQueryClient()
  if (isLoading) return null
  const failed = isError || assistantError
  const entries = [
    ...(data ?? []).map(item => ({ at: item.createdAt, node: <HistoryRow key={item.id} item={item} /> })),
    ...(assistant ?? []).map(item => ({ at: item.createdAt, node: <AssistantRow key={item.id} item={item} /> })),
  ].sort((a, b) => b.at.localeCompare(a.at))
  const running = (data ?? []).filter(item => item.status === 'queued' || item.status === 'processing').length
  return (
    <section data-testid="universal-import-history" className="mb-6 space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Text element="h2" size="lg" weight="semibold" className="text-[var(--bellum-text-primary)]">
          {t('universal.history.title')}
        </Text>
        {entries.length > 0 ? (
          <Text size="sm" className="text-[var(--text-muted)]" data-testid="universal-import-history-count">
            {t('universal.history.count', { count: entries.length })}
            {running > 0 ? ` · ${t('universal.history.running', { count: running })}` : ''}
          </Text>
        ) : null}
      </div>
      {failed && entries.length === 0 ? (
        <div role="alert" data-testid="universal-import-history-error" className={EMPTY_BOX}>
          <Text size="sm" weight="semibold" className="text-[var(--text-primary)]">
            {t('universal.history.unavailable.title')}
          </Text>
          <Text size="sm" className="text-[var(--text-muted)]">
            {t('universal.history.unavailable.body')}
          </Text>
          <Button
            variant="secondary"
            size="sm"
            className="mt-2 pointer-coarse:min-h-11"
            onClick={() => void queryClient.invalidateQueries({ queryKey: ['universal-import', 'history'] })}
          >
            {t('universal.history.unavailable.retry')}
          </Button>
        </div>
      ) : entries.length === 0 ? (
        <div data-testid="universal-import-history-empty" className={EMPTY_BOX}>
          <Text size="sm" weight="semibold" className="text-[var(--text-primary)]">
            {t('universal.history.empty.title')}
          </Text>
          <Text size="sm" className="text-[var(--text-muted)]">
            {t('universal.history.empty.body')}
          </Text>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-card border border-[var(--bellum-border)] bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('universal.history.columns.import')}</TableHead>
                <TableHead>{t('universal.history.columns.date')}</TableHead>
                <TableHead>{t('universal.history.columns.result')}</TableHead>
                <TableHead>{t('universal.history.columns.status')}</TableHead>
                <TableHead>
                  <span className="sr-only">{t('universal.history.columns.actions')}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>{entries.map(entry => entry.node)}</TableBody>
          </Table>
        </div>
      )}
    </section>
  )
}

const EMPTY_BOX = 'space-y-1 rounded-card border border-[var(--bellum-border)] bg-card p-8 text-center'

const STATUS_TONE = {
  done: 'success',
  processing: 'primary',
  queued: 'primary',
  uploading: 'primary',
  failed: 'warning',
  interrupted: 'warning',
} as const

function HistoryRow({ item }: { item: UniversalImportHistoryItem }) {
  const { t } = useTranslation('importWizard')
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const when = formatDateTime(item.createdAt)
  const status = item.interrupted ? 'interrupted' : item.status
  const live = status === 'queued' || status === 'processing'
  const volumes = [
    item.imported > 0 ? t('universal.history.imported', { count: item.imported }) : null,
    item.duplicates > 0 ? t('universal.history.duplicates', { count: item.duplicates }) : null,
    item.rejected > 0 ? t('universal.history.rejected', { count: item.rejected }) : null,
  ].filter(Boolean)
  const reasons = item.reasons ?? []
  const hasDetail = hasFamilyReport(item.breakdown) || reasons.length > 0
  const resume = useMutation({
    mutationFn: () => resumeUniversalImport(item.id),
    onSuccess: () => {
      toast.success(t('universal.history.resumed'))
      void queryClient.invalidateQueries({ queryKey: ['universal-import', 'history'] })
    },
    onError: () => toast.error(t('universal.errors.generic')),
  })
  return (
    <>
      <TableRow data-testid="universal-import-history-row">
        <TableCell>
          <Text size="sm" weight="medium" className="break-all text-[var(--text-primary)]">
            {item.filename}
          </Text>
          {/* #4573 (#4426) — la NATURE de la ligne : un import de fichier (comptes, contacts…), jamais confondu avec un pack. */}
          <Text size="xs" className="text-[var(--text-muted)]">
            {t('universal.history.kind.file', { type: t(`universal.types.${item.type}`) })}
          </Text>
          {item.totalRows ? (
            <Text size="xs" className="text-[var(--text-muted)]">
              {t('universal.history.rows', { count: item.totalRows })}
            </Text>
          ) : null}
        </TableCell>
        <TableCell>
          {when ? (
            <Text size="sm" className="text-[var(--text-secondary)]">
              <time dateTime={item.createdAt}>{when}</time>
            </Text>
          ) : null}
        </TableCell>
        <TableCell>
          {live ? (
            <>
              {/* Théo C4.A5 — la ligne « En cours » porte la barre d'avancement : un import long se voit avancer. */}
              {item.totalRows ? (
                <div
                  role="progressbar"
                  aria-label={t('universal.history.progress')}
                  aria-valuemin={0}
                  aria-valuemax={item.totalRows}
                  aria-valuenow={item.processedRows}
                  className="mb-1.5 h-1.5 w-40 max-w-full overflow-hidden rounded-full bg-[var(--bellum-surface-2)]"
                >
                  <div
                    className="h-full rounded-full bg-[var(--bellum-primary)]"
                    style={{ width: `${Math.min(100, Math.round((item.processedRows / item.totalRows) * 100))}%` }}
                  />
                </div>
              ) : null}
              <Text size="sm" className="text-[var(--text-secondary)]">
                {item.totalRows
                  ? t('universal.history.readOf', { done: item.processedRows, total: item.totalRows })
                  : t('universal.history.read', { count: item.processedRows })}
              </Text>
            </>
          ) : volumes.length > 0 ? (
            <Text size="sm" className="text-[var(--text-secondary)]">
              {volumes.join(' · ')}
            </Text>
          ) : null}
        </TableCell>
        <TableCell>
          <Badge variant={STATUS_TONE[status]}>{t(`universal.history.status.${status}`)}</Badge>
          {live ? (
            <Text size="xs" className="mt-1 block text-[var(--text-muted)]">
              {t('universal.canClose')}
            </Text>
          ) : status === 'failed' && item.processedRows > 0 ? (
            <Text size="xs" className="mt-1 block text-[var(--text-muted)]">
              {t('universal.history.stoppedAt', { line: item.processedRows + 1 })}
            </Text>
          ) : null}
        </TableCell>
        <TableCell>
          <div className="flex flex-wrap justify-end gap-1">
            {/* MEYER-IMPORT M.2 — l'entrée s'OUVRE toujours quand il y a quelque chose à dire : le bilan par famille,
                et les écartés comptés PAR RAISON ; un import d'avant le bilan le dit, il ne reste pas muet. */}
            {hasDetail ? (
              <Button
                variant="ghost"
                size="sm"
                aria-expanded={open}
                className="pointer-coarse:min-h-11"
                onClick={() => setOpen(value => !value)}
              >
                {t('universal.history.detail')}
              </Button>
            ) : null}
            {status === 'failed' ? (
              <Button
                variant="secondary"
                size="sm"
                disabled={resume.isPending}
                className="pointer-coarse:min-h-11"
                onClick={() => resume.mutate()}
              >
                {t('universal.report.resume')}
              </Button>
            ) : null}
          </div>
        </TableCell>
      </TableRow>
      {open && hasDetail ? (
        <TableRow data-testid="universal-import-history-detail">
          <TableCell colSpan={5}>
            <div className="space-y-3">
              {hasFamilyReport(item.breakdown) ? (
                <ImportFamilyReport breakdown={item.breakdown} queryableByLaura={item.queryableByLaura} />
              ) : (
                <Text size="sm" className="text-[var(--text-muted)]">
                  {t('universal.history.noBreakdown')}
                </Text>
              )}
              <ReasonList kind="rejected" reasons={reasons} />
              <ReasonList kind="to_reconcile" reasons={reasons} />
              {/* #AM.9 — les sociétés proposées se valident d'un clic, sans refaire l'import. */}
              {item.scope !== 'personal' &&
              reasons.some(r => r.kind === 'to_reconcile' && r.reason === 'company_to_validate' && r.count > 0) ? (
                <ValidateCompaniesButton jobId={item.id} />
              ) : null}
            </div>
          </TableCell>
        </TableRow>
      ) : null}
    </>
  )
}

/** #4422.1 — une ligne de l'historique pour un import de l'assistant : fichier, destination, bilan tel que rendu. */
function AssistantRow({ item }: { item: ContextPackHistoryItem }) {
  const { t } = useTranslation('importWizard')
  const when = formatDateTime(item.createdAt)
  const volumes = [
    item.imported !== null && item.imported > 0
      ? t(`universal.history.assistant.taken.${item.destination}`, { count: item.imported })
      : null,
    item.scripts ? t('contextPack.scripts', { count: item.scripts }) : null,
    item.skipped > 0 ? t('universal.history.rejected', { count: item.skipped }) : null,
  ].filter(Boolean)
  return (
    <TableRow data-testid="universal-import-history-row">
      <TableCell>
        <Text size="sm" weight="medium" className="break-all text-[var(--text-primary)]">
          {item.fileName}
        </Text>
        {/* #4573 (#4426) — un import de PACK se reconnaît : sa nature, puis sa destination. */}
        <Text size="xs" className="text-[var(--text-muted)]">
          {item.destination === 'cv'
            ? t('universal.history.assistant.cv.destination')
            : `${t('universal.history.kind.pack')} · ${t(`contextPack.destination.${item.destination}`)}`}
        </Text>
      </TableCell>
      <TableCell>
        {when ? (
          <Text size="sm" className="text-[var(--text-secondary)]">
            <time dateTime={item.createdAt}>{when}</time>
          </Text>
        ) : null}
      </TableCell>
      <TableCell>
        {volumes.length > 0 ? (
          <Text size="sm" className="text-[var(--text-secondary)]">
            {volumes.join(' · ')}
          </Text>
        ) : null}
        {item.message ? (
          <Text size="xs" className="text-[var(--danger-soft-text)]">
            {item.message}
          </Text>
        ) : null}
        {/* #4573 — l'original : un aperçu quand il est gardé ; sinon l'absence se NOMME (un import antérieur le dit). */}
        <ContextPackOriginalLine item={item} />
        {/* #AM.11 — chaque lot (CV, documents…) porte son bilan par famille, le même composant que les comptes. */}
        {hasFamilyReport(item.breakdown) ? (
          <details data-testid="universal-import-history-detail">
            <summary className="cursor-pointer text-xs text-[var(--text-muted)] pointer-coarse:min-h-11">
              {t('universal.history.detail')}
            </summary>
            <div className="mt-2">
              <ImportFamilyReport breakdown={item.breakdown ?? {}} queryableByLaura={null} />
            </div>
          </details>
        ) : null}
      </TableCell>
      <TableCell>
        <Badge variant={item.status === 'done' ? 'success' : 'warning'}>
          {t(`universal.history.assistant.status.${item.status}`)}
        </Badge>
      </TableCell>
      <TableCell />
    </TableRow>
  )
}

/** M.2 — « 1025 lignes écartées » ne se lit jamais sans sa raison : une ligne par raison, avec son nombre. */
export function ReasonList({
  kind,
  reasons,
}: {
  kind: 'rejected' | 'to_reconcile'
  reasons: UniversalImportReasonCount[]
}) {
  const { t } = useTranslation('importWizard')
  const own = reasons.filter(reason => reason.kind === kind && reason.count > 0)
  if (own.length === 0) return null
  return (
    <div className="space-y-1">
      <Text size="sm" weight="medium" className="text-[var(--text-primary)]">
        {t(kind === 'rejected' ? 'universal.history.reasonsRejected' : 'universal.history.reasonsToReconcile')}
      </Text>
      <ul className="space-y-1">
        {own.map(reason => (
          <li key={reason.reason}>
            <Text size="sm">
              {t(`universal.history.reasons.${kind}.${reason.reason}`, {
                count: reason.count,
                defaultValue: `${reason.count} · ${reason.reason}`,
              })}
            </Text>
          </li>
        ))}
      </ul>
    </div>
  )
}
