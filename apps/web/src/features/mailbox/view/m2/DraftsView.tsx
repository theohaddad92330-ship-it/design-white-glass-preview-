import {
  Badge,
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EntityAvatar,
  FilterChips,
  Text,
} from '@bellum/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { outreachKeys, outreachMessagesApi } from '@/features/outreach/api'
import { useDraftReviewActions, useMyMessageDrafts } from '../../api'
import {
  draftOriginCounts,
  filterDraftsByOrigin,
  mergeDraftRows,
  type DraftOriginFilter,
  type DraftRow,
} from '../../lib/mailbox-views'
import { MailListPanel, MailWorkspace } from '../shared/MailWorkspace'
import { DraftDetail } from './DraftDetail'
import { MailboxEmptyView } from './MailboxEmptyView'

const ORIGINS: DraftOriginFilter[] = ['all', 'contact', 'reply', 'sequence']

/**
 * Théo B m2-brouillons.N1 — « Messages à relire » : les brouillons personnels de toutes les origines (fiche contact,
 * réponse, séquence) dans l'espace de travail de la page — la liste à gauche, le brouillon ouvert à droite. Les mêmes
 * brouillons que sur la fiche du contact — et que le centre d'approbation des séquences (M2.A2), qui est ce même onglet
 * filtré « Séquence ». `sequenceId` restreint la liste aux messages d'UNE séquence (M2.N5, M2.R7).
 * « Sélectionner » ouvre la relecture groupée : les destinataires refusés sont écartés d'office, rien ne part.
 */
export function DraftsView({
  timeZone,
  sequenceId,
  matches = () => true,
  onNewMessage,
}: {
  timeZone: string
  sequenceId?: string
  /** La recherche et le filtre de comptes de la barre d'outils, appliqués à la liste. */
  matches?: (row: DraftRow) => boolean
  onNewMessage?: () => void
}) {
  const { t, i18n } = useTranslation('mailbox')
  const drafts = useMyMessageDrafts()
  const sequences = useQuery({
    queryKey: outreachKeys.messages(),
    queryFn: () => outreachMessagesApi.list(),
    staleTime: 30_000,
  })
  const [origin, setOrigin] = useState<DraftOriginFilter>(sequenceId ? 'sequence' : 'all')
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [reading, setReading] = useState(false)
  const [selecting, setSelecting] = useState(false)
  const [picked, setPicked] = useState<string[]>([])
  const [bulkOpen, setBulkOpen] = useState(false)

  const rows = useMemo(
    () => mergeDraftRows(drafts.data?.items ?? [], sequences.data ?? []),
    [drafts.data, sequences.data],
  )
  const scoped = (sequenceId ? filterDraftsByOrigin(rows, 'sequence', sequenceId) : rows).filter(matches)
  const counts = draftOriginCounts(scoped)
  const visible = filterDraftsByOrigin(scoped, origin)
  const opened = visible.find(row => row.key === openKey) ?? visible[0] ?? null
  const loading = drafts.isLoading || sequences.isLoading
  const selectedRows = visible.filter(row => picked.includes(row.key))

  if (!loading && scoped.length === 0) {
    return <MailboxEmptyView onNewMessage={onNewMessage} />
  }

  const date = (iso: string) =>
    new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'short', timeZone }).format(new Date(iso))

  return (
    <Box className="flex flex-col gap-4">
      {sequenceId ? (
        <Box className="flex flex-col gap-1">
          <Text element="h2" size="sm" weight="semibold">
            {t('m2.drafts.sequenceTitle')}
          </Text>
          <Text size="sm" className="text-[var(--bellum-text-secondary)]">
            {t('m2.drafts.sequenceSubtitle')}
          </Text>
          <Button asChild size="sm" variant="ghost" className="min-h-11 w-fit">
            <Link to="/mailbox" search={{ vue: 'drafts' }}>
              {t('m2.drafts.backToAll')}
            </Link>
          </Button>
        </Box>
      ) : (
        <FilterChips
          ariaLabel={t('m2.drafts.filtersAria')}
          legend={t('m2.drafts.originLegend')}
          options={ORIGINS.filter(value => counts[value] !== undefined).map(value => ({
            value,
            label: t(`m2.drafts.filters.${value}`),
            count: counts[value],
          }))}
          value={origin}
          onChange={next => next && setOrigin(next)}
        />
      )}

      {visible.length === 0 ? (
        <MailboxEmptyView onClear={() => setOrigin('all')} onNewMessage={onNewMessage} />
      ) : (
        <MailWorkspace
          reading={reading}
          list={
            <MailListPanel
              titleId="mailbox-drafts-title"
              title={t('m2.drafts.title')}
              count={visible.length}
              listLabel={t('m2.drafts.listAria')}
              headerExtra={
                <button
                  type="button"
                  aria-pressed={selecting}
                  onClick={() => {
                    setSelecting(previous => !previous)
                    setPicked([])
                  }}
                  className="inline-flex min-h-11 items-center text-xs font-medium text-[var(--bellum-text-accent)] hover:underline"
                >
                  {t(selecting ? 'm2.bulk.stop' : 'm2.bulk.select')}
                </button>
              }
              foot={
                selecting && selectedRows.length > 0 ? (
                  <Box className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--bellum-border)] px-4 py-3">
                    <Text size="sm">
                      <strong>{t('m2.bulk.count', { count: selectedRows.length })}</strong>
                      {' · '}
                      {selectedRows.map(row => row.contactName ?? t('m2.detail.unknownContact')).join(', ')}
                    </Text>
                    <Button size="sm" className="min-h-11" onClick={() => setBulkOpen(true)}>
                      {t('m2.bulk.review')}
                    </Button>
                  </Box>
                ) : null
              }
            >
              {visible.map(row => (
                <DraftListRow
                  key={row.key}
                  row={row}
                  date={date(row.createdAt)}
                  selected={opened?.key === row.key}
                  selecting={selecting}
                  picked={picked.includes(row.key)}
                  onPick={() =>
                    setPicked(previous =>
                      previous.includes(row.key) ? previous.filter(key => key !== row.key) : [...previous, row.key],
                    )
                  }
                  onOpen={() => {
                    setOpenKey(row.key)
                    setReading(true)
                  }}
                />
              ))}
            </MailListPanel>
          }
          reader={
            opened ? (
              <DraftDetail key={opened.key} row={opened} timeZone={timeZone} onBack={() => setReading(false)} />
            ) : null
          }
        />
      )}

      {bulkOpen ? (
        <BulkValidateDialog
          rows={selectedRows}
          onOpenChange={setBulkOpen}
          onDone={() => {
            setBulkOpen(false)
            setSelecting(false)
            setPicked([])
          }}
        />
      ) : null}
    </Box>
  )
}

function DraftListRow({
  row,
  date,
  selected,
  selecting,
  picked,
  onPick,
  onOpen,
}: {
  row: DraftRow
  date: string
  selected: boolean
  selecting: boolean
  picked: boolean
  onPick: () => void
  onOpen: () => void
}) {
  const { t } = useTranslation('mailbox')
  const name = row.contactName ?? t('m2.detail.unknownContact')
  return (
    <li className="flex items-stretch">
      {selecting ? (
        <label className="flex min-h-11 min-w-11 items-center justify-center pl-3">
          <input
            type="checkbox"
            className="size-5"
            checked={picked}
            onChange={onPick}
            aria-label={t('m2.bulk.pickAria', { name })}
          />
        </label>
      ) : null}
      <button
        type="button"
        onClick={onOpen}
        aria-current={selected ? 'true' : undefined}
        className={`flex min-h-11 min-w-0 flex-1 flex-col gap-1.5 px-4 py-3 text-left transition-colors duration-immediate ease-bellum-out hover:bg-[var(--bellum-surface-2)] ${
          selected ? 'bg-[var(--bellum-accent-bg)]' : ''
        }`}
      >
        <Box className="flex items-center gap-2">
          <EntityAvatar name={name} size="xs" />
          <Text element="span" size="sm" weight="medium" className="min-w-0 flex-1 truncate">
            {name}
          </Text>
          <Text element="span" size="xs" className="shrink-0 text-[var(--bellum-text-secondary)]">
            {date}
          </Text>
        </Box>
        <Text element="span" size="sm" weight="medium" className="line-clamp-2 break-words">
          {row.subject ?? t('scheduled.noSubject')}
        </Text>
        {/* Le texte d'un BROUILLON préparé dans Bellum — pas le corps d'un mail reçu (c96). */}
        <Text element="span" size="sm" className="line-clamp-2 text-[var(--bellum-text-secondary)]">
          {row.body}
        </Text>
        <Box className="flex min-w-0 flex-wrap items-center gap-1.5">
          <Badge variant={row.validated ? 'success' : 'primary'}>
            {t(row.validated ? 'm2.drafts.status.validated' : 'm2.drafts.status.toReview')}
          </Badge>
          {row.origin !== 'contact' ? <Badge variant="info">{t(`m2.drafts.origin.${row.origin}`)}</Badge> : null}
          {row.blockers.length > 0 ? <Badge variant="danger">{t('m2.detail.blockedTitle')}</Badge> : null}
          {row.accountName ? (
            <Text element="span" size="xs" className="truncate text-[var(--bellum-text-secondary)]">
              {row.accountName}
            </Text>
          ) : null}
        </Box>
      </button>
    </li>
  )
}

/**
 * Théo B m2-brouillons.N1 — « Relire et valider N brouillons ». Les destinataires refusés (désabonné, déjà contacté,
 * identité à confirmer) sont ÉCARTÉS d'office et nommés (M2.A3) ; les autres se valident après la case de relecture.
 * Valider n'envoie rien.
 */
function BulkValidateDialog({
  rows,
  onOpenChange,
  onDone,
}: {
  rows: DraftRow[]
  onOpenChange: (open: boolean) => void
  onDone: () => void
}) {
  const { t } = useTranslation('mailbox')
  const queryClient = useQueryClient()
  const { validate } = useDraftReviewActions()
  const [confirmed, setConfirmed] = useState(false)
  const ready = rows.filter(row => row.blockers.length === 0 && !row.validated)
  const skipped = rows.filter(row => row.blockers.length > 0)
  const run = useMutation({
    mutationFn: async () => {
      const sequence = ready.filter(row => row.source === 'outreach')
      await Promise.all([
        ...ready.filter(row => row.source === 'draft').map(row => validate.mutateAsync(row.id)),
        ...(sequence.length > 0
          ? [
              outreachMessagesApi.approve({
                items: sequence.map(row => ({ id: row.id, version: row.outreachVersion ?? 1 })),
              }),
            ]
          : []),
      ])
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['outreach'] })
      onDone()
    },
  })

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('common:actions.close')} className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('m2.bulk.title', { count: ready.length })}</DialogTitle>
          <DialogDescription>{t('m2.detail.validateNote')}</DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col divide-y divide-[var(--bellum-border)]">
          {ready.map(row => (
            <li key={row.key} className="flex items-center gap-3 py-2">
              <EntityAvatar name={row.contactName ?? '?'} size="xs" />
              <Box className="flex min-w-0 flex-1 flex-col">
                <Text size="sm" weight="semibold" className="truncate">
                  {row.contactName ?? t('m2.detail.unknownContact')}
                </Text>
                <Text size="xs" className="truncate text-[var(--bellum-text-secondary)]">
                  {[row.subject, row.contactEmail].filter(Boolean).join(' · ')}
                </Text>
              </Box>
            </li>
          ))}
        </ul>
        {skipped.length > 0 ? (
          <Text
            size="sm"
            role="note"
            className="rounded-control bg-[var(--warning-soft-bg)] p-3 text-[var(--warning-soft-text)]"
          >
            {t('m2.bulk.skipped', {
              names: skipped.map(row => row.contactName ?? t('m2.detail.unknownContact')).join(', '),
            })}
          </Text>
        ) : null}
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-5"
            checked={confirmed}
            onChange={event => setConfirmed(event.target.checked)}
          />
          {t('m2.bulk.confirm', { count: ready.length })}
        </label>
        {run.isError ? (
          <Text size="sm" role="alert" className="text-[var(--danger-soft-text)]">
            {t('m2.bulk.failed')}
          </Text>
        ) : null}
        <DialogFooter className="gap-2">
          <Button variant="outline" className="min-h-11" onClick={() => onOpenChange(false)}>
            {t('draft.cancel')}
          </Button>
          <Button
            className="min-h-11"
            disabled={!confirmed || ready.length === 0 || run.isPending}
            onClick={() => run.mutate()}
          >
            {t('m2.bulk.validate', { count: ready.length })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
