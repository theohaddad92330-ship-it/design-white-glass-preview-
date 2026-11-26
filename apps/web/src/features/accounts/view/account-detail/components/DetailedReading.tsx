import type { ReactNode } from 'react'

/**
 * #5106.8 / #5107.5 — « Lecture détaillée » : le contenu d'avant la forme maquette V22, REPLIÉ (fermé par défaut),
 * jamais retiré. `<details>` natif : le clavier et le lecteur d'écran le connaissent. `open` / `onOpenChange` ne servent
 * que lorsqu'un geste de la grille doit rendre visible un formulaire rangé dedans.
 */
export function DetailedReading({
  testId,
  label,
  open,
  onOpenChange,
  children,
}: {
  testId: string
  label: string
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children: ReactNode
}) {
  return (
    <details
      data-testid={testId}
      className="min-w-0"
      open={open}
      onToggle={onOpenChange ? event => onOpenChange(event.currentTarget.open) : undefined}
    >
      <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium text-[var(--bellum-text-accent)]">
        {label}
      </summary>
      <div className="flex min-w-0 flex-col gap-4 pt-2">{children}</div>
    </details>
  )
}
