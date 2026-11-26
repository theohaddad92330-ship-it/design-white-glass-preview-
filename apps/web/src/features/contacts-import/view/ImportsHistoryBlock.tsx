import { Button, Text } from '@bellum/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { formatDateTime } from '@/lib/locale'
import {
  fetchContextPackHistory,
  fetchUniversalImportHistory,
  resumeUniversalImport,
  type UniversalImportHistoryItem,
} from '@/features/universal-import/api'
import type { ContextPackHistoryItem } from '@bellum/contracts'
import { ContextPackOriginalLine } from '@/features/universal-import/view/ContextPackOriginalPreview'
import { hasFamilyReport, ImportFamilyReport } from '@/features/universal-import/view/ImportFamilyReport'
import { ReasonList } from '@/features/universal-import/view/UniversalImportHistory'

const HISTORY_KEY = ['universal-import', 'history'] as const
/** Un import en cours se relit tant qu'il avance — le filet sous le temps réel, jamais une ligne figée. */
const LIVE_POLL_MS = 4_000

const isLive = (item: UniversalImportHistoryItem): boolean => item.status === 'queued' || item.status === 'processing'

/**
 * Théo B c3-imports-sources.R4 — « Historique des imports » : fichier, date, résultat, statut, bilan (A4 : un import
 * interrompu se REPREND au dernier paquet validé ; un import en cours dit qu'il continue sans toi). Trois états
 * distincts (R7) : lecture, vide, indisponible — « indisponible » n'est jamais « aucun import ».
 */
export function ImportsHistoryBlock() {
  const { t } = useTranslation('importWizard')
  const history = useQuery({
    queryKey: HISTORY_KEY,
    queryFn: fetchUniversalImportHistory,
    staleTime: 10_000,
    refetchInterval: query => (query.state.data?.some(isLive) ? LIVE_POLL_MS : false),
  })
  // Les imports de l'assistant « Dépose tes documents » (postes, grille, séquences…) figurent aussi à l'historique.
  const assistant = useQuery({
    queryKey: [...HISTORY_KEY, 'assistant'],
    queryFn: fetchContextPackHistory,
    staleTime: 30_000,
  })

  if (history.isPending) {
    return (
      <Section>
        <Text size="sm" className="text-[var(--text-muted)]">
          {t('contactsImport.history.loading')}
        </Text>
      </Section>
    )
  }
  if (history.isError) {
    return (
      <Section>
        <div role="alert" className="space-y-2">
          <Text size="sm" weight="medium" className="text-[var(--text-primary)]">
            {t('contactsImport.history.unavailable')}
          </Text>
          <Text size="sm" className="text-[var(--text-muted)]">
            {t('contactsImport.history.unavailableHint')}
          </Text>
          <Button variant="secondary" size="sm" onClick={() => void history.refetch()}>
            {t('contactsImport.history.retry')}
          </Button>
        </div>
      </Section>
    )
  }

  const items = [...history.data].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const running = items.filter(isLive).length
  const assistantCount = assistant.data?.length ?? 0
  // #4573 (#4426) — les imports du pack étaient COMPTÉS sans être AFFICHÉS : ils figurent désormais dans la liste.
  const entries = [
    ...items.map(item => ({ at: item.createdAt, node: <HistoryEntry key={item.id} item={item} /> })),
    ...(assistant.data ?? []).map(item => ({ at: item.createdAt, node: <PackEntry key={item.id} item={item} /> })),
  ].sort((a, b) => b.at.localeCompare(a.at))
  if (items.length + assistantCount === 0) {
    return (
      <Section>
        <Text size="sm" weight="medium" className="text-[var(--text-primary)]">
          {t('contactsImport.history.empty')}
        </Text>
        <Text size="sm" className="text-[var(--text-muted)]">
          {t('contactsImport.history.emptyHint')}
        </Text>
      </Section>
    )
  }
  return (
    <Section
      summary={`${t('contactsImport.history.summary', { count: items.length + assistantCount })}${
        running > 0 ? t('contactsImport.history.running', { count: running }) : ''
      }`}
    >
      <ul className="divide-y divide-[var(--border-subtle)]">{entries.map(entry => entry.node)}</ul>
    </Section>
  )
}

function Section({ summary, children }: { summary?: string; children: React.ReactNode }) {
  const { t } = useTranslation('importWizard')
  return (
    <section
      aria-labelledby="imports-history-title"
      data-testid="imports-history"
      className="mt-8 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5"
    >
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <Text
          element="h2"
          id="imports-history-title"
          size="base"
          weight="semibold"
          className="text-[var(--text-primary)]"
        >
          {t('contactsImport.history.title')}
        </Text>
        {summary ? (
          <Text size="xs" className="text-[var(--text-muted)]">
            {summary}
          </Text>
        ) : null}
      </div>
      {children}
    </section>
  )
}

/** Le résultat d'une ligne : seulement ce qui est connu — un volume absent ne s'écrit jamais « 0 ». */
function resultParts(item: UniversalImportHistoryItem, t: (key: string, options?: Record<string, unknown>) => string) {
  if (isLive(item)) return [t('contactsImport.history.rowsRead', { read: item.processedRows })]
  const family = item.breakdown?.['contact']
  const parts: string[] = []
  if (family && family.created > 0) parts.push(t('contactsImport.history.created', { count: family.created }))
  else if (item.imported > 0) parts.push(t('contactsImport.history.imported', { count: item.imported }))
  if (family && family.matched > 0) parts.push(t('contactsImport.history.completed', { count: family.matched }))
  const notImported = family ? family.duplicates + family.rejected : item.rejected + item.duplicates
  if (notImported > 0) parts.push(t('contactsImport.history.notImported', { count: notImported }))
  return parts
}

function HistoryEntry({ item }: { item: UniversalImportHistoryItem }) {
  const { t } = useTranslation('importWizard')
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const resume = useMutation({
    mutationFn: () => resumeUniversalImport(item.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: HISTORY_KEY }),
  })
  const when = formatDateTime(item.createdAt)
  const statusKey = item.interrupted ? 'interrupted' : item.status
  const parts = resultParts(item, t)
  const reasons = item.reasons ?? []
  const canOpen = item.status === 'done' && (hasFamilyReport(item.breakdown) || reasons.length > 0)
  return (
    <li data-testid="imports-history-row" className="space-y-1 py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <Text size="sm" weight="medium" className="break-all text-[var(--text-primary)]">
          {item.filename}
        </Text>
        <Text size="xs" weight="medium" className="text-[var(--text-secondary)]">
          {t(`universal.history.status.${statusKey}`).split(' — ')[0]}
        </Text>
        {/* #4573 (#4426) — la nature de la ligne : un import de fichier, jamais confondu avec un pack. */}
        <Text size="xs" className="text-[var(--text-muted)]">
          {t('universal.history.kind.file', { type: t(`universal.types.${item.type}`) })}
        </Text>
        {when ? (
          <Text size="xs" className="text-[var(--text-muted)]">
            <time dateTime={item.createdAt}>{when}</time>
          </Text>
        ) : null}
      </div>
      {item.totalRows !== null ? (
        <Text size="xs" className="text-[var(--text-muted)]">
          {t('contactsImport.history.linesBy', { count: item.totalRows })}
        </Text>
      ) : null}
      {parts.length > 0 ? (
        <Text size="sm" className="text-[var(--text-secondary)]">
          {parts.join(' · ')}
        </Text>
      ) : null}
      {isLive(item) ? (
        <Text size="xs" className="text-[var(--text-muted)]">
          {t('contactsImport.history.keepsGoing')}
        </Text>
      ) : null}
      {item.status === 'failed' ? (
        <div className="flex flex-wrap items-center gap-3">
          <Text size="xs" className="text-[var(--text-muted)]">
            {t('contactsImport.history.stoppedAfter', { count: item.processedRows })}
          </Text>
          <Button variant="black" size="sm" onClick={() => resume.mutate()} disabled={resume.isPending}>
            {t('contactsImport.history.resume')}
          </Button>
          {resume.isError ? (
            <Text size="xs" role="alert" className="text-[var(--warning-soft-text)]">
              {t('contactsImport.history.resumeError')}
            </Text>
          ) : null}
        </div>
      ) : null}
      {/* #4597.3 — retrouver UN import précis : la liste filtrée sur SON identifiant, jamais sa date. Pas de lien
          quand aucune fiche ne porte l'identifiant (import d'avant la colonne, ou rien créé) : jamais « 0 ». */}
      {item.linked?.contacts || item.linked?.accounts ? (
        <div className="flex flex-wrap items-center gap-x-4">
          {item.linked.contacts ? (
            <Link
              to="/contacts"
              search={{ importJob: item.id }}
              className="inline-flex min-h-11 items-center text-sm font-medium text-[var(--text-accent)] underline-offset-2 hover:underline"
            >
              {t('contactsImport.history.seeContacts', { count: item.linked.contacts })}
            </Link>
          ) : null}
          {item.linked.accounts ? (
            <Link
              to="/accounts"
              search={{ importJob: item.id }}
              className="inline-flex min-h-11 items-center text-sm font-medium text-[var(--text-accent)] underline-offset-2 hover:underline"
            >
              {t('contactsImport.history.seeAccounts', { count: item.linked.accounts })}
            </Link>
          ) : null}
        </div>
      ) : null}
      {canOpen ? (
        <div>
          <Button variant="ghost" size="sm" aria-expanded={open} onClick={() => setOpen(value => !value)}>
            {t('contactsImport.history.viewReport')}
          </Button>
          {open ? (
            <div className="mt-2 space-y-3">
              {hasFamilyReport(item.breakdown) ? (
                <ImportFamilyReport breakdown={item.breakdown} queryableByLaura={item.queryableByLaura} />
              ) : null}
              <ReasonList kind="rejected" reasons={reasons} />
              <ReasonList kind="to_reconcile" reasons={reasons} />
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  )
}

/** #4573 (#4426) — un import de l'assistant « Dépose tes documents » : un pack se RECONNAÎT, son original se relit. */
function PackEntry({ item }: { item: ContextPackHistoryItem }) {
  const { t } = useTranslation('importWizard')
  const when = formatDateTime(item.createdAt)
  const kind =
    item.destination === 'cv'
      ? t('universal.history.assistant.cv.destination')
      : `${t('universal.history.kind.pack')} · ${t(`contextPack.destination.${item.destination}`)}`
  return (
    <li data-testid="imports-history-row" className="space-y-1 py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <Text size="sm" weight="medium" className="break-all text-[var(--text-primary)]">
          {item.fileName}
        </Text>
        <Text size="xs" weight="medium" className="text-[var(--text-secondary)]">
          {t(`universal.history.assistant.status.${item.status}`)}
        </Text>
        <Text size="xs" className="text-[var(--text-muted)]">
          {kind}
        </Text>
        {when ? (
          <Text size="xs" className="text-[var(--text-muted)]">
            <time dateTime={item.createdAt}>{when}</time>
          </Text>
        ) : null}
      </div>
      {item.imported !== null && item.imported > 0 ? (
        <Text size="sm" className="text-[var(--text-secondary)]">
          {t(`universal.history.assistant.taken.${item.destination}`, { count: item.imported })}
        </Text>
      ) : null}
      {item.message ? (
        <Text size="xs" className="text-[var(--danger-soft-text)]">
          {item.message}
        </Text>
      ) : null}
      <ContextPackOriginalLine item={item} />
    </li>
  )
}
