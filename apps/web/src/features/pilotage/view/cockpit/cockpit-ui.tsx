import type { ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@bellum/ui'

/**
 * Les trois gabarits du Cockpit tel que Théo le dessine : la carte arrondie, le
 * titre de section et le pli (« Ce qui a bougé », « La chaîne commerciale »,
 * « Détail »). Un pli est un `<details>` natif : il se tabule, s'annonce et
 * s'ouvre au clavier sans une ligne de script.
 */
export const CARD = 'rounded-2xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-5 md:p-6'

export function CockpitFold({
  title,
  meta,
  badge,
  defaultOpen = false,
  children,
  testId,
}: {
  title: ReactNode
  meta?: ReactNode
  badge?: ReactNode
  defaultOpen?: boolean
  children: ReactNode
  testId?: string
}) {
  return (
    <details
      open={defaultOpen}
      data-testid={testId}
      className="group rounded-2xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)]"
    >
      <summary className="flex min-h-14 cursor-pointer list-none flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-2xl px-5 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bellum-primary-500)] [&::-webkit-details-marker]:hidden">
        <span className="flex flex-wrap items-center gap-3 text-base font-semibold text-[var(--bellum-text-primary)]">
          {title}
          {badge}
        </span>
        <span className="flex items-center gap-2 text-sm text-[var(--bellum-text-secondary)]">
          {meta}
          <ChevronDown aria-hidden className="size-4 shrink-0 group-open:rotate-180" />
        </span>
      </summary>
      <div className="border-t border-[var(--bellum-border)] px-5 py-4">{children}</div>
    </details>
  )
}

const NBSP = String.fromCharCode(160)

/** Un montant en euros, court : « 71 k€ ». Sous mille, le montant entier. */
export function compactEuro(euros: number, locale: string): string {
  if (Math.abs(euros) < 1000) {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(euros)
  }
  const thousands = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(euros / 1000)
  return `${thousands}${NBSP}k€`
}

export function SectionTitle({ id, children, className }: { id?: string; children: ReactNode; className?: string }) {
  return (
    <h2 id={id} className={cn('text-lg font-semibold text-[var(--bellum-text-primary)]', className)}>
      {children}
    </h2>
  )
}
