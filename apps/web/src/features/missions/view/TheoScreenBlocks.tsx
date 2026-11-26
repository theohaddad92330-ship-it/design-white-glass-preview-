import { Box, Text, cn } from '@bellum/ui'
import { ChevronDown, CircleHelp } from 'lucide-react'
import type { ReactNode } from 'react'

/**
 * LES BLOCS DES MAQUETTES MISSIONS (Théo V22, refonte PR12 du 23/10/2026) — la grammaire que
 * reprennent les écrans de Missions SANS maquette propre (Facturation, Nouvelle mission) et Notes
 * de frais, sur le modèle de `c/missions-notes-de-frais`, `c/missions-factures`,
 * `c/missions-encaissements` et `c/missions-finance`.
 *
 * Un bloc = une classe de la maquette : `.v18-head`, `.v18-guide`, `.v18-stats`/`.v18-stat`,
 * `.v18-toolbar`, `.v18-card`, `.ht-row`/`.ht-dot`, `.ht-table-wrap`. Écrits une fois ici plutôt
 * que recopiés dans chaque écran : trois recopies divergeraient au premier réglage (GA-26).
 * Aucune couleur écrite à la main — les jetons doux de la coque, dans les deux thèmes (GA-33).
 */

/** `.v18-head` — le titre de l'écran (h1), sa phrase, et les gestes de tête à droite. */
export function TheoScreenHead({ title, lede, actions }: { title: string; lede: string; actions?: ReactNode }) {
  return (
    <header data-theo-block="head" className="flex flex-wrap items-start justify-between gap-5">
      <Box className="min-w-0 space-y-2">
        <h1 className="text-2xl font-semibold leading-tight tracking-tight text-[var(--bellum-text-primary)] md:text-3xl">
          {title}
        </h1>
        <Text element="p" size="sm" color="var(--bellum-text-secondary)">
          {lede}
        </Text>
      </Box>
      {actions ? <Box className="flex flex-wrap items-center justify-start gap-2 md:justify-end">{actions}</Box> : null}
    </header>
  )
}

/**
 * `.v18-guide` — le parcours propre à l'écran, REPLIÉ (un clic, jamais caché).
 *
 * Le libellé est le TITRE du parcours, pas « Comment travailler ici ? » : ce lien-là est posé
 * par la coque au-dessus de l'écran (centre d'aide), et le même mot deux fois ferait deux portes
 * qu'on ne distingue pas.
 */
export function TheoScreenGuide({
  heading,
  intro,
  stepsTitle,
  steps,
  keepTitle,
  keep,
}: {
  heading: string
  intro: string
  stepsTitle: string
  steps: readonly string[]
  keepTitle: string
  keep: string
}) {
  return (
    <details data-theo-block="guide" className="group text-xs text-[var(--bellum-text-secondary)]">
      <summary className="flex min-h-11 w-max max-w-full cursor-pointer list-none items-center gap-2 text-xs text-[var(--bellum-text-accent)] md:min-h-8 [&::-webkit-details-marker]:hidden">
        <CircleHelp className="size-4 shrink-0" aria-hidden="true" />
        <span>{heading}</span>
        <ChevronDown
          className="size-4 shrink-0 transition-transform duration-immediate ease-bellum-out group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <Box className="mt-2 grid gap-6 rounded-card border border-[var(--bellum-border)] bg-card p-4 md:grid-cols-[1.1fr_1.5fr_1fr] md:p-5">
        <Box>
          <Text element="h3" size="base" weight="semibold" className="mb-1.5">
            {heading}
          </Text>
          <Text element="p" size="sm" color="var(--bellum-text-secondary)">
            {intro}
          </Text>
        </Box>
        <Box>
          <Text element="h4" size="sm" weight="semibold" className="mb-1.5">
            {stepsTitle}
          </Text>
          <ol className="list-decimal space-y-1 pl-4 text-sm">
            {steps.map(step => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </Box>
        <Box>
          <Text element="h4" size="sm" weight="semibold" className="mb-1.5">
            {keepTitle}
          </Text>
          <Text element="p" size="sm" color="var(--bellum-text-secondary)">
            {keep}
          </Text>
        </Box>
      </Box>
    </details>
  )
}

/** `.v18-stats` — quatre tuiles sur bureau, deux sous 1024 px (le chiffre ne passe jamais sous le plancher). */
export function TheoStats({ children, label }: { children: ReactNode; label: string }) {
  return (
    <Box
      data-theo-block="stats"
      role="group"
      aria-label={label}
      className="grid grid-cols-2 gap-2 lg:grid-cols-4 lg:gap-3"
    >
      {children}
    </Box>
  )
}

/**
 * `.v18-stat` — un libellé, une valeur, une précision. `accent` = la tuile qui dit quoi faire
 * (fond doux d'accent, valeur en accent). Avec `onPress`, la tuile est un FILTRE (`aria-pressed`).
 */
export function TheoStat({
  id,
  label,
  value,
  sub,
  accent = false,
  pressed,
  onPress,
}: {
  id: string
  label: string
  value: ReactNode
  sub?: ReactNode
  accent?: boolean
  pressed?: boolean
  onPress?: () => void
}) {
  const body = (
    <>
      <Text
        element="span"
        id={`theo-stat-${id}-label`}
        size="xs"
        color="var(--bellum-text-secondary)"
        className="block"
      >
        {label}
      </Text>
      <Text
        element="span"
        id={`theo-stat-${id}-value`}
        size="2xl"
        weight="semibold"
        color={accent ? 'var(--accent-soft-text)' : 'var(--bellum-text-primary)'}
        className="block tabular-nums tracking-tight"
      >
        {value}
      </Text>
      {sub ? (
        <Text element="span" id={`theo-stat-${id}-sub`} size="xs" color="var(--bellum-text-muted)" className="block">
          {sub}
        </Text>
      ) : null}
    </>
  )
  const frame = cn(
    'flex min-h-11 min-w-0 flex-col items-start gap-2 rounded-card border p-3.5 text-left lg:p-4',
    accent ? 'bg-[var(--accent-soft-bg)]' : 'bg-card',
    pressed ? 'border-[var(--bellum-text-accent)]' : 'border-[var(--bellum-border)]',
  )
  if (onPress === undefined) {
    return (
      <Box data-theo-stat={id} className={frame}>
        {body}
      </Box>
    )
  }
  return (
    <button
      type="button"
      data-theo-stat={id}
      aria-pressed={pressed ?? false}
      aria-labelledby={`theo-stat-${id}-label`}
      aria-describedby={`theo-stat-${id}-value${sub ? ` theo-stat-${id}-sub` : ''}`}
      onClick={onPress}
      className={cn(
        frame,
        'transition-colors duration-immediate ease-bellum-out hover:border-[var(--bellum-text-accent)] hover:bg-[var(--bellum-surface-2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
      )}
    >
      {body}
    </button>
  )
}

/** `.v18-toolbar` — les champs étiquetés au-dessus, alignés par le bas ; `trailing` part à droite. */
export function TheoToolbar({ children, trailing }: { children: ReactNode; trailing?: ReactNode }) {
  return (
    <Box data-theo-block="toolbar" className="flex flex-wrap items-end gap-3">
      {children}
      {trailing ? <Box className="ml-auto flex flex-wrap items-center gap-2">{trailing}</Box> : null}
    </Box>
  )
}

/** Un champ de `.v18-toolbar` : l'étiquette au-dessus, en petit. */
export function TheoToolbarField({
  label,
  children,
  grow = false,
}: {
  label: string
  children: ReactNode
  grow?: boolean
}) {
  return (
    <Box className={cn('flex min-w-[8rem] flex-col gap-1.5', grow ? 'flex-[2_1_14rem]' : 'flex-1 md:flex-none')}>
      <Text element="span" size="xs" color="var(--bellum-text-secondary)" aria-hidden="true">
        {label}
      </Text>
      {children}
    </Box>
  )
}

/** `.ht-table-wrap` — le cadre du tableau commun (`ResponsiveTable`) : bordure, rayon de carte. */
export const THEO_TABLE_FRAME = 'rounded-card border border-[var(--bellum-border)] bg-card'

/** Une colonne chiffrée (`.ht-table .num`) : alignée à droite, chiffres tabulaires. */
export const THEO_NUM_COLUMN = 'whitespace-nowrap text-right tabular-nums'

/** `.v18-card` — une carte titrée, son geste à droite du titre. */
export function TheoCard({
  id,
  title,
  lede,
  action,
  children,
  className,
}: {
  id: string
  title: string
  lede?: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section
      aria-labelledby={id}
      data-theo-block="card"
      className={cn('min-w-0 rounded-card border border-[var(--bellum-border)] bg-card p-4 md:p-5', className)}
    >
      <Box className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <Box className="min-w-0">
          <Text element="h2" id={id} size="base" weight="semibold">
            {title}
          </Text>
          {lede ? (
            <Text element="p" size="xs" color="var(--bellum-text-secondary)" className="mt-1">
              {lede}
            </Text>
          ) : null}
        </Box>
        {action}
      </Box>
      {children}
    </section>
  )
}

type DotTone = 'neutral' | 'warning' | 'danger' | 'success' | 'accent'

const DOT_TONE: Record<DotTone, string> = {
  neutral: 'bg-[var(--bellum-border-strong)]',
  warning: 'bg-[var(--warning-soft-text)]',
  danger: 'bg-[var(--danger-soft-text)]',
  success: 'bg-[var(--success-soft-text)]',
  accent: 'bg-[var(--accent-soft-text)]',
}

/** `.ht-row` — une pastille, un fait en gras, sa précision ; un geste à droite si besoin. */
export function TheoDotRow({
  tone,
  title,
  sub,
  action,
}: {
  tone: DotTone
  title: ReactNode
  sub?: ReactNode
  action?: ReactNode
}) {
  return (
    <Box
      data-theo-row={tone}
      className="grid min-h-11 grid-cols-[auto_minmax(0,1fr)] items-center gap-3 border-t border-[var(--bellum-border)] py-2.5 first:border-t-0 md:grid-cols-[auto_minmax(0,1fr)_auto]"
    >
      <span className={cn('size-2.5 shrink-0 rounded-full', DOT_TONE[tone])} aria-hidden="true" />
      <Box className="min-w-0">
        <Text element="p" size="sm" weight="semibold">
          {title}
        </Text>
        {sub ? (
          <Text element="div" size="xs" color="var(--bellum-text-muted)" className="mt-0.5">
            {sub}
          </Text>
        ) : null}
      </Box>
      {action ? (
        <Box className="col-span-full flex flex-wrap gap-1.5 md:col-span-1 md:justify-end">{action}</Box>
      ) : null}
    </Box>
  )
}
