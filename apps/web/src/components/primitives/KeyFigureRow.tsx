import type { ReactNode } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger, TYPE_SCALE, cn } from '@bellum/ui'

/**
 * F2-FIX #4332 — LA RANGÉE DE CHIFFRES CLÉS, ÉCRITE UNE SEULE FOIS (GA-26).
 *
 * Recette prod du 20/10 : Comptes n'avait aucun chiffre en tête, le Pipe en avait quatre sous forme de
 * cartes, le Vivier cinq sous forme de pastilles — trois formes pour le même geste (« où en suis-je »).
 * Le chiffre prend le rôle `keyFigure` de `TYPE_SCALE`, le libellé le rôle `label`.
 *
 * ⚠️ Une valeur absente (`null`, `undefined`, texte vide) ne fait AUCUNE tuile — dans une liste, une
 * absence ne fait aucune ligne (GA-18 / GA-19). Un vrai zéro (`0`) est une valeur : il reste. Quand
 * plus aucune tuile n'a de valeur, la rangée ne rend rien, pas un cadre vide. Qui veut dire « non
 * mesuré » le fait par une valeur qui le dit (`UnknownValue`), jamais par un `0`.
 */
export type KeyFigure = {
  id: string
  /** Un repère de test posé sur la tuile entière (libellé, valeur, nuance) : l'écran qui la rend le nomme. */
  testId?: string
  /** Ce que compte le chiffre — toujours nommé à l'écran, jamais seulement en infobulle. */
  label: string
  value: ReactNode | null | undefined
  /** Une ligne courte qui porte la nuance (dénominateur, « au moins »…). */
  meta?: string | null
  tone?: 'neutral' | 'warning' | 'accent' | 'muted'
  /** Un geste sous le chiffre (bouton) : seulement quand il y a quelque chose à ouvrir. */
  action?: ReactNode
  /** Un bloc secondaire (compteur filtrant…) posé sous la nuance. */
  extra?: ReactNode
  /** Le détail lu au survol ET au focus clavier (GA-35) ; absent = pas d'infobulle. */
  detail?: ReactNode
  icon?: ReactNode
  /** Refonte Théo (`.a4-counters`) — le chiffre est un BOUTON qui pose la vue qu'il compte. */
  onSelect?: () => void
  /** La vue que ce chiffre pose est celle affichée : il est allumé (accent) et `aria-pressed`. */
  pressed?: boolean
}

const TONE: Record<NonNullable<KeyFigure['tone']>, string> = {
  neutral: 'text-[var(--bellum-text-primary)]',
  // Les jetons SEMANTIQUES de texte (`*-soft-text`) : `--bellum-warning` nu ne porte pas de texte (contraste).
  warning: 'text-[var(--warning-soft-text)]',
  accent: 'text-[var(--bellum-text-accent)]',
  muted: 'text-[var(--bellum-text-muted)]',
}

/**
 * #4582 (Louis 26/10) — LE zéro-complété du compteur, écrit UNE fois (GA-26) : la maquette Théo V22 (`.a4-counters`)
 * pose `n.toString().padStart(2,'0')`. Posé partout de la même façon — 4 → « 04 », 0 → « 00 » — et jamais tronqué
 * (1234 reste « 1234 »). Seuls les NOMBRES passent par là : un montant ou un texte s'écrit tel quel.
 */
export function padKeyFigure(value: number): string {
  return value.toString().padStart(2, '0')
}

function displayValue(value: ReactNode): ReactNode {
  return typeof value === 'number' ? padKeyFigure(value) : value
}

function isPresent(value: ReactNode | null | undefined): boolean {
  return value !== null && value !== undefined && value !== '' && value !== false
}

export function KeyFigureRow({
  figures,
  testId,
  className,
  variant = 'tiles',
  label,
}: {
  figures: readonly KeyFigure[]
  testId?: string
  className?: string
  /**
   * `tiles` — une carte par chiffre (Pipe, Vivier). `band` — refonte Théo (`.a4-counters`, Comptes) : UN
   * cadre, les chiffres séparés par un filet, deux par rangée sous 768 px. Même composant, même règle
   * d'absence : c'est la forme qui change, jamais ce qui se compte.
   */
  variant?: 'tiles' | 'band'
  /** Le nom du groupe pour un lecteur d'écran (la bande se lit comme un tout). */
  label?: string
}) {
  const shown = figures.filter(figure => isPresent(figure.value))
  if (shown.length === 0) return null

  if (variant === 'band') {
    return (
      <div
        data-testid={testId}
        role="group"
        aria-label={label}
        className={cn(
          'grid grid-cols-2 gap-y-5 rounded-card border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] py-4 md:grid-cols-4 md:py-5',
          className,
        )}
      >
        {shown.map((figure, index) => (
          <BandFigure
            key={figure.id}
            figure={figure}
            // Le filet entre deux chiffres, jamais après le dernier d'une rangée (2 sous 768 px, 4 au-dessus).
            divided={index < shown.length - 1}
            dividedOnMobile={index % 2 === 0 && index < shown.length - 1}
          />
        ))}
      </div>
    )
  }

  return (
    <div data-testid={testId} className={cn('flex flex-wrap items-stretch gap-2', className)}>
      {shown.map(figure => (
        <Tile key={figure.id} figure={figure} />
      ))}
    </div>
  )
}

function BandFigure({
  figure,
  divided,
  dividedOnMobile,
}: {
  figure: KeyFigure
  divided: boolean
  dividedOnMobile: boolean
}) {
  const textValue = typeof figure.value === 'string' || typeof figure.value === 'number' ? String(figure.value) : null
  const body = (
    <>
      <span className="flex items-center gap-1.5 text-xs font-medium text-[var(--bellum-text-secondary)] md:text-sm">
        {figure.icon}
        {figure.label}
      </span>
      <strong
        className={cn(
          'text-3xl font-semibold leading-tight tracking-tight tabular-nums transition-colors duration-immediate ease-bellum-out md:text-4xl',
          figure.pressed ? 'text-[var(--bellum-text-accent)]' : TONE[figure.tone ?? 'neutral'],
          figure.onSelect && 'group-hover:text-[var(--bellum-text-accent)]',
        )}
      >
        {/* #4582 — le zéro-complété de la maquette Théo, par l'unique `padKeyFigure`. */}
        {displayValue(figure.value)}
      </strong>
      {figure.meta ? <span className="text-xs text-[var(--bellum-text-muted)]">{figure.meta}</span> : null}
    </>
  )
  const frame = cn(
    'group flex min-h-11 min-w-0 flex-col items-start gap-1.5 px-4 text-left md:px-6',
    divided && 'md:border-r md:border-[var(--bellum-border)]',
    dividedOnMobile && 'border-r border-[var(--bellum-border)] md:border-r',
    !divided && 'md:border-r-0',
  )
  const name = textValue === null ? undefined : `${figure.label} : ${textValue}`
  if (figure.onSelect) {
    return (
      <button
        type="button"
        aria-pressed={figure.pressed === true}
        aria-label={name}
        onClick={figure.onSelect}
        className={cn(
          frame,
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bellum-primary-500)]',
        )}
      >
        {body}
      </button>
    )
  }
  return (
    <div data-testid={figure.testId} role={name ? 'group' : undefined} aria-label={name} className={frame}>
      {body}
    </div>
  )
}

function Tile({ figure }: { figure: KeyFigure }) {
  const textValue = typeof figure.value === 'string' || typeof figure.value === 'number' ? String(figure.value) : null
  const tile = (
    <div
      data-testid={figure.testId}
      role={textValue === null ? undefined : 'group'}
      aria-label={textValue === null ? undefined : `${figure.label} : ${textValue}`}
      tabIndex={figure.detail ? 0 : undefined}
      className={cn(
        'flex min-w-32 flex-1 flex-col gap-1 rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-3',
        figure.detail && 'cursor-help outline-none focus-visible:ring-2 focus-visible:ring-[var(--bellum-primary-500)]',
      )}
    >
      <span className={cn(TYPE_SCALE.label, 'flex items-center gap-1.5 text-[var(--bellum-text-secondary)]')}>
        {figure.icon}
        {figure.label}
      </span>
      <span className={cn(TYPE_SCALE.keyFigure, 'min-w-0', TONE[figure.tone ?? 'neutral'])}>
        {displayValue(figure.value)}
      </span>
      {figure.meta ? (
        <span className={cn(TYPE_SCALE.label, 'text-[var(--bellum-text-muted)]')}>{figure.meta}</span>
      ) : null}
      {figure.extra ? <div className="mt-1">{figure.extra}</div> : null}
      {figure.action}
    </div>
  )
  if (!figure.detail) return tile
  return (
    <Tooltip>
      <TooltipTrigger asChild>{tile}</TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        {figure.detail}
      </TooltipContent>
    </Tooltip>
  )
}
