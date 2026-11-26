import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { CheckCircle2, CircleDashed, Info, XCircle } from 'lucide-react'
import { Text, cn, semanticColors, type SemanticVariant } from '@bellum/ui'
import { densityGap, useReplyDensity, type ReplyDensity } from './density'

/**
 * #3761 — EN-TÊTE DE RÉPONSE, BADGE DE STATUT, CHIPS DE CONTEXTE, LIGNE DE MÉTADONNÉES.
 *
 * Tout passe par les jetons `--bellum-*` (via `semanticColors`) : aucune couleur
 * en dur, donc les deux thèmes tiennent sans variante écrite à la main.
 * Le statut n'est JAMAIS porté par la couleur seule : une icône ET un libellé.
 */

type ReplyStatus = 'complete' | 'partial' | 'unavailable' | 'info'

const STATUS: Record<ReplyStatus, { variant: SemanticVariant; icon: LucideIcon }> = {
  complete: { variant: 'success', icon: CheckCircle2 },
  partial: { variant: 'warning', icon: CircleDashed },
  unavailable: { variant: 'danger', icon: XCircle },
  info: { variant: 'info', icon: Info },
}

export function ReplyStatusBadge({ status, label }: { status: ReplyStatus; label: string }) {
  const { variant, icon: Icon } = STATUS[status]
  const colors = semanticColors[variant]
  return (
    <span
      data-reply-status={status}
      className={cn(
        'inline-flex min-h-6 max-w-full items-center gap-1 rounded-full border px-2 text-xs font-medium',
        colors.bgSubtle,
        colors.border,
        colors.text,
      )}
    >
      <Icon className={cn('size-3.5 shrink-0', colors.icon)} aria-hidden />
      <span className="truncate">{label}</span>
    </span>
  )
}

export function ReplyHeader({
  title,
  subtitle,
  icon: Icon,
  status,
  statusLabel,
  density,
  children,
}: {
  title: string
  subtitle?: string | null
  icon?: LucideIcon
  status?: ReplyStatus
  /** Le libellé du statut est obligatoire dès qu'un statut est donné : jamais une couleur seule. */
  statusLabel?: string
  density?: ReplyDensity
  /** Les chips de contexte et la ligne de métadonnées s'empilent sous le titre. */
  children?: ReactNode
}) {
  const d = useReplyDensity(density)
  return (
    <header data-reply-header className={densityGap(d)}>
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        {Icon ? <Icon className="size-4 shrink-0 text-[var(--bellum-text-accent)]" aria-hidden /> : null}
        <Text
          size={d === 'compact' ? 'sm' : 'base'}
          weight="semibold"
          element="h3"
          color="text-[var(--bellum-text-primary)]"
          className="min-w-0"
        >
          {title}
        </Text>
        {status && statusLabel ? <ReplyStatusBadge status={status} label={statusLabel} /> : null}
      </div>
      {subtitle ? (
        <Text size="sm" color="text-[var(--bellum-text-secondary)]">
          {subtitle}
        </Text>
      ) : null}
      {children}
    </header>
  )
}

/** « Ce sur quoi la réponse s'appuie » : périmètre, compte, période. Une chip vide ne s'affiche pas. */
export function ReplyContextChips({
  chips,
  ariaLabel,
}: {
  chips: readonly { label: string; value?: string | null }[]
  ariaLabel: string
}) {
  const shown = chips.filter(chip => chip.label.trim() !== '')
  if (shown.length === 0) return null
  return (
    <ul aria-label={ariaLabel} className="flex flex-wrap gap-1">
      {shown.map((chip, index) => (
        <li
          key={`chip-${index}`}
          className="inline-flex min-h-6 max-w-full flex-wrap items-center gap-x-1 rounded-md border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] px-2 text-xs text-[var(--bellum-text-secondary)]"
        >
          {/* #3769 — « SNCF » rogné à 22 px : une chip passe à la ligne, elle ne coupe plus son texte. */}
          <span className="min-w-0 break-words">{chip.label}</span>
          {chip.value ? (
            <span className="min-w-0 break-words font-medium text-[var(--bellum-text-primary)]">{chip.value}</span>
          ) : null}
        </li>
      ))}
    </ul>
  )
}

/** Une ligne « clé : valeur · clé : valeur ». Une valeur absente ne fait AUCUNE entrée — jamais « 0 » ni « — ». */
export function ReplyMetaRow({ items }: { items: readonly { label: string; value?: string | number | null }[] }) {
  const shown = items.filter(
    item => item.value !== undefined && item.value !== null && String(item.value).trim() !== '',
  )
  if (shown.length === 0) return null
  return (
    <dl
      data-reply-meta
      className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-xs text-[var(--bellum-text-muted)]"
    >
      {shown.map((item, index) => (
        <div key={`meta-${index}`} className="flex gap-1">
          <dt>{item.label}</dt>
          <dd className="font-medium text-[var(--bellum-text-secondary)]">{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}
