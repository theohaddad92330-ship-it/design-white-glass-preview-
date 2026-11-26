import { Text } from '@bellum/ui'
import { ChevronDown } from 'lucide-react'
import type { ReactNode } from 'react'
import { formatCount } from '@/lib/locale'

/**
 * Section repliable des briefs (compte ET marché) — extraite de TabCommercialBrief
 * (capacité « Marchés locaux », L4a, 04/10/2026), rendu inchangé.
 */
export function BriefFold({
  title,
  count,
  detail,
  testId,
  children,
}: {
  title: string
  count?: number
  /** #4323.1 — ce que le compteur compte, lisible repliée : un nombre ne voyage jamais nu. */
  detail?: string
  testId: string
  children: ReactNode
}) {
  return (
    <details
      data-testid={testId}
      className="group rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)]"
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-4 py-2 [&::-webkit-details-marker]:hidden">
        <Text size="sm" weight="semibold">
          {title}
          {count !== undefined ? (
            <span className="ml-2 text-[var(--bellum-text-muted)]">{formatCount(count)}</span>
          ) : null}
          {detail ? <span className="ml-2 font-normal text-[var(--bellum-text-muted)]">· {detail}</span> : null}
        </Text>
        <ChevronDown aria-hidden="true" className="size-4 shrink-0 transition-transform group-open:rotate-180" />
      </summary>
      <div className="min-w-0 border-t border-[var(--bellum-border)] px-4 py-3">{children}</div>
    </details>
  )
}
