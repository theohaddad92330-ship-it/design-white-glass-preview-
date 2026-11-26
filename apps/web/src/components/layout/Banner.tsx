import { cn } from '@bellum/ui'
import { X, type LucideProps } from 'lucide-react'
import type { ComponentType, HTMLAttributes, ReactNode } from 'react'

/**
 * THEO-REFONTE-COMPOSANTS — UNE seule grammaire de bandeau (GA-26 : elle vit ici, nulle part ailleurs).
 *
 * Forme lue dans les maquettes appliquées (`.t-banner`, `a/today-jour.html`, `c/actions-aujourdhui.html`) :
 * une CARTE (filet, rayon `rounded-card`, 12 × 16, sans ombre), une icône teintée par l'état, un titre
 * `<strong>` dans la couleur du texte AU-DESSUS d'une phrase 13 px secondaire, les gestes à droite
 * (`.btn.sm`), une croix nommée de 44 px au doigt. Neutre = la surface ; avertissement / danger / info /
 * succès / accent = l'aplat doux de l'état (jetons `--*-soft-*`, AA dans les deux thèmes).
 *
 * Trois placements, une seule forme :
 * - `page` (défaut) : dans la colonne de contenu, sous la barre du haut, alignée sur la gouttière de page ;
 * - `app` : au-dessus de toute l'application (annonces, session, usurpation), gouttière étroite ;
 * - `card` : posée telle quelle dans le corps d'un écran (l'écran tient la marge).
 * Plusieurs bandeaux s'empilent à 12 px (`.x-banner-row`, gap 10).
 */
export type BannerTone = 'neutral' | 'accent' | 'info' | 'success' | 'warning' | 'danger'

const TONE: Record<BannerTone, { surface: string; icon: string; action: string }> = {
  neutral: {
    surface: 'border-[var(--bellum-border)] bg-[var(--bellum-surface-1)]',
    icon: 'text-[var(--bellum-text-secondary)]',
    action: 'border-[var(--bellum-border)]',
  },
  accent: {
    surface: 'border-[var(--accent-soft-border)] bg-[var(--accent-soft-bg)]',
    icon: 'text-[var(--accent-soft-text)]',
    action: 'border-[var(--accent-soft-border)]',
  },
  info: {
    surface: 'border-[var(--info-soft-border)] bg-[var(--info-soft-bg)]',
    icon: 'text-[var(--info-soft-text)]',
    action: 'border-[var(--info-soft-border)]',
  },
  success: {
    surface: 'border-[var(--success-soft-border)] bg-[var(--success-soft-bg)]',
    icon: 'text-[var(--success-soft-text)]',
    action: 'border-[var(--success-soft-border)]',
  },
  warning: {
    surface: 'border-[var(--warning-soft-border)] bg-[var(--warning-soft-bg)]',
    icon: 'text-[var(--warning-soft-text)]',
    action: 'border-[var(--warning-soft-border)]',
  },
  danger: {
    surface: 'border-[var(--danger-soft-border)] bg-[var(--danger-soft-bg)]',
    icon: 'text-[var(--danger-soft-text)]',
    action: 'border-[var(--danger-soft-border)]',
  },
}

/** Un geste posé DANS un bandeau : `.btn.sm` de la maquette — surface, filet de l'état, texte principal. */
export function bannerActionClassName(tone: BannerTone): string {
  return cn(
    'inline-flex h-8 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-control border bg-[var(--bellum-surface-1)] px-3 text-sm font-medium text-[var(--bellum-text-primary)]',
    'transition-colors duration-immediate ease-bellum-out hover:bg-[var(--bellum-surface-2)] disabled:opacity-60',
    'outline-none focus-visible:ring-2 focus-visible:ring-[var(--bellum-focus-ring)] pointer-coarse:min-h-11',
    TONE[tone].action,
  )
}

const PLACEMENT = {
  page: 'px-4 pt-3 md:px-6',
  app: 'px-3 pt-3',
} as const

type BannerProps = Omit<HTMLAttributes<HTMLDivElement>, 'title'> & {
  tone?: BannerTone
  layout?: 'page' | 'app' | 'card'
  /** `desktop` : une seule ligne sous 768 px (le mobile ne perd pas de hauteur), à la ligne au-delà. */
  wrap?: 'always' | 'desktop'
  icon?: ComponentType<LucideProps>
  title?: ReactNode
  /** Le corps. Sans `title`, il porte seul la ligne. */
  children?: ReactNode
  /** Les gestes, à droite (boutons de `bannerActionClassName` ou `Button`). */
  actions?: ReactNode
  /** Présent ⇒ une croix de fermeture nommée par `dismissLabel`. */
  onDismiss?: () => void
  dismissLabel?: string
  /** Surcharges de la zone texte (ex. un corps qui ne se coupe jamais). */
  bodyClassName?: string
  titleClassName?: string
  /** Classe de l'enveloppe de placement (`page` / `app`), ex. pour la garder hors flux. */
  placementClassName?: string
}

export function Banner({
  tone = 'neutral',
  layout = 'page',
  wrap = 'always',
  icon: Icon,
  title,
  children,
  actions,
  onDismiss,
  dismissLabel,
  bodyClassName,
  titleClassName,
  placementClassName,
  className,
  role = 'status',
  ...rest
}: BannerProps) {
  const palette = TONE[tone]
  const card = (
    <div
      role={role}
      data-banner-tone={tone}
      className={cn(
        'flex w-full items-center gap-x-3 gap-y-2 rounded-card border px-4 text-sm text-[var(--bellum-text-primary)]',
        wrap === 'desktop' ? 'py-2 md:flex-wrap md:py-3' : 'flex-wrap py-3',
        palette.surface,
        className,
      )}
      {...rest}
    >
      {Icon ? <Icon aria-hidden className={cn('size-4 shrink-0 self-start mt-0.5', palette.icon)} /> : null}
      <div
        className={cn(
          'flex min-w-0 flex-1',
          // `desktop` : titre et phrase EN LIGNE sous 768 px (une seule ligne de bandeau, #4191), empilés au-delà.
          wrap === 'desktop'
            ? 'items-baseline gap-x-2 md:flex-col md:items-stretch md:gap-0.5'
            : 'basis-[calc(100%-2.5rem)] flex-col gap-0.5 sm:basis-0',
        )}
      >
        {title ? <strong className={cn('font-semibold', titleClassName)}>{title}</strong> : null}
        {children ? (
          <span className={cn(title ? 'text-[var(--bellum-text-secondary)]' : undefined, bodyClassName)}>
            {children}
          </span>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      {onDismiss ? (
        <button
          type="button"
          aria-label={dismissLabel}
          onClick={onDismiss}
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-control text-[var(--bellum-text-muted)] outline-none transition-colors duration-immediate ease-bellum-out hover:bg-[var(--bellum-surface-2)] hover:text-[var(--bellum-text-primary)] focus-visible:ring-2 focus-visible:ring-[var(--bellum-focus-ring)] pointer-coarse:min-h-11 pointer-coarse:min-w-11"
        >
          <X className="size-4" aria-hidden />
        </button>
      ) : null}
    </div>
  )
  if (layout === 'card') return card
  return <div className={cn('w-full shrink-0', PLACEMENT[layout], placementClassName)}>{card}</div>
}
