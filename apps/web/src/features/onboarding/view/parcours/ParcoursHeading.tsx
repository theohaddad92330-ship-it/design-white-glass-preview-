import type { ReactNode } from 'react'

/**
 * En-tête commun des écrans de parcours sans maquette propre (entreprise, offre,
 * génération…) : la grammaire de `onboarding-accueil` — un repère (kicker) en
 * accent, un titre, un chapô. Une seule définition, pour que les écrans du
 * parcours ne divergent pas de trois façons (GA-26).
 */
export function ParcoursHeading({
  kicker,
  title,
  lead,
  children,
}: {
  kicker?: string
  title: string
  lead?: string
  children?: ReactNode
}) {
  return (
    <header className="space-y-3">
      {kicker && (
        <span className="block text-xs font-semibold uppercase tracking-widest text-[var(--bellum-text-accent)]">
          {kicker}
        </span>
      )}
      <h1 className="text-3xl font-semibold leading-tight tracking-tight text-[var(--bellum-text-primary)]">{title}</h1>
      {lead && <p className="max-w-prose text-sm leading-relaxed text-[var(--bellum-text-secondary)]">{lead}</p>}
      {children}
    </header>
  )
}

/**
 * Pied d'écran de la maquette (`ob23-footer`) : un filet, le geste de retour à
 * gauche, le geste principal à droite. Même rôle que les boutons existants —
 * seule la forme change.
 */
export function ParcoursFooter({ start, end }: { start?: ReactNode; end?: ReactNode }) {
  return (
    <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--bellum-border)] pt-5">
      <div className="flex flex-wrap items-center gap-3">{start}</div>
      <div className="flex flex-wrap items-center justify-end gap-3">{end}</div>
    </footer>
  )
}
