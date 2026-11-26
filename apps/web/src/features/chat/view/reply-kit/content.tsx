import { useId, useState, type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { ChevronDown } from 'lucide-react'
import { Text, cn } from '@bellum/ui'
import { densityGap, densityPadding, useReplyDensity, type ReplyDensity } from './density'

/**
 * #3761 — LE CORPS D'UNE RÉPONSE : synthèse, grille de cartes, carte d'insight,
 * section dépliable, tags métiers, pastille d'objet lié.
 *
 * Un seul style de carte : cadre `--bellum-border`, fond `--bellum-surface-2`,
 * rayon `rounded-lg`. Une famille de réponses neuve compose ces pièces ; elle
 * n'invente pas un cadre de plus.
 */

export function ReplySummaryPanel({
  title,
  children,
  density,
}: {
  title?: string
  children: ReactNode
  density?: ReplyDensity
}) {
  const d = useReplyDensity(density)
  return (
    <section
      data-reply-summary
      className={cn(
        'rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)]',
        densityPadding(d),
        densityGap(d),
      )}
    >
      {title ? (
        <Text size="xs" weight="semibold" color="text-[var(--bellum-text-muted)]" className="uppercase tracking-wide">
          {title}
        </Text>
      ) : null}
      <Text size="sm" color="text-[var(--bellum-text-primary)]" element="div" leading="relaxed">
        {children}
      </Text>
    </section>
  )
}

/** Grille de cartes : 1 colonne sous 768 px ou en compact, 2 au-delà. Une grille vide ne s'affiche pas. */
export function ReplyCardGrid({
  children,
  density,
  asList = false,
}: {
  children: ReactNode
  density?: ReplyDensity
  /** Les enfants sont des `<li>` : la grille est alors une liste (lecteur d'écran : « liste de N éléments »). */
  asList?: boolean
}) {
  const d = useReplyDensity(density)
  const className = cn('grid grid-cols-1 gap-2', d === 'comfortable' && 'md:grid-cols-2')
  return asList ? (
    <ul data-reply-grid className={className}>
      {children}
    </ul>
  ) : (
    <div data-reply-grid className={className}>
      {children}
    </div>
  )
}

export function ReplyInsightCard({
  title,
  icon: Icon,
  tags,
  blockType,
  density,
  children,
}: {
  title: string
  /** Le `type` de bloc de réponse que cette carte porte (`data-reply-block`) : les cartes de bloc sont des cartes d'insight. */
  blockType?: string
  icon?: LucideIcon
  tags?: ReactNode
  density?: ReplyDensity
  children?: ReactNode
}) {
  const d = useReplyDensity(density)
  return (
    <article
      role="group"
      aria-label={title}
      data-reply-insight
      data-reply-block={blockType}
      className={cn(
        'min-w-0 rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)]',
        densityPadding(d),
        densityGap(d),
      )}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        {Icon ? <Icon className="size-4 shrink-0 text-[var(--bellum-text-accent)]" aria-hidden /> : null}
        <Text size="sm" weight="semibold" color="text-[var(--bellum-text-primary)]" className="min-w-0">
          {title}
        </Text>
      </div>
      {children}
      {tags}
    </article>
  )
}

/**
 * Section dépliable : un `<button>` qui se tabule, s'annonce ouvert ou fermé, cible ≥ 44 px au doigt.
 *
 * #3763 — `inline` : le second niveau d'une réponse rédigée (même geste que
 * `TopThenRest` : un bouton texte accent qui NOMME ce qu'il ouvre, « Voir
 * pourquoi », et `closeTitle` une fois ouvert). Intégration 06/10 : un seul
 * composant dépliable pour les réponses de Laura (#3761 + #3763).
 */
export function ReplyExpandable({
  title,
  closeTitle,
  inline = false,
  defaultOpen = false,
  children,
}: {
  title: string
  closeTitle?: string
  inline?: boolean
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  const panelId = useId()
  const label = open && closeTitle ? closeTitle : title
  if (inline) {
    return (
      <div className="mt-1.5" data-reply-expandable="inline">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen(value => !value)}
          className="inline-flex items-center gap-1 text-sm font-medium text-[var(--bellum-text-accent)] underline-offset-2 hover:underline pointer-coarse:min-h-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bellum-focus-ring)]"
        >
          <ChevronDown className={cn('size-3.5 transition-transform', open && 'rotate-180')} aria-hidden />
          {label}
        </button>
        {open ? (
          <div id={panelId} className="mt-1.5 text-sm text-[var(--bellum-text-secondary)]">
            {children}
          </div>
        ) : null}
      </div>
    )
  }
  return (
    <section
      data-reply-expandable
      className="rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)]"
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(value => !value)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm font-medium text-[var(--bellum-text-primary)] pointer-coarse:min-h-11"
      >
        <span className="min-w-0">{label}</span>
        <ChevronDown
          className={cn('size-4 shrink-0 text-[var(--bellum-text-muted)] transition-transform', open && 'rotate-180')}
          aria-hidden
        />
      </button>
      {open ? (
        <div id={panelId} className="border-t border-[var(--bellum-border)] px-3 py-2">
          {children}
        </div>
      ) : null}
    </section>
  )
}

/** Tags métiers (secteur, technologie, statut d'affaire…). Un tag vide ne s'affiche pas. */
export function ReplyTags({ tags, ariaLabel }: { tags: readonly string[]; ariaLabel: string }) {
  const shown = tags.map(tag => tag.trim()).filter(tag => tag !== '')
  if (shown.length === 0) return null
  return (
    <ul aria-label={ariaLabel} data-reply-tags className="flex flex-wrap gap-1">
      {shown.map((tag, index) => (
        <li
          key={`tag-${index}`}
          className="inline-flex min-h-5 max-w-full items-center rounded-full border border-[var(--bellum-border)] px-2 text-xs text-[var(--bellum-text-secondary)]"
        >
          <span className="truncate">{tag}</span>
        </li>
      ))}
    </ul>
  )
}
