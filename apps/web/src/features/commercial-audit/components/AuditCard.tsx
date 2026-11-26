import type { ReactNode } from 'react'

/**
 * Le cadre commun des blocs de l'audit — la carte des maquettes Théo V22 (`.ob20-note-card` de
 * `settings-espace#profil` et de l'onboarding V23) : rayon de carte (10 px), bordure, fond de carte, AUCUNE ombre au
 * repos. Une carte se tient par sa BORDURE (tokens.css), jamais par une couleur écrite ici.
 */
export function AuditCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      data-audit-card=""
      className={`rounded-card border border-[var(--bellum-border)] bg-card p-5 md:p-6 ${className ?? ''}`}
    >
      {children}
    </div>
  )
}
