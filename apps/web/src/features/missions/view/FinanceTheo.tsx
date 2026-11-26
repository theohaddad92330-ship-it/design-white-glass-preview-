import {
  Box,
  Button,
  cn,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  Text,
} from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { ChevronDown } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * La GRAMMAIRE des trois écrans financiers de Missions — Factures, Encaissements, Vue
 * financière (Théo V22, `.v18-*` des maquettes appliquées `c/missions-*.html`).
 *
 * Une pièce = une classe de la maquette : tuile (`.v18-stat`), carte (`.v18-card`), ligne de
 * contrôle (`.v18-control-row`), barre de filtres (`.v18-toolbar`), titre de section
 * (`.v18-inline-title`), mise en garde (`.v18-data-warning`). Les trois écrans la partagent :
 * trois copies divergeraient (GA-26). Les jetons sont ceux de la coque (`COQUE.md` §4) — aucune
 * couleur écrite à la main, aucune taille sous `text-xs`.
 */

/** Le corps du guide « Comment travailler ici ? » d'un écran (`.v18-guide-body`), passé à `CustomerPage`. */
export function FinanceGuide({ guideKey }: { guideKey: string }) {
  const { t } = useTranslation('missions')
  return (
    <Box className="grid gap-4 md:grid-cols-3">
      <Box className="space-y-1">
        <Text element="h3" size="sm" weight="semibold">
          {t(`${guideKey}.heading`)}
        </Text>
        <Text element="p" size="xs" color="text-muted-foreground">
          {t(`${guideKey}.intro`)}
        </Text>
      </Box>
      <Box className="space-y-1">
        <Text element="h4" size="xs" weight="semibold">
          {t(`${guideKey}.stepsTitle`)}
        </Text>
        <ol className="list-decimal space-y-0.5 pl-5 text-xs text-muted-foreground">
          <li>{t(`${guideKey}.step1`)}</li>
          <li>{t(`${guideKey}.step2`)}</li>
          <li>{t(`${guideKey}.step3`)}</li>
        </ol>
      </Box>
      <Box className="space-y-1">
        <Text element="h4" size="xs" weight="semibold">
          {t(`${guideKey}.keepTitle`)}
        </Text>
        <Text element="p" size="xs" color="text-muted-foreground">
          {t(`${guideKey}.keep`)}
        </Text>
      </Box>
    </Box>
  )
}

/** La rangée de quatre tuiles (`.v18-stats`). */
export function FinanceStats({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <Box role="group" aria-label={label} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {children}
    </Box>
  )
}

type StatTarget = '/missions/factures' | '/missions/encaissements'

/**
 * Une tuile (`.v18-stat`) : un libellé, un chiffre, une note. Cliquable quand elle FILTRE
 * (`onClick`) ou MÈNE (`to`) ; sinon un simple bloc — jamais un bouton qui ne fait rien.
 */
export function FinanceStat({
  label,
  value,
  note,
  accent = false,
  selected,
  onClick,
  to,
}: {
  label: string
  value: ReactNode
  note?: ReactNode
  accent?: boolean
  selected?: boolean
  onClick?: () => void
  to?: StatTarget
}) {
  const body = (
    <>
      <Text element="span" size="xs" color="text-[var(--bellum-text-secondary)]" className="block">
        {label}
      </Text>
      <Text
        element="span"
        size="2xl"
        weight="semibold"
        className={cn('block tabular-nums tracking-tight', accent && 'text-[var(--bellum-text-accent)]')}
      >
        {value}
      </Text>
      {note ? (
        <Text element="span" size="xs" color="text-[var(--bellum-text-muted)]" className="block">
          {note}
        </Text>
      ) : null}
    </>
  )
  const className = cn(
    'flex min-w-0 flex-col items-start gap-2 rounded-card border p-4 text-left',
    accent ? 'border-[var(--bellum-border)] bg-[var(--accent-soft-bg)]' : 'border-[var(--bellum-border)] bg-card',
    selected && 'border-[var(--bellum-text-accent)]',
  )
  const interactive =
    'min-h-11 transition-colors duration-immediate ease-bellum-out hover:border-[var(--bellum-text-accent)] hover:bg-[var(--bellum-surface-2)]'
  if (to) {
    return (
      <Link to={to} className={cn(className, interactive)}>
        {body}
      </Link>
    )
  }
  if (onClick) {
    return (
      <button type="button" aria-pressed={selected} onClick={onClick} className={cn(className, interactive)}>
        {body}
      </button>
    )
  }
  return <Box className={className}>{body}</Box>
}

/** Une carte (`.v18-card`) et son en-tête (`.v18-card-head`) : un h2, ses gestes à droite. */
export function FinanceCard({
  title,
  titleId,
  actions,
  children,
  className,
  id,
}: {
  title: string
  titleId: string
  actions?: ReactNode
  children: ReactNode
  className?: string
  id?: string
}) {
  return (
    <section
      id={id}
      aria-labelledby={titleId}
      className={cn('min-w-0 rounded-card border border-[var(--bellum-border)] bg-card p-5', className)}
    >
      <Box className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <Text element="h2" id={titleId} size="base" weight="semibold">
          {title}
        </Text>
        {actions ? <Box className="flex flex-wrap items-center gap-2">{actions}</Box> : null}
      </Box>
      {children}
    </section>
  )
}

/** Le titre d'une section à plat (`.v18-inline-title`) : un h2, et à droite une pastille ou un geste. */
export function InlineTitle({ title, titleId, children }: { title: string; titleId: string; children?: ReactNode }) {
  return (
    <Box className="mb-3 mt-6 flex flex-wrap items-center justify-between gap-2">
      <Text element="h2" id={titleId} size="lg" weight="semibold">
        {title}
      </Text>
      {children ? <Box className="flex flex-wrap items-center gap-2">{children}</Box> : null}
    </Box>
  )
}

const TONE_DOT: Readonly<Record<'ok' | 'warn' | 'bad' | 'neutral', string>> = {
  ok: 'bg-[var(--success-soft-text)]',
  warn: 'bg-[var(--warning-soft-text)]',
  bad: 'bg-[var(--danger-soft-text)]',
  neutral: 'bg-[var(--bellum-text-muted)]',
}

/**
 * Une ligne de contrôle (`.v18-control-row`) : une pastille d'état, le fait en gras, ses
 * précisions, et les gestes à droite. La liste dense des files (échéances, règlements, journal).
 */
export function ControlRow({
  tone = 'neutral',
  title,
  children,
  actions,
  as: Element = 'div',
}: {
  tone?: 'ok' | 'warn' | 'bad' | 'neutral'
  title: ReactNode
  children?: ReactNode
  actions?: ReactNode
  as?: 'div' | 'li'
}) {
  return (
    <Element className="grid grid-cols-[1rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2 border-b border-[var(--bellum-border)] py-3 last:border-b-0 sm:grid-cols-[1rem_minmax(0,1fr)_auto]">
      <span aria-hidden="true" className={cn('size-2 rounded-full', TONE_DOT[tone])} />
      <Box className="min-w-0 space-y-0.5">
        <Text element="p" size="sm" weight="semibold" className="break-words">
          {title}
        </Text>
        {children}
      </Box>
      {actions ? <Box className="col-start-2 flex flex-wrap items-center gap-1 sm:col-start-3">{actions}</Box> : null}
    </Element>
  )
}

/** Une ligne de précision sous le fait d'une `ControlRow`. */
export function RowLine({ children, tone }: { children: ReactNode; tone?: 'warn' | 'bad' }) {
  return (
    <Text
      element="p"
      size="xs"
      color={
        tone === 'warn'
          ? 'text-[var(--warning-soft-text)]'
          : tone === 'bad'
            ? 'text-[var(--danger-soft-text)]'
            : 'text-[var(--bellum-text-secondary)]'
      }
      className="break-words"
    >
      {children}
    </Text>
  )
}

/** La barre de filtres (`.v18-toolbar`) : des champs étiquetés, alignés par le bas. */
export function FinanceToolbar({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <Box role="group" aria-label={label} className="flex flex-wrap items-end gap-3">
      {children}
    </Box>
  )
}

/** Un champ de la barre : son étiquette au-dessus (`.v18-toolbar label`). */
export function ToolbarField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box className="flex min-w-0 flex-col gap-1.5">
      <Text element="span" size="xs" color="text-[var(--bellum-text-secondary)]">
        {label}
      </Text>
      {children}
    </Box>
  )
}

/** La recherche de la barre (`input[type=search]`). */
export function ToolbarSearch({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string
  placeholder: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <ToolbarField label={label}>
      <Input
        type="search"
        className="min-h-11 w-full sm:w-56 md:min-h-9"
        value={value}
        onChange={event => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={label}
      />
    </ToolbarField>
  )
}

/**
 * Un filtre à CHOIX MULTIPLE (Louis 23/10) sous la forme d'un sélecteur de la maquette
 * (`.v18-toolbar select`) : l'étiquette au-dessus, « Tous les … » tant que rien n'est coché,
 * le nom quand un seul l'est, « N choisis » au-delà. Un filtre sans choix possible ne s'affiche pas.
 */
export function MultiSelectFilter({
  label,
  allLabel,
  options,
  values,
  onChange,
}: {
  label: string
  allLabel: string
  options: readonly { value: string; label: string }[]
  values: readonly string[]
  onChange: (values: string[]) => void
}) {
  const { t } = useTranslation('missions')
  if (options.length < 2) return null
  const chosen = options.filter(option => values.includes(option.value))
  const summary =
    chosen.length === 0
      ? allLabel
      : chosen.length === 1
        ? (chosen[0]?.label ?? allLabel)
        : t('financeFilters.chosen', { count: chosen.length })
  return (
    <ToolbarField label={label}>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            aria-label={`${label} : ${summary}`}
            className="min-h-11 w-full justify-between gap-2 font-normal sm:w-48 md:min-h-9"
          >
            <span className="truncate">{summary}</span>
            <ChevronDown className="size-4 shrink-0" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-80 overflow-y-auto">
          {options.map(option => (
            <DropdownMenuCheckboxItem
              key={option.value}
              checked={values.includes(option.value)}
              onSelect={event => event.preventDefault()}
              onCheckedChange={checked =>
                onChange(checked ? [...values, option.value] : values.filter(one => one !== option.value))
              }
            >
              {option.label}
            </DropdownMenuCheckboxItem>
          ))}
          {values.length > 0 ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => onChange([])}>{allLabel}</DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </ToolbarField>
  )
}

/** La mise en garde sous un bloc (`.v18-data-warning`) : ce que le chiffre n'est PAS. */
export function DataWarning({ children }: { children: ReactNode }) {
  return (
    <Text element="p" size="xs" color="text-[var(--bellum-text-muted)]" className="mt-2">
      {children}
    </Text>
  )
}

/** Une ligne de total (`.v18-ledger-total`) : un libellé à gauche, un montant à droite. */
export function LedgerLine({ label, note, value }: { label: string; note?: ReactNode; value: ReactNode }) {
  return (
    <Box className="flex items-baseline justify-between gap-5 border-b border-[var(--bellum-border)] py-2.5 text-sm last:border-b-0">
      <Text element="span" size="sm">
        {label}
        {note ? (
          <Text element="span" size="xs" color="text-[var(--bellum-text-muted)]" className="ml-1">
            {note}
          </Text>
        ) : null}
      </Text>
      <Text element="span" size="sm" weight="semibold" className="whitespace-nowrap tabular-nums">
        {value}
      </Text>
    </Box>
  )
}

/** Le bandeau (`.t-banner`) : un fait en gras, sa précision, un geste. */
export function FinanceBanner({
  tone = 'neutral',
  title,
  body,
  action,
}: {
  tone?: 'neutral' | 'warn' | 'bad'
  title: string
  body?: ReactNode
  action?: ReactNode
}) {
  return (
    <Box
      role="status"
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 rounded-card border p-3',
        tone === 'warn'
          ? 'border-[var(--warning-soft-border)] bg-[var(--warning-soft-bg)]'
          : tone === 'bad'
            ? 'border-[var(--danger-soft-border)] bg-[var(--danger-soft-bg)]'
            : 'border-[var(--bellum-border)] bg-[var(--bellum-surface-2)]',
      )}
    >
      <Box className="min-w-0 flex-1">
        <Text element="p" size="sm" weight="semibold">
          {title}
        </Text>
        {body ? (
          <Text element="p" size="xs" color="text-[var(--bellum-text-secondary)]">
            {body}
          </Text>
        ) : null}
      </Box>
      {action}
    </Box>
  )
}
