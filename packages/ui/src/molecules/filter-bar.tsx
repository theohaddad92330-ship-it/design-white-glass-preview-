import { ListFilter, Search, X, type LucideIcon } from 'lucide-react'
import { memo, useMemo, useState } from 'react'
import { Box } from '../atoms/box'
import { Text } from '../atoms/text'
import { Button } from '../components/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '../components/dropdown-menu'
import { Tooltip, TooltipTrigger, TooltipContent } from '../components/tooltip'
import { cn } from '../lib/utils'
import { TooltipButton } from './tooltip-button'

/* -------------------------------------------------------------------- */
/*  Types                                                               */
/* -------------------------------------------------------------------- */

export type FilterOption = {
  value: string
  label: string
  icon?: LucideIcon
  iconClassName?: string
  /** Compteur affiché à droite (ex. `5 issues`). Optionnel. */
  count?: number
  /** Suffixe texte du compteur — défaut `''`. */
  countLabel?: string
}

type BaseDef = {
  /** Identifiant stable, utilisé comme clé URL et comme `id` côté state. */
  id: string
  /** Libellé affiché dans le menu d'ajout et dans la chip. */
  label: string
  /** Icône optionnelle affichée dans le menu et dans la chip. */
  icon?: LucideIcon
  /** Verbe affiché entre la clé et la valeur dans la chip — défaut `est` (select) ou `contient` (text). */
  verb?: string
}

/** Filtre à choix unique parmi une liste fermée d'options (statut, rôle…). */
export type SelectFilterDefinition = BaseDef & {
  type?: 'select'
  options: FilterOption[]
}

/** Filtre texte libre — l'utilisateur tape, le service fait un `ILIKE`. */
export type TextFilterDefinition = BaseDef & {
  type: 'text'
  placeholder?: string
}

export type FilterDefinition = SelectFilterDefinition | TextFilterDefinition

export type ActiveFilter = {
  id: string
  value: string
}

/* -------------------------------------------------------------------- */
/*  Helpers                                                             */
/* -------------------------------------------------------------------- */

function findDefinition(definitions: FilterDefinition[], id: string): FilterDefinition | undefined {
  return definitions.find(d => d.id === id)
}

function findOption(definition: FilterDefinition | undefined, value: string): FilterOption | undefined {
  if (!definition || (definition.type ?? 'select') !== 'select') return undefined
  return (definition as SelectFilterDefinition).options.find(o => o.value === value)
}

/* -------------------------------------------------------------------- */
/*  Searchable input — réutilisé dans le menu principal et les subs    */
/* -------------------------------------------------------------------- */

type MenuSearchInputProps = {
  value: string
  onChange: (next: string) => void
  placeholder?: string
  autoFocus?: boolean
}

function MenuSearchInput({ value, onChange, placeholder = 'Filter...', autoFocus }: MenuSearchInputProps) {
  return (
    <input
      autoFocus={autoFocus}
      value={value}
      onChange={e => onChange(e.target.value)}
      // stopPropagation : sinon Radix capture les flèches / lettres pour
      // sa navigation roving-focus → on ne pourrait plus taper.
      onKeyDown={e => e.stopPropagation()}
      placeholder={placeholder}
      className="w-full bg-transparent outline-none text-sm text-[var(--text-primary)] placeholder:text-[var(--text-ghost)]"
    />
  )
}

/* -------------------------------------------------------------------- */
/*  Sub-content : sélection d'une valeur (select)                       */
/* -------------------------------------------------------------------- */

type SelectSubContentProps = {
  definition: SelectFilterDefinition
  onPick: (value: string) => void
}

function SelectSubContent({ definition, onPick }: SelectSubContentProps) {
  const [search, setSearch] = useState('')

  const filteredOptions = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return definition.options
    return definition.options.filter(o => o.label.toLowerCase().includes(q))
  }, [definition.options, search])

  return (
    <DropdownMenuSubContent className="w-56 bg-[var(--bellum-surface-1)] border border-[var(--border-subtle)] p-1.5">
      <Box display="flex" className="items-center gap-2 px-1.5 pb-1.5 mb-1 border-b border-[var(--border-subtle)]">
        <MenuSearchInput value={search} onChange={setSearch} autoFocus />
      </Box>
      <Box className="max-h-72 overflow-y-auto">
        {filteredOptions.length === 0 ? (
          <Box px={3} py={1.5}>
            <Text size="xs" color="text-[var(--text-ghost)]">
              Aucune valeur.
            </Text>
          </Box>
        ) : (
          filteredOptions.map(opt => (
            <DropdownMenuItem key={opt.value} onSelect={() => onPick(opt.value)} className="flex items-center gap-2">
              <Box display="flex" className="min-w-0 flex-1 items-center gap-2">
                {opt.icon && (
                  <opt.icon className={cn('size-3.5 shrink-0 text-[var(--text-muted)]', opt.iconClassName)} />
                )}
                <span className="truncate text-sm text-[var(--text-primary)]">{opt.label}</span>
              </Box>
              {opt.count != null && (
                <Text element="span" size="xs" color="text-[var(--text-ghost)]">
                  {opt.count} {opt.countLabel ?? ''}
                </Text>
              )}
            </DropdownMenuItem>
          ))
        )}
      </Box>
    </DropdownMenuSubContent>
  )
}

/* -------------------------------------------------------------------- */
/*  Sub-content : saisie libre (text)                                   */
/* -------------------------------------------------------------------- */

type TextSubContentProps = {
  definition: TextFilterDefinition
  initialValue?: string
  onCommit: (value: string) => void
}

function TextSubContent({ definition, initialValue = '', onCommit }: TextSubContentProps) {
  const [draft, setDraft] = useState(initialValue)

  function commit() {
    const trimmed = draft.trim()
    if (trimmed.length === 0) return
    onCommit(trimmed)
  }

  return (
    <DropdownMenuSubContent className="w-56 bg-[var(--bellum-surface-1)] border border-[var(--border-subtle)] p-1.5">
      <input
        autoFocus
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => {
          e.stopPropagation()
          if (e.key === 'Enter') commit()
        }}
        placeholder={definition.placeholder ?? 'Filtrer…'}
        className="w-full h-8 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-base)] px-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-ghost)] outline-none focus-visible:ring-1 focus-visible:ring-[color-mix(in_srgb,var(--bellum-primary-500)_40%,transparent)]"
      />
      <Box display="flex" className="justify-end pt-1.5">
        <Button variant="violet" size="xs" onClick={commit}>
          Appliquer
        </Button>
      </Box>
    </DropdownMenuSubContent>
  )
}

/* -------------------------------------------------------------------- */
/*  Filter row dans le menu d'ajout                                     */
/* -------------------------------------------------------------------- */

type FilterRowProps = {
  definition: FilterDefinition
  onAdd: (filterId: string, value: string) => void
  closeMenu: () => void
}

function FilterRow({ definition, onAdd, closeMenu }: FilterRowProps) {
  const Icon = definition.icon
  const isText = definition.type === 'text'

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className="text-sm">
        <Box display="flex" className="items-center gap-2 flex-1">
          {Icon && <Icon className="size-3.5 text-[var(--text-muted)]" />}
          <span>{definition.label}</span>
        </Box>
      </DropdownMenuSubTrigger>
      {isText ? (
        <TextSubContent
          definition={definition as TextFilterDefinition}
          onCommit={value => {
            onAdd(definition.id, value)
            closeMenu()
          }}
        />
      ) : (
        <SelectSubContent
          definition={definition as SelectFilterDefinition}
          onPick={value => {
            onAdd(definition.id, value)
            closeMenu()
          }}
        />
      )}
    </DropdownMenuSub>
  )
}

/* -------------------------------------------------------------------- */
/*  Chip — édition de la valeur d'une chip existante                    */
/* -------------------------------------------------------------------- */

type SelectChipProps = {
  definition: SelectFilterDefinition
  value: string
  onValueChange: (next: string) => void
}

function SelectChipValue({ definition, value, onValueChange }: SelectChipProps) {
  const option = findOption(definition, value)
  const [search, setSearch] = useState('')

  const filteredOptions = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return definition.options
    return definition.options.filter(o => o.label.toLowerCase().includes(q))
  }, [definition.options, search])

  return (
    <DropdownMenu onOpenChange={next => !next && setSearch('')}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex h-full items-center gap-1.5 border-l border-[var(--border-subtle)] px-2 text-[var(--text-primary)] transition-colors hover:bg-[var(--bellum-surface-2)]"
        >
          {option?.icon && (
            <option.icon className={cn('size-3.5 shrink-0 text-[var(--text-muted)]', option.iconClassName)} />
          )}
          <span className="truncate">{option?.label ?? value}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-56 bg-[var(--bellum-surface-1)] border border-[var(--border-subtle)] p-1.5"
      >
        <Box display="flex" className="items-center gap-2 px-1.5 pb-1.5 mb-1 border-b border-[var(--border-subtle)]">
          <MenuSearchInput value={search} onChange={setSearch} autoFocus />
        </Box>
        <Box className="max-h-72 overflow-y-auto">
          {filteredOptions.map(opt => (
            <DropdownMenuItem
              key={opt.value}
              onSelect={() => onValueChange(opt.value)}
              className="flex items-center gap-2"
            >
              {opt.icon && <opt.icon className={cn('size-3.5 shrink-0 text-[var(--text-muted)]', opt.iconClassName)} />}
              <span className="truncate">{opt.label}</span>
            </DropdownMenuItem>
          ))}
        </Box>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

type TextChipProps = {
  definition: TextFilterDefinition
  value: string
  onValueChange: (next: string) => void
}

function TextChipValue({ definition, value, onValueChange }: TextChipProps) {
  const [open, setOpen] = useState(false)

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="h-full px-2 border-l border-[var(--border-subtle)] text-[var(--text-primary)] hover:bg-[var(--bg-glass)] transition-colors max-w-[12rem] truncate"
        >
          {value || `"…"`}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-56 bg-[var(--bellum-surface-1)] border border-[var(--border-subtle)] p-1.5"
      >
        <input
          autoFocus
          defaultValue={value}
          onKeyDown={e => {
            e.stopPropagation()
            if (e.key === 'Enter') {
              const trimmed = e.currentTarget.value.trim()
              if (trimmed.length > 0 && trimmed !== value) onValueChange(trimmed)
              setOpen(false)
            }
          }}
          placeholder={definition.placeholder ?? 'Filtrer…'}
          className="w-full h-8 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-base)] px-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-ghost)] outline-none focus-visible:ring-1 focus-visible:ring-[color-mix(in_srgb,var(--bellum-primary-500)_40%,transparent)]"
        />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/* -------------------------------------------------------------------- */
/*  Chip                                                                */
/* -------------------------------------------------------------------- */

type FilterChipProps = {
  definition: FilterDefinition
  value: string
  onValueChange: (next: string) => void
  onRemove: () => void
}

const FilterChip = memo<FilterChipProps>(function FilterChip({ definition, value, onValueChange, onRemove }) {
  const Icon = definition.icon
  const isText = definition.type === 'text'
  const verb = definition.verb ?? (isText ? 'contient' : 'est')

  return (
    <Box
      display="flex"
      className="items-center h-6 rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] text-xs overflow-hidden"
    >
      <Box display="flex" className="items-center gap-1.5 px-2 text-[var(--text-muted)]">
        {Icon && <Icon className="size-3.5" />}
        <Text element="span" size="xs" color="text-[var(--text-secondary)]">
          {definition.label}
        </Text>
        <Text element="span" size="xs" color="text-[var(--text-ghost)]">
          {verb}
        </Text>
      </Box>

      {isText ? (
        <TextChipValue definition={definition as TextFilterDefinition} value={value} onValueChange={onValueChange} />
      ) : (
        <SelectChipValue
          definition={definition as SelectFilterDefinition}
          value={value}
          onValueChange={onValueChange}
        />
      )}

      <TooltipButton
        tooltip="Retirer le filtre"
        variant="ghost"
        size="icon"
        type="button"
        onClick={onRemove}
        aria-label={`Retirer le filtre ${definition.label}`}
      >
        <X className="size-3.5" />
      </TooltipButton>
    </Box>
  )
})

/* -------------------------------------------------------------------- */
/*  AddFilterButton (toolbar trigger)                                   */
/* -------------------------------------------------------------------- */

type AddFilterButtonProps = {
  definitions: FilterDefinition[]
  onAdd: (filterId: string, value: string) => void
  /** Si `true`, le bouton porte un point d'accent pour signaler des filtres actifs. */
  hasActive?: boolean
  /**
   * #1316.3 — « afficher clairement Filtres à côté de l'icône ».
   *
   * Une icône seule se devine ; sur une barre qui porte déjà une recherche, un
   * lien et une bascule, l'entonnoir ne se distingue pas d'un tri. Quand un
   * libellé est fourni, il s'affiche À CÔTÉ de l'icône et devient le nom
   * accessible du bouton — l'infobulle n'a alors plus rien à ajouter.
   *
   * Optionnel, et le défaut reste l'icône seule : les autres barres du produit
   * n'ont pas la place, et changer leur gabarit n'était pas demandé. Le nom
   * accessible ne disparaît jamais (GA-32).
   */
  label?: string
  className?: string
}

/**
 * Bouton de toolbar Linear-style. Clic → menu listant les types de
 * filtres ; survol/clic d'un type → sous-menu avec recherche +
 * valeurs (ou input texte selon le type). Pas d'état interne pour
 * la navigation : Radix gère les sous-menus.
 */
export const AddFilterButton = memo<AddFilterButtonProps>(function AddFilterButton({
  definitions,
  onAdd,
  hasActive,
  label,
  className,
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  const filteredDefs = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return definitions
    return definitions.filter(d => d.label.toLowerCase().includes(q))
  }, [definitions, search])

  return (
    <DropdownMenu
      open={open}
      onOpenChange={next => {
        setOpen(next)
        if (!next) setSearch('')
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size={label ? 'sm' : 'icon'}
              aria-label={label ?? 'Ajouter un filtre'}
              className={cn(
                'relative rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
                label ? 'h-8 gap-1.5 px-2.5' : 'size-8',
                hasActive && 'text-[var(--text-primary)]',
                className,
              )}
            >
              <ListFilter className="size-4" />
              {/* #1316.3 — le mot à côté de l'entonnoir. */}
              {label && <span className="text-sm">{label}</span>}
              {hasActive && (
                <span
                  className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-[var(--bellum-primary-500)]"
                  aria-hidden
                />
              )}
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        {/* #1316.3 — quand le mot est À L'ÉCRAN, l'infobulle qui le répète est
            du bruit : elle ne s'affiche que pour le bouton en icône seule. */}
        {!label && <TooltipContent side="bottom">Ajouter un filtre</TooltipContent>}
      </Tooltip>
      <DropdownMenuContent
        align="end"
        sideOffset={6}
        className="w-64 bg-[var(--bellum-surface-1)] border border-[var(--border-subtle)] p-1.5"
      >
        <Box display="flex" className="items-center gap-2 px-1.5 pb-1.5 mb-1 border-b border-[var(--border-subtle)]">
          <Search className="size-3.5 text-[var(--text-ghost)] shrink-0" />
          <MenuSearchInput value={search} onChange={setSearch} placeholder="Ajouter un filtre" autoFocus />
        </Box>
        <Box className="max-h-96 overflow-y-auto">
          {filteredDefs.length === 0 ? (
            <Box px={3} py={1.5}>
              <Text size="xs" color="text-[var(--text-ghost)]">
                Aucun filtre.
              </Text>
            </Box>
          ) : (
            filteredDefs.map(def => (
              <FilterRow key={def.id} definition={def} onAdd={onAdd} closeMenu={() => setOpen(false)} />
            ))
          )}
        </Box>
      </DropdownMenuContent>
    </DropdownMenu>
  )
})

/* -------------------------------------------------------------------- */
/*  FilterBar                                                           */
/* -------------------------------------------------------------------- */

export type FilterBarProps = {
  definitions: FilterDefinition[]
  active: ActiveFilter[]
  onChange: (next: ActiveFilter[]) => void
  /** Si fourni, affiche un bouton `Clear` à droite quand au moins une chip est active. */
  onClear?: () => void
  className?: string
}

/**
 * Linear-style filter bar — rangée de chips actives. Le bouton
 * d'ajout (`AddFilterButton`) vit côté toolbar (à droite de la
 * recherche) et est exporté séparément. La barre se cache quand
 * aucun filtre n'est actif.
 */
export const FilterBar = memo<FilterBarProps>(function FilterBar({
  definitions,
  active,
  onChange,
  onClear,
  className,
}) {
  if (active.length === 0) return null

  const handleValueChange = (id: string, next: string) => {
    onChange(active.map(a => (a.id === id ? { ...a, value: next } : a)))
  }
  const handleRemove = (id: string) => {
    onChange(active.filter(a => a.id !== id))
  }

  return (
    <Box
      display="flex"
      className={cn('items-center gap-2 flex-wrap bg-[var(--bellum-surface-2)] rounded-lg mx-6 py-2', className)}
    >
      {active.map(({ id, value }) => {
        const def = findDefinition(definitions, id)
        if (!def) return null
        return (
          <FilterChip
            key={id}
            definition={def}
            value={value}
            onValueChange={next => handleValueChange(id, next)}
            onRemove={() => handleRemove(id)}
          />
        )
      })}

      {onClear && (
        <Box display="flex" className="ml-auto items-center gap-2">
          <TooltipButton
            tooltip="Effacer tous les filtres"
            variant="ghost"
            size="xs"
            onClick={onClear}
            className="hover:bg-[var(--bellum-border)]"
          >
            Effacer
          </TooltipButton>
        </Box>
      )}
    </Box>
  )
})
