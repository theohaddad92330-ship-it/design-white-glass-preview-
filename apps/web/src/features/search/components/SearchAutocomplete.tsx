import type { CompanySuggestion } from '@bellum/contracts'
import { Input, Popover, PopoverAnchor, PopoverContent } from '@bellum/ui'
import { Search as SearchIcon } from 'lucide-react'
import type { KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { SearchInputLoader } from './SearchInputLoader'
import { registryNameGroups } from '../lib/relatedEntities'
import { SearchSuggestionItem } from './SearchSuggestionItem'

interface SearchAutocompleteProps {
  query: string
  onChange: (value: string) => void
  onEnter: () => void
  suggestions: CompanySuggestion[]
  suggestionsLoading: boolean
  showDropdown: boolean
  onShowDropdown: (show: boolean) => void
  onSelectSuggestion: (suggestion: CompanySuggestion) => void
  /** Overrides the default search-page copy — the onboarding reuse asks for the
   *  user's OWN company, not a prospect. Falls back to `search:autocomplete.placeholder`. */
  placeholder?: string
  /** Accessible name of the input. Defaults to the placeholder. */
  ariaLabel?: string
  autoFocus?: boolean
}

export function SearchAutocomplete({
  query,
  onChange,
  onEnter,
  suggestions,
  suggestionsLoading,
  showDropdown,
  onShowDropdown,
  onSelectSuggestion,
  placeholder,
  ariaLabel,
  autoFocus,
}: SearchAutocompleteProps) {
  const { t } = useTranslation('search')
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') onEnter()
  }

  // #1111 : calculé sur les suggestions DÉJÀ rendues — aucun appel de plus.
  //
  // ⚠️ Le compte est une propriété de la LISTE, pas d'une ligne. Il s'affichait
  // sous chaque suggestion, donc cinq fois le même texte sous cinq lignes
  // (mesuré le 30/08/2026 sur « ROCHE ») : répété à l'identique, il n'aide à
  // choisir entre aucune d'elles — loi 4 du tome 7. Il est annoncé UNE fois, en
  // tête de liste, et les lignes portent ce qui les DISTINGUE.
  const nameGroups = registryNameGroups(suggestions, query)
  const sharedName = [...nameGroups.values()].sort((a, b) => b.count - a.count)[0] ?? null

  const dropdownOpen = showDropdown && suggestions.length > 0

  return (
    <Popover open={dropdownOpen} onOpenChange={onShowDropdown}>
      <PopoverAnchor asChild>
        <div className="relative w-full mb-3">
          <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-[18px] w-[18px] pointer-events-none z-10 text-[var(--text-ghost)]" />
          <SearchInputLoader visible={suggestionsLoading} />
          <Input
            type="text"
            value={query}
            onChange={e => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => {
              if (query.length >= 2 && suggestions.length > 0) onShowDropdown(true)
            }}
            placeholder={placeholder ?? t('autocomplete.placeholder')}
            aria-label={ariaLabel ?? placeholder ?? t('autocomplete.placeholder')}
            autoFocus={autoFocus}
            className="h-14 pl-12 pr-12 text-base text-[color:var(--text-primary)] rounded-lg bg-[var(--bg-glass)] border-[var(--bg-glass-border)] focus-visible:border-violet-500/50 focus-visible:ring-violet-500/20 placeholder:text-[var(--text-ghost)]"
          />
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        sideOffset={4}
        onOpenAutoFocus={e => e.preventDefault()}
        className="p-0 max-h-64 overflow-y-auto bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-md [box-shadow:var(--shadow-elevated)]"
        style={{ width: 'var(--radix-popover-trigger-width)' }}
      >
        {sharedName && (
          <p className="px-2.5 pt-2 pb-1 text-xs leading-4 text-[var(--bellum-text-muted)]">
            {t('suggestion.sameRegistryName', { count: sharedName.count, label: sharedName.label })}
          </p>
        )}
        {suggestions.map(s => (
          <SearchSuggestionItem key={s.siren || s.name} suggestion={s} onSelect={onSelectSuggestion} />
        ))}
      </PopoverContent>
    </Popover>
  )
}
