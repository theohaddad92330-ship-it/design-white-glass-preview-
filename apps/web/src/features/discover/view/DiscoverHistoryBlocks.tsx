import { useId, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  historyReason,
  splitDiscoverBlocks,
  type DiscoverBlock,
  type HistoryReason,
} from '@/features/discover/lib/discover-history-blocks'
import type { DiscoverCandidate } from '@/features/discover/lib/discover-types'

/**
 * #4761 — les deux blocs de /discover : « Signaux récents » puis « Comptes à historique ». Chacun dit son
 * plafond et son total (« 20 sur 134 ») avec un « Voir les 114 autres » explicite ; un bloc vide DISPARAÎT
 * (ni « 0 », ni ligne de remplissage). Aucun chiffre de crédit : lire l'historique déjà stocké est gratuit.
 */
interface Props {
  rows: readonly DiscoverCandidate[]
  windowDays?: number
  /** La techno / le mot-clé de la recherche, pour que la raison nomme ce que l'entreprise a cherché. */
  subject?: string
  nowMs?: number
  renderRow: (candidate: DiscoverCandidate, reason: HistoryReason | null) => ReactNode
}

function BlockSection({
  kind,
  title,
  block,
  expanded,
  onToggle,
  renderRow,
  reasonOf,
}: {
  kind: 'recent' | 'history'
  title: string
  block: DiscoverBlock
  expanded: boolean
  onToggle: () => void
  renderRow: Props['renderRow']
  reasonOf: (candidate: DiscoverCandidate) => HistoryReason | null
}) {
  const { t } = useTranslation('discover')
  const headingId = useId()
  if (block.total === 0) return null
  const capped = block.total > block.shown.length || expanded
  return (
    <section data-testid={`discover-block-${kind}`} aria-labelledby={headingId} className="flex flex-col gap-2">
      <h2 id={headingId} className="flex flex-wrap items-baseline gap-x-2 text-sm font-semibold">
        <span>{title}</span>
        <span
          data-testid={`discover-block-${kind}-count`}
          className="text-xs font-normal text-[var(--bellum-text-secondary)]"
        >
          {capped
            ? t('historyBlocks.capOf', { shown: block.shown.length, total: block.total })
            : t('historyBlocks.total', { count: block.total })}
        </span>
      </h2>
      <div className="flex flex-col gap-2">
        {block.shown.map(candidate => (
          <div key={candidate.siren}>{renderRow(candidate, kind === 'history' ? reasonOf(candidate) : null)}</div>
        ))}
      </div>
      {capped && (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="self-start rounded-sm py-1 text-xs font-medium text-[var(--bellum-text-accent)] pointer-coarse:min-h-11"
        >
          {expanded ? t('historyBlocks.collapse') : t('historyBlocks.showOthers', { count: block.hidden })}
        </button>
      )}
    </section>
  )
}

export function DiscoverHistoryBlocks({ rows, windowDays, subject, nowMs, renderRow }: Props) {
  const { t } = useTranslation('discover')
  const [expanded, setExpanded] = useState({ recent: false, history: false })
  const blocks = splitDiscoverBlocks(rows, {
    expanded,
    ...(windowDays ? { windowDays } : {}),
    ...(nowMs ? { nowMs } : {}),
  })
  const reasonOf = (candidate: DiscoverCandidate) =>
    historyReason(candidate, {
      ...(nowMs ? { nowMs } : {}),
      ...(subject ? { subject } : {}),
      ...(windowDays ? { windowDays } : {}),
    })
  return (
    <div data-testid="discover-history-blocks" className="flex flex-col gap-5">
      <BlockSection
        kind="recent"
        title={t('historyBlocks.recentTitle')}
        block={blocks.recent}
        expanded={expanded.recent}
        onToggle={() => setExpanded(value => ({ ...value, recent: !value.recent }))}
        renderRow={renderRow}
        reasonOf={reasonOf}
      />
      <BlockSection
        kind="history"
        title={t('historyBlocks.historyTitle')}
        block={blocks.history}
        expanded={expanded.history}
        onToggle={() => setExpanded(value => ({ ...value, history: !value.history }))}
        renderRow={renderRow}
        reasonOf={reasonOf}
      />
      {blocks.unlisted > 0 && (
        <p data-testid="discover-blocks-unlisted" className="text-xs text-[var(--bellum-text-secondary)]">
          {t('historyBlocks.unlisted', { count: blocks.unlisted })}
        </p>
      )}
    </div>
  )
}
