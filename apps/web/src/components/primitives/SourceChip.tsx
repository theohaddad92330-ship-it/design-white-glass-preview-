import { Text } from '@bellum/ui'
import { ExternalLink } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatDate } from '@/lib/locale'

/**
 * Théo A — « SOURCES CLIQUABLES, VISIBLES DIRECTEMENT » (Louis 22/10/2026).
 *
 * Partout où un signal, une offre, un article, une nomination ou un fait collecté
 * s'affiche, le LIEN vers la page d'origine est visible SUR la carte ou la ligne :
 * nom du site d'origine + ↗, nouvel onglet, cible ≥ 44 px, nom accessible
 * « Ouvrir la source : <site> ». Plusieurs sources : la plus récente visible +
 * « +N sources » qui les liste. Le clic n'ouvre pas le détail de la carte.
 *
 * Doctrine : pas d'URL connue = pas de lien (jamais devinée) ; le lien pointe vers
 * l'ÉDITEUR de l'information, jamais vers notre fournisseur intermédiaire.
 */
type SourceRef = { url: string | null | undefined; publishedAt?: string | null }

/** Les hôtes de nos fournisseurs : un lien vers eux n'est pas la page d'origine. */
const INTERMEDIARY_HOSTS = [
  'apollo.io',
  'brave.com',
  'firecrawl.dev',
  'hunter.io',
  'lusha.com',
  'kaspr.io',
  'fullenrich.com',
  'dropcontact.com',
] as const

type ResolvedSource = { href: string; site: string; publishedAt: string | null; time: number }

function resolveSource(source: SourceRef): ResolvedSource | null {
  const raw = (source.url ?? '').trim()
  if (!raw) return null
  try {
    const url = new URL(raw)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    const site = url.hostname.replace(/^www\./, '')
    if (INTERMEDIARY_HOSTS.some(host => site === host || site.endsWith(`.${host}`))) return null
    const parsed = source.publishedAt ? Date.parse(source.publishedAt) : Number.NaN
    return {
      href: url.toString(),
      site,
      publishedAt: Number.isNaN(parsed) ? null : (source.publishedAt ?? null),
      time: Number.isNaN(parsed) ? 0 : parsed,
    }
  } catch {
    return null
  }
}

function SourceLink({ source }: { source: ResolvedSource }) {
  const { t } = useTranslation('common')
  const date = source.publishedAt
    ? formatDate(source.publishedAt, { day: '2-digit', month: '2-digit', year: 'numeric' })
    : null
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <a
        href={source.href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={t('sourceChip.open', { site: source.site })}
        onClick={event => event.stopPropagation()}
        className="inline-flex min-h-11 min-w-0 items-center gap-1 text-xs text-[var(--bellum-text-accent)] underline underline-offset-2"
      >
        <span className="truncate">{source.site}</span>
        <ExternalLink className="size-3 shrink-0" aria-hidden />
      </a>
      {date ? (
        <Text size="xs" className="shrink-0 text-[var(--bellum-text-muted)]">
          {date}
        </Text>
      ) : null}
    </span>
  )
}

export function SourceChip({ sources }: { sources: readonly SourceRef[] }) {
  const { t } = useTranslation('common')
  const [open, setOpen] = useState(false)
  const seen = new Set<string>()
  const resolved = sources
    .map(resolveSource)
    .filter((source): source is ResolvedSource => {
      if (!source || seen.has(source.href)) return false
      seen.add(source.href)
      return true
    })
    .sort((a, b) => b.time - a.time)
  const [latest, ...others] = resolved
  if (!latest) return null
  return (
    <span className="inline-flex min-w-0 flex-wrap items-center gap-x-2">
      <SourceLink source={latest} />
      {others.length > 0 ? (
        <button
          type="button"
          aria-expanded={open}
          onClick={event => {
            event.stopPropagation()
            setOpen(value => !value)
          }}
          className="inline-flex min-h-11 items-center text-xs text-[var(--bellum-text-muted)] underline underline-offset-2"
        >
          {t('sourceChip.more', { count: others.length })}
        </button>
      ) : null}
      {open ? (
        <span className="flex basis-full flex-col">
          {others.map(source => (
            <SourceLink key={source.href} source={source} />
          ))}
        </span>
      ) : null}
    </span>
  )
}
