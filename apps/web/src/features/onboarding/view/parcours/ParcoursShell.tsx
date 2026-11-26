import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { BrandMark } from '@/features/brand/BrandMark'

/**
 * Cadre commun des écrans de parcours sans maquette propre (entreprise, offre,
 * génération) — la grammaire `page-ob23` des maquettes appliquées
 * (`onboarding-accueil`, `onboarding-lancement`) : une barre du haut (marque ·
 * « Ton contexte de travail » · gestes à droite), puis une colonne de travail
 * large, alignée à gauche, jamais une carte centrée seule au milieu de l'écran.
 * Une seule définition (GA-26) pour que les trois écrans ne divergent pas.
 */
export function ParcoursShell({
  actions,
  width = 'wide',
  children,
}: {
  /** Gestes de la barre du haut (ex. « Quitter ») — seulement ceux qui existent déjà. */
  actions?: ReactNode
  /** `narrow` : un seul champ à remplir (entreprise) ; `wide` : grilles et panneaux. */
  width?: 'narrow' | 'wide'
  children: ReactNode
}) {
  const { t } = useTranslation('onboarding')
  return (
    <div
      data-parcours-shell=""
      className="flex min-h-dvh flex-col bg-[var(--bellum-bg)] text-[var(--bellum-text-primary)]"
    >
      <header className="flex min-h-16 items-center gap-5 border-b border-[var(--bellum-border)] px-4 md:px-8">
        <BrandMark />
        <span className="hidden text-xs text-[var(--bellum-text-muted)] md:inline">{t('parcours.context')}</span>
        {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
      </header>
      <main
        className={`mx-auto flex w-full flex-1 flex-col px-4 pb-20 pt-10 md:px-8 md:pt-14 ${
          width === 'narrow' ? 'max-w-3xl' : 'max-w-6xl'
        }`}
      >
        {children}
      </main>
    </div>
  )
}

/**
 * `ob23-panel` / `ob23-launch` : une surface bordée, un titre de section et,
 * à droite, sa mention discrète (ex. « Version 1 »).
 */
export function ParcoursPanel({
  title,
  meta,
  kicker,
  lead,
  labelledBy,
  children,
}: {
  title?: string
  meta?: ReactNode
  kicker?: string
  lead?: string
  labelledBy?: string
  children: ReactNode
}) {
  return (
    <section
      aria-labelledby={title ? labelledBy : undefined}
      className="rounded-card border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-5 md:p-6"
    >
      {kicker && (
        <span className="mb-1 block text-xs font-semibold uppercase tracking-widest text-[var(--bellum-text-accent)]">
          {kicker}
        </span>
      )}
      {(title || meta) && (
        <div className="mb-4 flex items-start justify-between gap-4">
          {title && (
            <h2 id={labelledBy} className="text-lg font-semibold tracking-tight text-[var(--bellum-text-primary)]">
              {title}
            </h2>
          )}
          {meta && <span className="shrink-0 text-xs text-[var(--bellum-text-muted)]">{meta}</span>}
        </div>
      )}
      {lead && <p className="-mt-2 mb-4 max-w-prose text-sm text-[var(--bellum-text-secondary)]">{lead}</p>}
      {children}
    </section>
  )
}

/**
 * `ob23-info` : la note en marge — un filet d'accent à gauche, une surface
 * secondaire. `tone="warning"` garde la teinte d'alerte existante (un doute
 * sur le registre n'est pas une information neutre).
 */
export function ParcoursInfo({
  icon,
  tone = 'info',
  role = 'status',
  children,
}: {
  icon?: ReactNode
  tone?: 'info' | 'warning'
  role?: 'status' | 'alert'
  children: ReactNode
}) {
  return (
    <div
      role={role}
      data-tone={tone}
      className={`flex items-start gap-2.5 rounded-r-lg border-l-2 bg-[var(--bellum-surface-2)] px-4 py-3 text-sm leading-relaxed text-[var(--bellum-text-secondary)] ${
        tone === 'warning' ? 'border-[var(--bellum-warning)]' : 'border-[var(--bellum-primary-500)]'
      }`}
    >
      {icon && (
        <span
          aria-hidden
          className={`mt-0.5 shrink-0 ${tone === 'warning' ? 'text-[var(--warning-soft-text)]' : 'text-[var(--bellum-text-accent)]'}`}
        >
          {icon}
        </span>
      )}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}
