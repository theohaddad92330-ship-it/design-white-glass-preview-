import type { AccountListItem, CompanySuggestion, WorkspaceMarket } from '@bellum/contracts'
import { BrailleLoader, Button, cn } from '@bellum/ui'
import { Briefcase, ChevronRight, Search } from 'lucide-react'
import { useId, type FocusEvent, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useLateGroup } from '@/hooks/useLateGroup'
import { registryNameGroups } from '../lib/relatedEntities'
import { AccentField, ACCENT_INPUT, CompanyLogo } from './AnalyzeChrome'
import { SearchCountrySelector } from './SearchCountrySelector'

type CompanySearchBoxProps = {
  query: string
  onQueryChange: (next: string) => void
  onSubmit: () => void
  suggestions: CompanySuggestion[]
  suggestionsLoading: boolean
  /** Requête réellement servie quand la saisie exacte n'a rien donné (#1099). */
  broadenedFrom?: string | undefined
  /** La source n'a pas répondu — jamais « rien trouvé » (#1107/#1109). */
  sourceUnavailable?: boolean
  showDropdown: boolean
  onShowDropdown: (show: boolean) => void
  onSelectSuggestion: (suggestion: CompanySuggestion) => void
  country: WorkspaceMarket
  onCountryChange: (next: WorkspaceMarket) => void
  /** « Dans ton portefeuille » : les comptes de l'espace dont le nom contient la saisie. */
  portfolioMatches: readonly AccountListItem[]
  onAddToPortfolio?: (suggestion: CompanySuggestion) => void
  addingToPortfolioSiren?: string | null
}

/** Un compte de l'espace lu comme une entreprise choisissable — jamais une donnée inventée. */
function suggestionOfAccount(account: AccountListItem): CompanySuggestion {
  return { name: account.company_name, siren: account.siren ?? '', city: '', sector: account.sector ?? '' }
}

/**
 * Le champ de recherche d'entreprise de l'écran « Analyser un compte » (refonte Théo R1) : une barre
 * (loupe, saisie, pays) et, dessous, la liste de résultats en deux groupes — « Dans ton portefeuille »
 * puis « Registre des entreprises ». Chaque ligne dit ce qui DIFFÉRENCIE deux homonymes (ville, activité,
 * effectif publié, SIREN) et marque, sans jamais la masquer, une entité cessée ou un confrère.
 */
export function CompanySearchBox({
  query,
  onQueryChange,
  onSubmit,
  suggestions,
  suggestionsLoading,
  broadenedFrom,
  sourceUnavailable = false,
  showDropdown,
  onShowDropdown,
  onSelectSuggestion,
  country,
  onCountryChange,
  portfolioMatches,
  onAddToPortfolio,
  addingToPortfolioSiren,
}: CompanySearchBoxProps) {
  const { t } = useTranslation('search')
  const listId = useId()
  const nameGroups = registryNameGroups(suggestions, query)
  const sharedName = [...nameGroups.values()].sort((a, b) => b.count - a.count)[0] ?? null
  const open = showDropdown && query.trim().length >= 2
  const isForeignMarket = country !== 'FR'

  // Ordre stable sous le pointeur : si le groupe « portefeuille » n'arrive qu'APRÈS les premiers résultats du
  // registre (réponses en deux temps), il s'insère SOUS eux, jamais au-dessus — un clic ne tombe pas sur une autre entité.
  const portfolioAfterRegistry = useLateGroup(open, query, portfolioMatches.length > 0, suggestions.length > 0)
  const portfolioGroup = (
    <>
      {portfolioMatches.length > 0 ? (
        <>
          <GroupLabel>{t('analyze.company.portfolioGroup')}</GroupLabel>
          {portfolioMatches.map(account => (
            <ResultRow
              key={account.id}
              suggestion={suggestionOfAccount(account)}
              logo={account.logo_url}
              onSelect={onSelectSuggestion}
              country={country}
              detail={[account.sector, account.owner?.name].filter(Boolean).join(' · ')}
            />
          ))}
        </>
      ) : null}
    </>
  )

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      onShowDropdown(false)
      onSubmit()
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      onShowDropdown(false)
    }
  }

  // La liste se ferme quand le focus quitte tout le bloc (barre + liste), jamais sur un clic dans la liste.
  const handleBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) onShowDropdown(false)
  }

  return (
    <div className="relative" onBlur={handleBlur}>
      <AccentField
        icon={Search}
        trailing={
          <>
            {suggestionsLoading ? <BrailleLoader variant="grid-searching" /> : null}
            <SearchCountrySelector value={country} onChange={onCountryChange} />
          </>
        }
      >
        <input
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          value={query}
          // Le champ est LA prochaine action de la page : seulement vide, un brouillon pré-rempli ne
          // doit pas rouvrir la liste au chargement.
          autoFocus={query.trim().length === 0}
          onChange={event => {
            const value = event.target.value
            onQueryChange(value)
            onShowDropdown(value.trim().length >= 2)
          }}
          onFocus={() => {
            if (query.trim().length >= 2) onShowDropdown(true)
          }}
          onKeyDown={handleKeyDown}
          placeholder={t('composer.companyPlaceholder')}
          aria-label={t('composer.companyAriaLabel')}
          className={`${ACCENT_INPUT} h-14`}
        />
      </AccentField>

      {open ? (
        <div
          id={listId}
          role="listbox"
          aria-label={t('analyze.company.listLabel')}
          // Un clic dans la liste ne doit pas retirer le focus du champ.
          onMouseDown={event => event.preventDefault()}
          className="absolute inset-x-0 top-full z-overlay mt-2 max-h-[min(20rem,45dvh)] overflow-y-auto rounded-overlay border border-[var(--bellum-border-strong)] bg-card p-1.5 shadow-overlay"
        >
          {portfolioAfterRegistry ? null : portfolioGroup}

          <GroupLabel>{t('analyze.company.registryGroup')}</GroupLabel>
          {broadenedFrom && suggestions.length > 0 ? (
            <p className="px-2.5 pb-1 text-xs text-[var(--bellum-text-muted)]">
              {t('composer.broadenedTo', { query: broadenedFrom })}
            </p>
          ) : null}
          {suggestionsLoading && suggestions.length === 0 ? (
            <div className="flex items-center gap-2 px-2.5 py-2 text-xs text-[var(--bellum-text-secondary)]">
              <BrailleLoader variant="grid-searching" />
              {t('composer.searching')}
            </div>
          ) : suggestions.length > 0 ? (
            <>
              {sharedName ? (
                <p className="px-2.5 pb-1 text-xs text-[var(--bellum-text-muted)]">
                  {t('suggestion.sameRegistryName', { count: sharedName.count, label: sharedName.label })}
                </p>
              ) : null}
              {suggestions.map(suggestion => (
                <ResultRow
                  key={suggestion.siren || suggestion.name}
                  suggestion={suggestion}
                  onSelect={onSelectSuggestion}
                  country={country}
                  {...(onAddToPortfolio ? { onAddToPortfolio } : {})}
                  adding={Boolean(addingToPortfolioSiren) && addingToPortfolioSiren === suggestion.siren}
                />
              ))}
            </>
          ) : sourceUnavailable ? (
            <p className="px-2.5 py-2 text-xs text-[var(--warning-soft-text)]">{t('composer.sourceUnavailable')}</p>
          ) : (
            <p className="px-2.5 py-2 text-xs text-[var(--bellum-text-secondary)]">
              {isForeignMarket ? t('country.noSuggestions') : t('composer.noCompanyFound')}
            </p>
          )}
          {portfolioAfterRegistry ? portfolioGroup : null}
        </div>
      ) : null}
    </div>
  )
}

function GroupLabel({ children }: { children: string }) {
  return (
    <div
      role="presentation"
      className="px-2.5 pb-1 pt-2.5 text-xs font-medium uppercase tracking-wider text-[var(--bellum-text-secondary)]"
    >
      {children}
    </div>
  )
}

function ResultRow({
  suggestion,
  logo,
  detail,
  onSelect,
  country,
  onAddToPortfolio,
  adding = false,
}: {
  suggestion: CompanySuggestion
  logo?: string | null | undefined
  /** Le détail déjà composé (compte de l'espace) ; absent : on le compose depuis le registre. */
  detail?: string
  onSelect: (suggestion: CompanySuggestion) => void
  country: WorkspaceMarket
  onAddToPortfolio?: (suggestion: CompanySuggestion) => void
  adding?: boolean
}) {
  const { t } = useTranslation('search')
  const registryTag =
    suggestion.registryId && suggestion.registryIdLabel
      ? `${suggestion.registryIdLabel} ${suggestion.registryId}`
      : suggestion.registryId || suggestion.siren
  // Un fait absent est ABSENT : l'effectif non publié (« NN ») ne s'écrit jamais « 0 salarié ».
  const line =
    detail ??
    [
      suggestion.city,
      country !== 'FR' ? t(`country.names.${country}`) : '',
      suggestion.sector,
      suggestion.headcount_label,
      suggestion.size_class,
      registryTag,
    ]
      .filter(Boolean)
      .join(' · ')
  const warnings = [
    suggestion.is_esn_naf === false ? t('autocomplete.notAnEsn') : null,
    suggestion.is_active === false ? t('autocomplete.ceased') : null,
    suggestion.is_intermediary ? t('autocomplete.intermediary') : null,
  ].filter((warning): warning is string => warning !== null)
  const legalName = suggestion.legal_name?.trim() ?? ''
  const showLegalName = legalName.length > 0 && legalName !== suggestion.name.trim()

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        role="option"
        aria-selected={false}
        aria-label={suggestion.name}
        onClick={() => onSelect(suggestion)}
        className={cn(
          'group flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors',
          'hover:bg-[var(--bellum-accent-bg)] focus-visible:bg-[var(--bellum-accent-bg)] pointer-coarse:min-h-11',
        )}
      >
        <CompanyLogo name={suggestion.name} src={logo} className="shrink-0" />
        <span className="min-w-0 flex-1">
          <strong className="block truncate text-sm font-semibold text-[var(--bellum-text-primary)]">
            {suggestion.name}
          </strong>
          {showLegalName ? (
            <span
              data-testid="suggestion-legal-name"
              className="block truncate text-xs text-[var(--bellum-text-secondary)]"
            >
              {legalName}
            </span>
          ) : null}
          {line ? <small className="block truncate text-xs text-[var(--bellum-text-secondary)]">{line}</small> : null}
          {warnings.map(warning => (
            <em key={warning} className="block truncate text-xs not-italic text-[var(--warning-soft-text)]">
              {warning}
            </em>
          ))}
        </span>
        <ChevronRight
          className="size-3.5 shrink-0 text-[var(--bellum-text-muted)] opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
          aria-hidden="true"
        />
      </button>
      {onAddToPortfolio ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          icon={Briefcase}
          isLoading={adding}
          aria-label={t('autocomplete.addToPortfolioAria', { company: suggestion.name })}
          className="shrink-0 pointer-coarse:min-h-11"
          onClick={() => onAddToPortfolio(suggestion)}
        >
          {t('autocomplete.addToPortfolio')}
        </Button>
      ) : null}
    </div>
  )
}
