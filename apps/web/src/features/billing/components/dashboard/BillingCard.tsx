import { Card, Text } from '@bellum/ui'
import type { ReactNode } from 'react'

type BillingCardProps = {
  children: ReactNode
  subtitle?: string
  title: string
}

/**
 * Refonte Théo (PR12) — `.v12-setting-block` de `d/settings-outils` (Facturation) :
 * un bloc de réglage, son titre h2 et sa phrase au-dessus d'un filet, puis ses lignes.
 */
export function BillingCard({ children, subtitle, title }: BillingCardProps) {
  return (
    <Card className="gap-0 px-5 py-5 sm:px-6">
      <header className="mb-4 border-b border-[var(--bellum-border)] pb-4">
        <Text element="h2" size="base" weight="semibold">
          {title}
        </Text>
        {subtitle ? (
          <Text size="xs" className="mt-1 text-[var(--bellum-text-muted)]">
            {subtitle}
          </Text>
        ) : null}
      </header>
      {children}
    </Card>
  )
}

/**
 * `.v12-setting-row` — une ligne de réglage : son nom (h3) et sa phrase à gauche,
 * son état ou son geste à droite ; les lignes se séparent d'un filet.
 */
export function BillingRow({
  title,
  description,
  aside,
}: {
  title: ReactNode
  description?: ReactNode
  aside?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-[var(--bellum-border)] py-4 first:pt-0 last:border-b-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="min-w-0">
        <Text element="h3" size="sm" weight="semibold">
          {title}
        </Text>
        {description ? (
          <Text element="div" size="xs" className="mt-1 text-[var(--bellum-text-secondary)]">
            {description}
          </Text>
        ) : null}
      </div>
      {aside ? <div className="flex shrink-0 flex-wrap items-center gap-2">{aside}</div> : null}
    </div>
  )
}
