import { cn } from '@bellum/ui'
import type { ReactNode } from 'react'

/**
 * Théo PR12 — la grammaire des maquettes (en-tête de page, pastille teintée, note, grille de méta) pour les écrans
 * sans maquette propre. Tout passe par les jetons `--bellum-*` : deux thèmes, aucune couleur dans le JSX (D79).
 * Source : `c/actions-aujourdhui` (`.a14-head`, `.a14-pill`, `.a14-note`, `.a14-task-meta`, `.t-section-title`).
 */

type PillTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger'

const PILL_TONES: Record<PillTone, string> = {
  neutral: 'border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] text-[var(--bellum-text-secondary)]',
  accent: 'border-[var(--bellum-accent-line)] bg-[var(--bellum-accent-bg)] text-[var(--bellum-text-accent)]',
  success: 'border-[var(--success-soft-border)] bg-[var(--success-soft-bg)] text-[var(--success-soft-text)]',
  warning: 'border-[var(--warning-soft-border)] bg-[var(--warning-soft-bg)] text-[var(--warning-soft-text)]',
  danger: 'border-[var(--danger-soft-border)] bg-[var(--danger-soft-bg)] text-[var(--danger-soft-text)]',
}

/** La pastille teintée : la couleur dit un état, jamais une décoration. */
export function TheoPill({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: PillTone
  children: ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-badge border px-2 py-1 text-xs font-medium leading-snug',
        PILL_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

/** La note de bas d'écran : ce que le geste fait, et surtout ce qu'il ne fait pas. */
export function TheoNote({ tone = 'accent', children }: { tone?: 'accent' | 'neutral'; children: ReactNode }) {
  return (
    <div
      className={cn(
        'rounded-control border px-4 py-3 text-xs leading-relaxed text-[var(--bellum-text-secondary)]',
        tone === 'accent'
          ? 'border-[var(--bellum-accent-line)] bg-[var(--bellum-accent-bg)]'
          : 'border-[var(--bellum-border)] bg-[var(--bellum-surface-2)]',
      )}
    >
      {children}
    </div>
  )
}

/** Le titre de section en capitales discrètes (`.t-section-title`). */
export function TheoSectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--bellum-text-muted)]">{children}</h2>
}

/** La grille « étiquette / valeur » sur fond doux (`.a14-task-meta`). Une valeur absente ne fait aucune ligne. */
export function TheoMetaGrid({
  items,
  label,
}: {
  items: { label: string; value: ReactNode; tone?: 'late' }[]
  label?: string
}) {
  return (
    <dl
      aria-label={label}
      className="grid grid-cols-1 gap-4 rounded-card border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] p-4 sm:grid-cols-3"
    >
      {items.map(item => (
        <div key={item.label} className="min-w-0">
          <dt className="mb-1 text-xs text-[var(--bellum-text-secondary)]">{item.label}</dt>
          <dd
            className={cn(
              'break-words text-sm font-semibold',
              item.tone === 'late' ? 'text-[var(--danger-soft-text)]' : 'text-[var(--bellum-text-primary)]',
            )}
          >
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/** La carte de surface : bordure fine, rayon de carte, ombre diffuse de la coque. */
export function TheoCard({
  children,
  className,
  'aria-label': ariaLabel,
}: {
  children: ReactNode
  className?: string
  'aria-label'?: string
}) {
  return (
    <section
      aria-label={ariaLabel}
      className={cn(
        'rounded-card border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-5 shadow-card',
        className,
      )}
    >
      {children}
    </section>
  )
}

/**
 * Les onglets soulignés des maquettes (`.a14-tabs`) : un VRAI onglet par contenu — le panneau actif seul est rendu
 * par l'écran, jamais des blocs empilés. Le compteur est une pastille ; un compteur inconnu (`undefined`) ne s'affiche
 * pas — jamais « 0 » pour « pas encore lu ».
 */
export function TheoTabs<K extends string>({
  tabs,
  active,
  onChange,
  label,
  idPrefix,
}: {
  tabs: readonly { key: K; label: string; count?: number }[]
  active: K
  onChange: (key: K) => void
  label: string
  idPrefix: string
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className="flex gap-6 overflow-x-auto border-b border-[var(--bellum-border)]"
    >
      {tabs.map(tab => {
        const selected = tab.key === active
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${tab.key}`}
            aria-selected={selected}
            aria-controls={`${idPrefix}-panel-${tab.key}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.key)}
            onKeyDown={event => {
              if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
              const index = tabs.findIndex(item => item.key === tab.key)
              const next = tabs[(index + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]
              if (next) onChange(next.key)
            }}
            className={cn(
              '-mb-px inline-flex min-h-11 shrink-0 items-center gap-1.5 border-b-2 pb-2.5 pt-1 text-sm',
              selected
                ? 'border-[var(--bellum-primary)] font-medium text-[var(--bellum-text-accent)]'
                : 'border-transparent text-[var(--bellum-text-secondary)] hover:text-[var(--bellum-text-primary)]',
            )}
          >
            {tab.label}
            {tab.count !== undefined ? <TheoPill className="px-1.5 py-0 tabular-nums">{tab.count}</TheoPill> : null}
          </button>
        )
      })}
    </div>
  )
}

/** Le panneau d'un `TheoTabs` : relié à son onglet pour les lecteurs d'écran. */
export function TheoTabPanel({
  idPrefix,
  tabKey,
  children,
}: {
  idPrefix: string
  tabKey: string
  children: ReactNode
}) {
  return (
    <div
      role="tabpanel"
      id={`${idPrefix}-panel-${tabKey}`}
      aria-labelledby={`${idPrefix}-tab-${tabKey}`}
      className="flex flex-col gap-4"
    >
      {children}
    </div>
  )
}
