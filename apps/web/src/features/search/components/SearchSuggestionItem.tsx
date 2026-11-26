import type { CompanySuggestion, WorkspaceMarket } from '@bellum/contracts'
import { Briefcase, Building2, ChevronRight } from 'lucide-react'
import { memo, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, cn } from '@bellum/ui'

interface SearchSuggestionItemProps {
  suggestion: CompanySuggestion
  onSelect: (suggestion: CompanySuggestion) => void
  /**
   * #2162.10 — le marché CIBLÉ par la recherche (le pays sélectionné dans
   * `SearchCountrySelector`), pas un champ par suggestion : tous les résultats
   * d'une même recherche viennent du même registre, donc du même pays.
   * `undefined` = appelant qui ne le fournit pas → ligne silencieuse, jamais
   * un pays deviné.
   */
  country?: WorkspaceMarket
  /**
   * #2150.42 (épopée #2781) — porte « Ajouter au portefeuille » depuis la
   * recherche. Fourni UNIQUEMENT par l'écran de recherche prospect
   * (`CompanySearchField` → `SearchComposer` → `/search`) : les autres
   * appelants de cette même ligne (sa propre entreprise en onboarding, un nom
   * de partenaire dans le dossier compte) n'ont rien à ajouter au portefeuille
   * — `undefined` = geste absent, pas un bouton désactivé (GA-18/19).
   */
  onAddToPortfolio?: (suggestion: CompanySuggestion) => void
  isAddingToPortfolio?: boolean
}

/**
 * Une ligne de la liste de désambiguïsation.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE DOIT MONTRER, ET POURQUOI
 * ─────────────────────────────────────────────────────────────────────────
 * Mesuré en production le 30/08/2026, sur « ROCHE » : les cinq lignes portaient
 * la ville, le secteur… et la MÊME phrase, mot pour mot, sous chacune d'elles —
 * « 5 des résultats portent le nom "ROCHE". ». Une information répétée à
 * l'identique cinq fois n'aide à choisir entre aucune des cinq (loi 4 du tome 7).
 * Elle a donc migré AU-DESSUS de la liste, où elle est vraie une fois ; ici on
 * rend ce qui DIFFÈRE d'une ligne à l'autre.
 *
 * Ce qui différencie deux homonymes, ce sont des faits publiés par le registre :
 * la ville, l'activité, **l'effectif**, **la catégorie d'entreprise**, les
 * **parcours observés par la mémoire marché** et le **SIREN** — l'identifiant
 * qui, lui, ne peut pas être partagé.
 *
 * ⚠️ Un fait absent est ABSENT. Le registre écrit `NN` quand il ne publie pas
 * de tranche d'effectif : la ligne se tait alors, elle n'écrit pas « 0 salarié ».
 * « Non mesuré » et « aucun salarié » sont deux faits opposés — et c'est
 * précisément la confusion des deux qui rendait une SCI indiscernable d'un
 * groupe de 800 personnes.
 *
 * ⚠️ EXCEPTION NOMMÉE sur le fait « parcours observés » (#1586) — la SEULE du
 * produit : partout ailleurs, sous 3 observations la mémoire marché ne dit
 * RIEN. ICI, « 0 parcours observé » s'affiche, parce que l'asymétrie EST
 * l'information qui départage — « ROCHE, 41 parcours observés » contre
 * « ROCHE BOBOIS, aucun parcours observé ». Voir
 * `disambiguationMarketPathsSchema` (packages/contracts) pour le détail.
 * `marketPaths` reste `undefined`/`null` (silence) quand la mémoire marché
 * n'a rapproché AUCUNE entreprise — ce n'est pas la même chose que « 0 ».
 */
export const SearchSuggestionItem = memo<SearchSuggestionItemProps>(function SearchSuggestionItem({
  suggestion,
  onSelect,
  country,
  onAddToPortfolio,
  isAddingToPortfolio,
}) {
  const { t } = useTranslation('search')
  // #2162.14 — statut administratif publié. `false` = cessée (marquée) ;
  // `true`/`null`/`undefined` = silence, comme partout ailleurs (on ne devine
  // jamais un statut absent).
  const isCeased = suggestion.is_active === false
  // #2162.10 — le pays CIBLÉ par la recherche, pas un fait par ligne.
  const countryLabel = country ? t(`country.names.${country}`) : ''
  // Only the ESN-lens autocomplete (onboarding « votre ESN ? ») sets this flag;
  // it stays undefined on the prospect-account search, where judging a company
  // on "is it an IT services firm" would be meaningless. The row is MARKED, never
  // hidden: an ESN can legitimately carry an atypical NAF.
  const notAnEsn = suggestion.is_esn_naf === false
  // #2162.9 — la raison sociale registre, seulement quand elle dit quelque
  // chose de plus que le nom déjà affiché (`suggestion.name`, souvent le nom
  // commercial). Le back-end garantit déjà `legal_name = null` quand les deux
  // valeurs sont identiques, mais l'écran ne s'y fie pas seul — un fait
  // redondant n'aide à rien distinguer (loi 4 du tome 7).
  const legalName = suggestion.legal_name?.trim() || ''
  const showLegalName = legalName.length > 0 && legalName !== suggestion.name.trim()
  // Foreign suggestions carry a national registry id (CIK/BCE/NEQ…) instead of a
  // SIREN — surface it (with its label) so the row is as legible as the FR one.
  const registryTag =
    suggestion.registryId && suggestion.registryIdLabel
      ? `${suggestion.registryIdLabel} ${suggestion.registryId}`
      : suggestion.registryId || ''
  const meta = [suggestion.city, countryLabel, suggestion.sector, registryTag].filter(Boolean).join(' · ')
  // #1586 — en 3ᵉ position, AVANT le SIREN : les parcours observés par la
  // mémoire marché. `undefined`/`null` = silence (mémoire indisponible ou
  // aucun rapprochement) ; `0` s'affiche VRAIMENT ici — exception nommée du
  // fichier, voir le commentaire au-dessus.
  const marketPathsFact =
    suggestion.marketPaths === null || suggestion.marketPaths === undefined
      ? null
      : suggestion.marketPaths === 0
        ? t('autocomplete.marketPathsNone')
        : t('autocomplete.marketPathsObserved', { count: suggestion.marketPaths })
  // La seconde ligne : les faits de TAILLE, du MARCHÉ et l'identifiant. Séparés
  // du reste parce que c'est cette ligne-là qui départage deux homonymes, et
  // qu'elle ne doit pas se faire tronquer avec l'activité. Chaque terme
  // n'apparaît que s'il est PUBLIÉ — un effectif absent ne s'écrit pas
  // « 0 salarié ».
  const facts = [suggestion.headcount_label, suggestion.size_class, marketPathsFact, suggestion.siren]
    .filter(Boolean)
    .join(' · ')

  // #2150.42 — le conteneur ne peut plus être un `<button>` dès qu'il porte le
  // bouton « Ajouter au portefeuille » : un bouton natif ne peut pas en
  // contenir un autre (HTML invalide, et le clic du second déclencherait aussi
  // le premier). `role="button"` + clavier reproduit le même comportement
  // accessible (GA-32/35 : ce qui se clique se tabule).
  const handleRowKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onSelect(suggestion)
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={suggestion.name}
      className={cn(
        'group flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left',
        'transition-colors duration-150 ease-out',
        'hover:bg-[var(--bellum-bg-darker)]',
      )}
      onClick={() => onSelect(suggestion)}
      onKeyDown={handleRowKeyDown}
    >
      <span
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-lg',
          'bg-[color-mix(in_srgb,var(--bellum-primary-500)_12%,transparent)]',
          'text-[var(--bellum-text-accent)]',
        )}
      >
        <Building2 className="size-3.5" />
      </span>

      <div className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium leading-4 text-[var(--bellum-text-primary)]">
          {suggestion.name}
        </span>

        {showLegalName && (
          <span
            className="block truncate text-xs leading-4 text-[var(--bellum-text-secondary)]"
            data-testid="suggestion-legal-name"
          >
            {legalName}
          </span>
        )}

        {meta && (
          <span className="mt-0.5 block truncate text-xs leading-4 text-[var(--bellum-text-secondary)]">{meta}</span>
        )}

        {facts && (
          <span
            className="mt-0.5 block truncate text-xs leading-4 text-[var(--bellum-text-muted)]"
            data-testid="suggestion-facts"
          >
            {facts}
          </span>
        )}

        {notAnEsn && (
          <span className="mt-0.5 block truncate text-xs leading-4 text-[var(--warning-soft-text)] dark:text-[var(--warning-soft-text)]">
            {t('autocomplete.notAnEsn')}
          </span>
        )}

        {isCeased && (
          <span
            className="mt-0.5 block truncate text-xs leading-4 text-[var(--warning-soft-text)] dark:text-[var(--warning-soft-text)]"
            data-testid="suggestion-ceased"
          >
            {t('autocomplete.ceased')}
          </span>
        )}

        {/* #2265.14 (épopée #2851) — « jamais un intermédiaire présenté comme
            client final sans badge ». Même jugement que /discover
            (`classify_actor_type`), sur le nom + NAF déjà résolus par cette
            suggestion — booléen strict, jamais gated sur `lens=esn`. */}
        {suggestion.is_intermediary && (
          <span
            className="mt-0.5 block truncate text-xs leading-4 text-[var(--warning-soft-text)] dark:text-[var(--warning-soft-text)]"
            data-testid="suggestion-intermediary"
          >
            {t('autocomplete.intermediary')}
          </span>
        )}
      </div>

      {onAddToPortfolio && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          icon={Briefcase}
          isLoading={isAddingToPortfolio}
          aria-label={t('autocomplete.addToPortfolioAria', { company: suggestion.name })}
          title={t('autocomplete.addToPortfolio')}
          className="shrink-0 pointer-coarse:min-h-11"
          onClick={event => {
            // Un clic sur ce bouton ne doit PAS aussi sélectionner la ligne
            // (lancer l'analyse) : deux gestes distincts sur la même ligne.
            event.stopPropagation()
            onAddToPortfolio(suggestion)
          }}
        />
      )}

      <ChevronRight
        className={cn(
          'size-3.5 shrink-0 text-[var(--bellum-text-secondary)] opacity-0',
          'transition-all duration-150 ease-out',
          'group-hover:translate-x-0.5 group-hover:opacity-100',
        )}
      />
    </div>
  )
})
