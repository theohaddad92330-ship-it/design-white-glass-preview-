import { Text, cn } from '@bellum/ui'
import { ChevronDown } from 'lucide-react'
import type { ReactNode } from 'react'

/**
 * Refonte Théo (23/10/2026) — LES BRIQUES DE LA FICHE COMPTE, lues dans la maquette appliquée
 * `a/comptes-fiche.html` (`.ac20-card`, `.ac20-section-head`, `.t-acc`, `.ac20-eyebrow`).
 *
 * Elles vivent ICI, dans la fiche, et pas dans `packages/ui` (contrat de la coque : un lot écran
 * n'y touche pas). Une brique, un rôle : la carte porte un sur-titre en capitales, un titre, un corps
 * et un pied d'actions ; la tête de section porte la phrase de Laura ; l'accordéon range ce qui se lit
 * « pour aller plus loin », replié.
 */

/** `.ac20-eyebrow` — le sur-titre en capitales, teinté de l'accent. */
export function DossierEyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'block text-xs font-semibold uppercase tracking-widest text-[var(--bellum-text-accent)]',
        className,
      )}
    >
      {children}
    </span>
  )
}

type DossierCardProps = {
  eyebrow?: ReactNode
  title?: ReactNode
  /** `.ac20-card.wide` — la carte prend toute la largeur de la grille. */
  wide?: boolean
  footer?: ReactNode
  children?: ReactNode
  testId?: string
  className?: string
}

/** `.ac20-card` — sur-titre, titre, corps, pied d'actions séparé par un filet. Sans ombre au repos. */
export function DossierCard({ eyebrow, title, wide, footer, children, testId, className }: DossierCardProps) {
  return (
    <section
      data-testid={testId}
      data-dossier-card=""
      className={cn(
        'flex min-w-0 max-w-full flex-col overflow-hidden rounded-card border border-[var(--bellum-border)] bg-card',
        wide && 'col-span-full',
        className,
      )}
    >
      {eyebrow || title ? (
        <div className="px-5 pt-5">
          {eyebrow ? <DossierEyebrow>{eyebrow}</DossierEyebrow> : null}
          {title ? (
            <Text element="h3" size="lg" weight="semibold" className="mt-2 text-[var(--bellum-text-primary)]">
              {title}
            </Text>
          ) : null}
        </div>
      ) : null}
      {children ? <div className="min-w-0 flex-1 px-5 pb-5 pt-4">{children}</div> : null}
      {footer ? (
        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--bellum-border)] px-4 py-2">
          {footer}
        </footer>
      ) : null}
    </section>
  )
}

/** `.ac20-knowledge-grid` — deux colonnes quand la place le permet, une au téléphone : mesurées par le CONTENU
 *  (GA-373), jamais par un palier de fenêtre. */
export function DossierGrid({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <div data-testid={testId} className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,22rem),1fr))] gap-5">
      {children}
    </div>
  )
}

type DossierSectionHeadProps = {
  title: ReactNode
  lead?: ReactNode
  actions?: ReactNode
  testId?: string
  /** Le niveau de titre : `h2` pour la tête d'un onglet, `h3` pour un groupe dans l'onglet. */
  level?: 'h2' | 'h3'
}

/** `.ac20-section-head` — la phrase qui ouvre un onglet (grande), sa lecture, ses actions à droite. */
export function DossierSectionHead({ title, lead, actions, testId, level = 'h2' }: DossierSectionHeadProps) {
  return (
    <div
      data-testid={testId}
      data-dossier-section-head=""
      className="mb-6 mt-4 flex min-w-0 flex-col gap-3 md:flex-row md:items-start md:justify-between md:gap-6"
    >
      <div className="min-w-0">
        <Text
          element={level}
          size={level === 'h2' ? '2xl' : 'lg'}
          weight="semibold"
          leading="snug"
          className="tracking-tight text-[var(--bellum-text-primary)]"
        >
          {title}
        </Text>
        {lead ? (
          <Text element="p" size="sm" leading="relaxed" className="mt-2 text-[var(--bellum-text-secondary)]">
            {lead}
          </Text>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}

type DossierAccordionProps = {
  title: ReactNode
  hint?: ReactNode
  icon?: ReactNode
  defaultOpen?: boolean
  children: ReactNode
  testId?: string
}

/** `.t-acc` — une lecture repliée : titre, indice gris, chevron ; le corps ne se rend qu'à l'ouverture du `<details>`. */
export function DossierAccordion({ title, hint, icon, defaultOpen, children, testId }: DossierAccordionProps) {
  return (
    <details
      data-testid={testId}
      open={defaultOpen}
      className="group min-w-0 border-b border-[var(--bellum-border)] last:border-b-0"
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 py-3 text-sm text-[var(--bellum-text-primary)] [&::-webkit-details-marker]:hidden">
        {icon ? <span className="shrink-0 text-[var(--bellum-text-accent)]">{icon}</span> : null}
        <span className="min-w-0 flex-1 font-medium">
          {title}
          {hint ? <span className="ml-1 font-normal text-[var(--bellum-text-muted)]">· {hint}</span> : null}
        </span>
        <ChevronDown
          aria-hidden
          className="size-4 shrink-0 text-[var(--bellum-text-muted)] transition-transform duration-immediate ease-bellum-out group-open:rotate-180"
        />
      </summary>
      <div className="min-w-0 pb-4">{children}</div>
    </details>
  )
}

/** `.x-more` — « Pour aller plus loin » : un sur-titre, une phrase, puis les accordéons dans une carte. */
export function DossierMore({
  eyebrow,
  lead,
  children,
  testId,
}: {
  eyebrow: ReactNode
  lead?: ReactNode
  children: ReactNode
  testId?: string
}) {
  return (
    <section
      data-testid={testId}
      className="min-w-0 rounded-card border border-[var(--bellum-border)] bg-card px-5 pb-2 pt-5"
    >
      <DossierEyebrow>{eyebrow}</DossierEyebrow>
      {lead ? (
        <Text element="p" size="sm" className="mt-2 text-[var(--bellum-text-secondary)]">
          {lead}
        </Text>
      ) : null}
      <div className="mt-3 min-w-0">{children}</div>
    </section>
  )
}
