import { Box, Button, SearchInput, TooltipButton } from '@bellum/ui'
import { PanelRightClose, PanelRightOpen, SlidersHorizontal } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

type AccountsToolbarProps = {
  search: string
  onSearchChange: (value: string) => void
  /** #4498 — « Filtres » ouvre la modale « Filtrer mon portefeuille » ; le nombre dit combien de critères sont posés. */
  onOpenFilters: () => void
  activeFilterCount: number
  isSidebarVisible: boolean
  onToggleSidebar: () => void
  /** #3299 — bascules d'en-tête, posées sur la MÊME ligne que la recherche. Refonte Théo : le
   *  Responsable et le Tri, juste après « Filtres ». */
  leading?: ReactNode
  /** Refonte Théo — à droite : la présentation (tableau / cartes) et l'export des comptes affichés. */
  trailing?: ReactNode
}

export function AccountsToolbar({
  search,
  onSearchChange,
  onOpenFilters,
  activeFilterCount,
  isSidebarVisible,
  onToggleSidebar,
  leading,
  trailing,
}: AccountsToolbarProps) {
  const { t } = useTranslation('accounts')
  const sidebarLabel = isSidebarVisible ? t('toolbar.hideSidebar') : t('toolbar.showSidebar')

  return (
    // #3299 — une seule ligne en desktop (bascules + recherche + filtres +
    // analyse), repliée sous 768 px par `flex-wrap`, jamais par un défilement.
    <Box display="flex" px={6} data-testid="accounts-toolbar" className="flex-wrap items-center gap-2 py-1">
      {/* #1316.3 — la barre ne promet que ce qu'elle cherche : le nom, le
          secteur (ajouté avec ce retour) et l'identifiant légal. « un mot-clé »
          aurait annoncé un plein texte qui n'existe pas — une barre qui annonce
          ce qu'elle ne cherche pas rend zéro résultat et se lit « ça n'existe
          pas », c'est exactement le défaut corrigé sur le SIREN le 31/08. */}
      <SearchInput size="sm" value={search} onChange={onSearchChange} placeholder={t('toolbar.searchPlaceholder')} />
      {/* #1316.3 — « afficher clairement Filtres à côté de l'icône ». #4498 (V22) — le bouton ouvre la modale
          « Filtrer mon portefeuille » ; les critères posés restent lisibles en pastilles juste en dessous. */}
      <Button
        type="button"
        variant="outline"
        icon={SlidersHorizontal}
        onClick={onOpenFilters}
        aria-haspopup="dialog"
        aria-label={activeFilterCount > 0 ? t('toolbar.filtersAria', { count: activeFilterCount }) : undefined}
        data-active={activeFilterCount > 0 ? 'true' : undefined}
        className="min-h-11 md:min-h-10"
      >
        {activeFilterCount > 0 ? t('toolbar.filtersCount', { count: activeFilterCount }) : t('toolbar.filters')}
      </Button>
      {leading}
      {/* V22 — à droite : la présentation, l'export, puis la bascule du panneau (hors maquette, gardée). */}
      <Box display="flex" className="ml-auto items-center gap-2">
        {trailing}
        {/* #4497 (V22) — « Analyser une entreprise » (`ListLauncher`) a quitté la barre : le geste vit en haut de
            page (« Analyser un compte », en-tête de la coque). La bascule du panneau, hors maquette, est GARDÉE. */}
        <TooltipButton
          type="button"
          variant="outline"
          size="icon"
          tooltip={sidebarLabel}
          tooltipSide="bottom"
          aria-label={sidebarLabel}
          aria-pressed={isSidebarVisible}
          onClick={onToggleSidebar}
          className="size-8 shrink-0 rounded-full shadow-sm"
        >
          {isSidebarVisible ? <PanelRightClose /> : <PanelRightOpen />}
        </TooltipButton>
      </Box>
    </Box>
  )
}
