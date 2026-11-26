import { Card, Text } from '@bellum/ui'
import { useId } from 'react'

/**
 * L4 (14/10/2026) — LES DEUX BRIQUES DE LA PAGE EN QUATRE RANGÉES.
 *
 * `FinanceRow` est une rangée (un h2, une phrase, une carte). `FinanceFrame`
 * est un bloc DANS une rangée, et sa `period` est OBLIGATOIRE : c'est le
 * système de types qui interdit qu'un chiffre soit rendu sans sa fenêtre de
 * temps — recette du 14/10, point 3, « encaissé 1 022 000 € » d'un côté et
 * « aucune source » de l'autre étaient deux fenêtres (12 mois glissants contre
 * le mois choisi) que rien n'écrivait.
 */
export function FinanceRow({
  rowKey,
  title,
  hint,
  children,
}: {
  rowKey: 'collections' | 'billing' | 'margin' | 'detail'
  title: string
  hint: string
  children: React.ReactNode
}) {
  const headingId = useId()
  return (
    <section aria-labelledby={headingId} data-finance-row={rowKey} className="mt-8">
      <h2 id={headingId} className="text-base font-semibold text-[var(--bellum-text-primary)]">
        {title}
      </h2>
      <Text size="xs" className="mt-0.5 block text-[var(--bellum-text-muted)]">
        {hint}
      </Text>
      <Card className="mt-3 p-4">{children}</Card>
    </section>
  )
}

export function FinanceFrame({
  title,
  hint,
  period,
  action,
  children,
}: {
  /** Absent quand le composant enfant porte déjà son propre titre. */
  title?: string
  hint?: string
  /** La fenêtre de temps du chiffre, en toutes lettres — et « ne suit pas le sélecteur » quand c'est vrai. */
  period: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div data-finance-block className="min-w-0">
      {title || action ? (
        <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
          <Text size="xs" weight="semibold" className="text-[var(--bellum-text-secondary)]">
            {title}
          </Text>
          {action}
        </div>
      ) : null}
      {hint ? (
        <Text size="xs" className="block text-[var(--bellum-text-muted)]">
          {hint}
        </Text>
      ) : null}
      <Text size="xs" weight="medium" data-period-label className="mb-2 block text-[var(--bellum-text-secondary)]">
        {period}
      </Text>
      {children}
    </div>
  )
}
