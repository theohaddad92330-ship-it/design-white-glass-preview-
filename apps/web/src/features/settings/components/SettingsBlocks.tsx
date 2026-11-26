import { Box, Text, cn } from '@bellum/ui'
import { Info } from 'lucide-react'
import type { ReactNode } from 'react'

/**
 * La grammaire des Réglages de l'espace (maquettes `settings-espace` / `settings-outils` / `settings-integrations` /
 * `team-admin`, Théo V22 — classes `.v12-*`) : un en-tête de page (eyebrow · h1 · description · action), des onglets
 * soulignés, puis des BLOCS — une carte, un h2, une phrase, un filet, un contenu. Dans un bloc : des champs
 * (`.v12-field`), des rangées de réglage (`.v12-setting-row`), des cases (`.v12-check-row`), un tableau encadré
 * (`.v12-table-wrap`), une note grise (`.v12-note`), un ajout en ligne (`.v12-inline-form`) et, en pied de formulaire,
 * l'état d'enregistrement (`.v12-form-actions`). Un seul h1 par page ; chaque vue d'onglet n'est qu'une pile de blocs.
 */

/** L'en-tête de la page (`.v12-header`) : l'eyebrow accentué, le titre, une description, l'action principale à droite. */
export function SettingsPageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string
  title: string
  description?: string
  actions?: ReactNode
}) {
  return (
    <Box
      as="header"
      data-settings-header=""
      className="mb-6 flex flex-col items-start gap-4 md:mb-7 md:flex-row md:justify-between md:gap-6"
    >
      <Box className="min-w-0">
        {eyebrow ? (
          <Text
            element="p"
            size="xs"
            weight="bold"
            color="text-[var(--bellum-text-accent)]"
            className="mb-2.5 uppercase tracking-widest"
          >
            {eyebrow}
          </Text>
        ) : null}
        <Text
          element="h1"
          size="3xl"
          weight="semibold"
          color="text-[var(--bellum-text-primary)]"
          className="tracking-tight"
        >
          {title}
        </Text>
        {description ? (
          <Text element="p" size="sm" color="text-[var(--bellum-text-secondary)]" className="mt-2">
            {description}
          </Text>
        ) : null}
      </Box>
      {actions ? <Box className="flex shrink-0 flex-wrap gap-2">{actions}</Box> : null}
    </Box>
  )
}

/**
 * Un bloc de réglages (`.v12-setting-block`) : la carte, son h2 et sa phrase séparés du contenu par un filet, l'action
 * du bloc à droite (sous le titre au téléphone). `flush` : le contenu n'a pas de marge haute propre (une liste dont les
 * rangées portent leur filet).
 */
export function SettingsBlock({
  title,
  description,
  action,
  flush = false,
  children,
  className,
  testId,
}: {
  title?: string
  description?: string
  action?: ReactNode
  flush?: boolean
  children?: ReactNode
  className?: string
  testId?: string
}) {
  return (
    <Box
      as="section"
      data-settings-block=""
      data-testid={testId}
      aria-label={title}
      className={cn(
        'mb-5 min-w-0 rounded-card border border-[var(--bellum-border)] bg-card p-4 last:mb-0 md:px-6 md:py-6',
        className,
      )}
    >
      {title ? (
        <Box
          as="header"
          className={cn(
            'flex flex-col items-start gap-3 border-b border-[var(--bellum-border)] pb-4 md:flex-row md:justify-between',
            flush ? 'mb-0' : 'mb-4',
          )}
        >
          <Box className="min-w-0">
            <Text element="h2" size="base" weight="semibold" color="text-[var(--bellum-text-primary)]">
              {title}
            </Text>
            {description ? (
              <Text element="p" size="xs" color="text-[var(--bellum-text-muted)]" className="mt-1">
                {description}
              </Text>
            ) : null}
          </Box>
          {action ? <Box className="flex shrink-0 flex-wrap gap-2">{action}</Box> : null}
        </Box>
      ) : null}
      {children}
    </Box>
  )
}

/**
 * Un groupe nommé de rangées dans un bloc, sans seconde carte (le bloc EST la carte). Avec une `description`, le groupe
 * montre son nom et sa phrase au-dessus de ses rangées (un h3 de la maquette).
 */
export function SettingsRows({
  label,
  description,
  showLabel = false,
  children,
}: {
  label: string
  description?: string
  /** Le nom du groupe se lit à l'écran même sans phrase (un sous-titre de liste). */
  showLabel?: boolean
  children: ReactNode
}) {
  return (
    <Box role="group" aria-label={label} className="min-w-0">
      {description || showLabel ? (
        <Box className="pb-2 pt-1">
          <Text element="h3" size="sm" weight="semibold" color="text-[var(--bellum-text-primary)]">
            {label}
          </Text>
          {description ? (
            <Text element="p" size="xs" color="text-[var(--bellum-text-secondary)]" className="mt-1">
              {description}
            </Text>
          ) : null}
        </Box>
      ) : null}
      {children}
    </Box>
  )
}

/**
 * Une rangée de réglage (`.v12-setting-row`) : son nom (h3), sa phrase, et à droite le contrôle (au téléphone, dessous).
 * Le filet sépare deux rangées ; la dernière n'en a pas.
 */
export function SettingsItem({
  title,
  description,
  control,
  children,
}: {
  title: ReactNode
  description?: ReactNode
  control?: ReactNode
  children?: ReactNode
}) {
  return (
    <Box
      data-settings-row=""
      className="flex flex-col gap-3 border-b border-[var(--bellum-border)] py-4 first:pt-0 last:border-b-0 last:pb-0 md:flex-row md:items-center md:justify-between md:gap-6"
    >
      <Box className="min-w-0">
        <Text element="h3" size="sm" weight="semibold" color="text-[var(--bellum-text-primary)]">
          {title}
        </Text>
        {description ? (
          <Text element="div" size="xs" color="text-[var(--bellum-text-secondary)]" className="mt-1 leading-relaxed">
            {description}
          </Text>
        ) : null}
        {children}
      </Box>
      {control ? <Box className="flex shrink-0 flex-wrap items-center gap-2">{control}</Box> : null}
    </Box>
  )
}

/** Un champ (`.v12-field`) : l'étiquette au-dessus, le contrôle dessous, une aide discrète. */
export function SettingsField({
  label,
  htmlFor,
  hint,
  children,
  className,
}: {
  label: ReactNode
  htmlFor?: string
  hint?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <Box className={cn('flex min-w-0 flex-col gap-2', className)}>
      <label htmlFor={htmlFor} className="text-xs font-medium text-[var(--bellum-text-primary)]">
        {label}
      </label>
      {children}
      {hint ? (
        <Text element="p" size="xs" color="text-[var(--bellum-text-muted)]">
          {hint}
        </Text>
      ) : null}
    </Box>
  )
}

/** Deux colonnes de champs (`.v12-fields`), une seule au téléphone. */
export function SettingsFields({ children, className }: { children: ReactNode; className?: string }) {
  return <Box className={cn('grid grid-cols-1 gap-5 md:grid-cols-2', className)}>{children}</Box>
}

/** Une case à cocher avec son libellé et sa phrase (`.v12-check-row`). */
export function SettingsCheckRow({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: ReactNode
  hint?: ReactNode
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-start gap-2.5 py-1 text-sm leading-relaxed has-[:disabled]:cursor-default">
      <input
        type="checkbox"
        className="mt-1 size-4 shrink-0 accent-[var(--bellum-text-accent)]"
        checked={checked}
        disabled={disabled}
        onChange={event => onChange(event.target.checked)}
      />
      <span className="min-w-0">
        <span className="text-[var(--bellum-text-primary)]">{label}</span>
        {hint ? <span className="mt-1 block text-xs text-[var(--bellum-text-muted)]">{hint}</span> : null}
      </span>
    </label>
  )
}

/** La note grise d'un bloc (`.v12-note`) : une icône d'information, une phrase qui dit ce que le réglage ne fait pas. */
export function SettingsNote({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Box
      role="note"
      className={cn(
        'my-4 flex items-start gap-2.5 rounded-control bg-[var(--bellum-surface-2)] px-3.5 py-3 text-xs leading-relaxed text-[var(--bellum-text-secondary)] first:mt-0 last:mb-0',
        className,
      )}
    >
      <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
      <Box className="min-w-0">{children}</Box>
    </Box>
  )
}

/**
 * Le cadre du tableau commun (`.v12-table-wrap`) : bordure, coins, fond de carte. Le tableau lui-même reste
 * `ResponsiveTable` — le même composant partout (décision Louis) ; ce cadre ne fait que l'habiller.
 */
export function SettingsTableFrame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Box
      data-settings-table=""
      className={cn(
        'min-w-0 overflow-hidden rounded-overlay border border-[var(--bellum-border)] bg-card md:[&_thead_tr]:bg-[var(--bellum-surface-2)] md:[&_td]:px-4 md:[&_td]:py-3.5 md:[&_th]:px-4 md:[&_th]:py-3',
        className,
      )}
    >
      {children}
    </Box>
  )
}

/** L'ajout en ligne sous une liste (`.v12-inline-form`) : un ou deux champs, puis le bouton, alignés en bas. */
export function SettingsInlineForm({
  children,
  onSubmit,
  label,
}: {
  children: ReactNode
  onSubmit: () => void
  label: string
}) {
  return (
    <form
      aria-label={label}
      className="mt-4 flex flex-col gap-2.5 md:flex-row md:items-end [&>*:not(button)]:flex-1"
      onSubmit={event => {
        event.preventDefault()
        onSubmit()
      }}
    >
      {children}
    </form>
  )
}

/** Le pied d'un formulaire de réglages (`.v12-form-actions`) : l'état d'enregistrement à gauche, les boutons à droite. */
export function SettingsFormActions({
  status,
  dirty = false,
  children,
}: {
  status: ReactNode
  dirty?: boolean
  children?: ReactNode
}) {
  return (
    <Box className="mt-1 flex flex-wrap items-center justify-end gap-3">
      <Text
        element="p"
        size="xs"
        aria-live="polite"
        weight={dirty ? 'semibold' : 'normal'}
        color={dirty ? 'text-[var(--bellum-text-primary)]' : 'text-[var(--bellum-text-muted)]'}
        className="mr-auto"
      >
        {status}
      </Text>
      {children}
    </Box>
  )
}

/** Une pile de blocs : la vue d'un onglet. */
export function SettingsStack({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <Box className="flex min-w-0 flex-col gap-5 [&>[data-settings-block]]:mb-0" data-testid={testId}>
      {children}
    </Box>
  )
}

/**
 * La forme d'une rangée de réglage (`.v12-setting-row`) pour une rangée qui porte son propre balisage (un `<form>`,
 * un `<Box display="flex">`) : le filet entre deux rangées, aucune marge latérale (le bloc la porte).
 */
export const SETTINGS_ROW_CLASS =
  'flex flex-col gap-3 border-b border-[var(--bellum-border)] py-4 first:pt-0 last:border-b-0 last:pb-0 md:flex-row md:items-start md:justify-between md:gap-6'

/** La grille de cartes-liens d'un écran de réglages (`.v12-settings-links`) : trois colonnes, une au téléphone. */
export function SettingsLinks({ children, label }: { children: ReactNode; label: string }) {
  return (
    <Box as="nav" aria-label={label} className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-3">
      {children}
    </Box>
  )
}

/** Une carte-lien (`.v12-settings-link`) : un h3, une phrase, puis le geste qui mène où la chose se fait. */
export function SettingsLinkCard({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <Box
      as="article"
      data-settings-link=""
      className="flex min-w-0 flex-col items-start gap-3 rounded-card border border-[var(--bellum-border)] bg-card p-4 md:p-5"
    >
      <Box className="min-w-0 flex-1">
        <Text element="h3" size="sm" weight="semibold" color="text-[var(--bellum-text-primary)]">
          {title}
        </Text>
        <Text element="p" size="xs" color="text-[var(--bellum-text-secondary)]" className="mt-1 leading-relaxed">
          {description}
        </Text>
      </Box>
      {children}
    </Box>
  )
}
