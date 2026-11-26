import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ExternalLink } from 'lucide-react'
import { factLinkKey } from '@/features/discover/lib/discover-fact-type'
import { sourceSiteName } from '@/features/discover/lib/discover-source-site'
import type { DiscoverSignal } from '@/features/discover/lib/discover-types'
import { formatDate } from '@/lib/locale'

// #4307.2 — la carte montre 5 faits au plus ; au-delà, l'historique ENTIER se déplie, gratuitement.
const CARD_FACTS_SHOWN = 5

const DATE_FORMAT: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }

/**
 * #4307.2 — « Voir tout l'historique (N) ». GRATUIT (le déblocage payant est retiré, décision Louis 20/10).
 * N est le vrai compte des signaux lisibles (libellé ET date) ; à 5 ou moins il n'y a rien de plus à
 * montrer, donc aucun geste — jamais « (0) ».
 */
export function CandidateSignalHistory({ signals }: { signals: readonly DiscoverSignal[] }) {
  const { t } = useTranslation('discover')
  const [open, setOpen] = useState(false)
  const listId = useId()
  const readable = signals.filter(s => typeof s.label === 'string' && typeof s.date === 'string')
  if (readable.length <= CARD_FACTS_SHOWN) return null
  const sorted = [...readable].sort((a, b) => b.date.localeCompare(a.date))

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        aria-expanded={open}
        aria-controls={listId}
        className="self-start rounded-sm py-1 text-xs font-medium text-[var(--bellum-text-accent)] pointer-coarse:min-h-11"
      >
        {open ? t('history.hide') : t('history.show', { count: readable.length })}
      </button>
      <ul id={listId} hidden={!open} aria-label={t('history.listLabel')} className="flex flex-col gap-1">
        {open &&
          sorted.map((signal, index) => (
            <li
              key={`${signal.date}-${index}`}
              className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-xs leading-snug"
              style={{ color: 'var(--text-secondary)' }}
            >
              <time dateTime={signal.date} className="shrink-0 tabular-nums" style={{ color: 'var(--text-ghost)' }}>
                {formatDate(signal.date, DATE_FORMAT) ?? signal.date}
              </time>
              <span aria-hidden="true">·</span>
              <span className="min-w-0 break-words">{signal.label}</span>
              {signal.url && sourceSiteName(signal.url) && (
                <a
                  href={signal.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={t('facts.openSource', { site: t(factLinkKey(signal.type)) })}
                  className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-sm py-1 font-medium text-[var(--bellum-text-accent)] underline underline-offset-2 pointer-coarse:min-h-11"
                >
                  {t(factLinkKey(signal.type))}
                  <ExternalLink className="h-3 w-3" aria-hidden="true" />
                </a>
              )}
            </li>
          ))}
      </ul>
    </div>
  )
}
