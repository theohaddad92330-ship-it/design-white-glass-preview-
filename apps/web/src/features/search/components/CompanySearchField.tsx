import { normalizeCompanyTarget, type CompanySuggestion, type WorkspaceMarket } from '@bellum/contracts'
import { BrailleLoader, Button, Popover, PopoverAnchor, PopoverContent, Text, cn } from '@bellum/ui'
import { Paperclip } from 'lucide-react'
import { useRef, type ChangeEvent, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { SearchCountrySelector } from './SearchCountrySelector'
import { SearchInputLoader } from './SearchInputLoader'
import { ANALYSIS_ATTACHMENT_ACCEPT } from '../lib/analysis-attachments'
import { registryNameGroups } from '../lib/relatedEntities'
import { SearchSuggestionItem } from './SearchSuggestionItem'

type CompanySearchFieldProps = {
  onQueryChange: (next: string) => void
  onSelectSuggestion: (suggestion: CompanySuggestion) => void
  onShowDropdown: (show: boolean) => void
  onSubmit: () => void
  query: string
  showDropdown: boolean
  suggestions: CompanySuggestion[]
  suggestionsLoading: boolean
  /** Requête réellement servie quand la saisie exacte n'a rien donné (#1099). */
  broadenedFrom?: string | undefined
  /** La source n'a pas répondu — voir `useCompanySearch`. Jamais « rien trouvé ». */
  sourceUnavailable?: boolean
  country: WorkspaceMarket
  onCountryChange: (next: WorkspaceMarket) => void
  /** #2150.42 (épopée #2781) — voir `SearchSuggestionItem` : présent
   *  uniquement sur l'écran de recherche prospect (`SearchComposer`). */
  onAddToPortfolio?: (suggestion: CompanySuggestion) => void
  addingToPortfolioSiren?: string | null
  /**
   * #3623 — le trombone JOINT des documents à l'analyse (CSV, ZIP, classeurs…) : les fichiers
   * remontent, c'est l'écran qui les ingère. Absent (le lanceur de compte), le trombone garde son
   * geste d'avant (#2149.17) : le NOM du fichier devient la requête.
   */
  onAttachFiles?: (files: File[]) => void
  /** Théo B r1-recherche.R9 — le dépôt de documents vit à l'étape 3 (« Ajouter un document ») : le trombone du champ se retire. */
  showAttach?: boolean
}

export function CompanySearchField({
  onQueryChange,
  onSelectSuggestion,
  onShowDropdown,
  onSubmit,
  query,
  showDropdown,
  suggestions,
  suggestionsLoading,
  broadenedFrom,
  sourceUnavailable = false,
  country,
  onCountryChange,
  onAddToPortfolio,
  addingToPortfolioSiren,
  onAttachFiles,
  showAttach = true,
}: CompanySearchFieldProps) {
  const { t } = useTranslation('search')
  // Le compte d'homonymes est une propriété de la LISTE, pas d'une ligne : il
  // s'annonce UNE fois en tête, jamais sous chacune des cinq (loi 4 du tome 7 —
  // mesuré le 30/08/2026 : la même phrase, mot pour mot, sous cinq lignes).
  const nameGroups = registryNameGroups(suggestions, query)
  const sharedName = [...nameGroups.values()].sort((a, b) => b.count - a.count)[0] ?? null
  const canShowDropdown = query.trim().length >= 2
  const dropdownOpen = showDropdown && canShowDropdown
  // A non-FR market may have no suggestion source (LU beta, CH without creds) or
  // simply no match — either way, guide the user to launch with the exact name
  // (the analysis resolves the entity via the country pack). FR keeps the plain
  // "no company found" copy.
  const isForeignMarket = country !== 'FR'
  const fileInputRef = useRef<HTMLInputElement>(null)

  /**
   * #2149.17 — CIBLE ADMISSIBLE : un fichier déposé (devis, cahier des
   * charges, fiche entreprise). Jamais un upload, jamais un parseur de
   * CONTENU — seul le NOM du fichier, une donnée directe de l'utilisateur,
   * traverse `normalizeCompanyTarget` (même fonction que la cible URL,
   * `@bellum/contracts`) pour devenir la même requête texte que le champ
   * acceptait déjà.
   */
  const handleFileSelected = (e: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (onAttachFiles) {
      // #3623 — le CONTENU part (l'écran l'ingère) ; le nom ne devient plus la requête.
      if (selected.length > 0) onAttachFiles(selected)
      return
    }
    const file = selected[0]
    if (!file) return
    const next = normalizeCompanyTarget(file.name)
    onQueryChange(next)
    onShowDropdown(next.trim().length >= 2)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      onShowDropdown(false)
      onSubmit()
    }

    if (e.key === 'Escape') {
      e.preventDefault()
      onShowDropdown(false)
    }
  }

  return (
    <Popover
      open={dropdownOpen}
      onOpenChange={open => {
        if (!open) {
          onShowDropdown(false)
          return
        }

        if (canShowDropdown) {
          onShowDropdown(true)
        }
      }}
    >
      <PopoverAnchor asChild>
        <div className="mb-2 flex items-center gap-2">
          <SearchCountrySelector value={country} onChange={onCountryChange} />

          <div className="relative flex-1">
            <SearchInputLoader visible={suggestionsLoading} />

            <input
              type="text"
              value={query}
              // Time-to-value : le champ est LA prochaine action de la page —
              // préfocus pour qu'un nouvel utilisateur tape directement sa cible.
              // Seulement champ VIDE : un brouillon pré-rempli (suggestion/reprise)
              // ne doit pas rouvrir l'autocomplétion au chargement.
              autoFocus={query.trim().length === 0}
              onChange={e => {
                const value = e.target.value

                onQueryChange(value)
                onShowDropdown(value.trim().length >= 2)
              }}
              onFocus={() => {
                if (query.trim().length >= 2) {
                  onShowDropdown(true)
                }
              }}
              onKeyDown={handleKeyDown}
              placeholder={t('composer.companyPlaceholder')}
              className="h-6 w-full bg-transparent text-sm font-medium text-[var(--bellum-text-primary)] placeholder:text-[var(--bellum-text-muted)] outline-none"
              aria-label={t('composer.companyAriaLabel')}
            />
          </div>

          {showAttach ? (
            <>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept={
                  onAttachFiles
                    ? ANALYSIS_ATTACHMENT_ACCEPT
                    : '.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.rtf,.odt,.csv'
                }
                multiple={Boolean(onAttachFiles)}
                onChange={handleFileSelected}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                icon={Paperclip}
                aria-label={t(onAttachFiles ? 'composer.attachDocumentsAriaLabel' : 'composer.attachFileAriaLabel')}
                title={t(onAttachFiles ? 'composer.attachDocumentsAriaLabel' : 'composer.attachFileAriaLabel')}
                onClick={() => fileInputRef.current?.click()}
              />
            </>
          ) : null}
        </div>
      </PopoverAnchor>

      <PopoverContent
        align="start"
        side="top"
        sideOffset={8}
        onOpenAutoFocus={e => e.preventDefault()}
        onCloseAutoFocus={e => e.preventDefault()}
        className={cn(
          'z-overlay overflow-hidden rounded-xl border border-[var(--bellum-border)]',
          'bg-[var(--bellum-bg-lighter)] p-1.5',
          'shadow-[0_12px_32px_rgba(0,0,0,0.16)]',
        )}
        style={{
          width: 'min(var(--radix-popover-trigger-width), 560px)',
        }}
      >
        {/* #1111 : calculé sur les suggestions DÉJÀ rendues — aucun appel de plus. */}
        <Text weight="semibold" size="xs" className="px-2 pb-1 pt-1 text-[var(--bellum-text-muted)]">
          {t('composer.companiesHeading')}
        </Text>
        {/* #1099 : le registre cherche sur la RAISON SOCIALE. « Bedrock
            Streaming » est une marque ; la société y est inscrite « BEDROCK (M6
            DIGITAL DISTRIBUTION) », et la liste vide se lisait « cette
            entreprise n'existe pas ». Quand une requête plus courte a servi, on
            le DIT — sinon l'écran fait passer une autre recherche pour celle
            qui a été demandée. */}
        {broadenedFrom && suggestions.length > 0 ? (
          <Text size="xs" className="px-2 pb-1 text-[var(--bellum-text-muted)]">
            {t('composer.broadenedTo', { query: broadenedFrom })}
          </Text>
        ) : null}

        <div className="max-h-[240px] space-y-0.5 overflow-y-auto">
          {suggestionsLoading && suggestions.length === 0 ? (
            <div className="px-2 py-2 flex items-center gap-2 text-xs text-[var(--bellum-text-secondary)]">
              <BrailleLoader variant="grid-searching" />
              {t('composer.searching')}
            </div>
          ) : suggestions.length > 0 ? (
            <>
              {sharedName ? (
                <p className="px-2.5 pt-1 pb-1 text-xs leading-4 text-[var(--bellum-text-muted)]">
                  {t('suggestion.sameRegistryName', { count: sharedName.count, label: sharedName.label })}
                </p>
              ) : null}
              {suggestions.map(suggestion => (
                <SearchSuggestionItem
                  key={suggestion.siren || suggestion.name}
                  suggestion={suggestion}
                  onSelect={onSelectSuggestion}
                  // #2162.10 — le pays CIBLÉ par la recherche (sélecteur ci-dessus),
                  // pas un champ par suggestion : toutes les lignes d'une même
                  // recherche viennent du même registre.
                  country={country}
                  onAddToPortfolio={onAddToPortfolio}
                  isAddingToPortfolio={
                    Boolean(onAddToPortfolio) &&
                    addingToPortfolioSiren != null &&
                    addingToPortfolioSiren === suggestion.siren
                  }
                />
              ))}
            </>
          ) : sourceUnavailable ? (
            /* #1107/#1109 : « Aucune entreprise trouvée » AFFIRME que
               l'entreprise n'existe pas. Quand c'est la source qui n'a pas
               répondu, cette phrase est le contraire du vrai — et le testeur
               en a déduit tout seul « réseau et/ou lien KO », faute qu'on le
               lui dise. Une erreur se remarque, une liste vide se croit. */
            <div className="px-2 py-2 text-xs text-[var(--bellum-warning-text)]">{t('composer.sourceUnavailable')}</div>
          ) : (
            <div className="px-2 py-2 text-xs text-[var(--bellum-text-secondary)]">
              {isForeignMarket ? t('country.noSuggestions') : t('composer.noCompanyFound')}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
