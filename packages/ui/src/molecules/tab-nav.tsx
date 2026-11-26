import { memo, useEffect, useRef, type ReactNode } from 'react'
import { DotIndicator } from '../atoms/dot-indicator'
import { Box } from '../atoms/box'
import { Text } from '../atoms/text'
import type { ComponentSize } from '../atoms/variants'
import { chipClassName } from './chip-style'
import { cn } from '../lib/utils'
import { useHorizontalOverflow } from '../hooks/use-horizontal-overflow'

export type TabNavItem = {
  key: string
  label: string
  to?: string
  showNotificationDot?: boolean
  /**
   * #2112.13-16 — LE RÔLE de la destination, en aide au SURVOL.
   *
   * Un libellé dit où l'on va ; il ne dit pas à quoi l'endroit sert. « Décider
   * et agir », « Traiter tes échanges », « Prendre du recul » : trois phrases
   * qui rendent trois destinations non confondables pour quelqu'un qui arrive.
   *
   * ⚠️ Au SURVOL, et pas en permanence — « ne pas afficher ces aides en
   * permanence » est écrit dans le retour. Trois lignes de prose sous une barre
   * de navigation, et la barre cesse d'être une barre.
   *
   * ⚠️ Optionnel, et sans repli : un onglet qui n'a pas de rôle déclaré n'en
   * porte AUCUN. Le dériver du libellé (« Ouvrir Besoins ») n'apprendrait rien
   * et ferait croire que la barre explique quelque chose.
   */
  hint?: string
}

const sizeStyles: Record<ComponentSize, { padding: string; textSize: 'sm' | 'base' | 'lg'; gap: string }> = {
  sm: { padding: 'px-3 py-1 mb-1', textSize: 'sm', gap: 'gap-4' },
  md: { padding: 'px-4 py-1 mb-1', textSize: 'base', gap: 'gap-1' },
  lg: { padding: 'px-5 py-1 mb-1', textSize: 'lg', gap: 'gap-8' },
}

export type TabNavProps = {
  tabs: TabNavItem[]
  activeTab: string
  onTabChange?: (key: string) => void
  // #2479 — `active` voyage jusqu'ici : sans lui, un lien personnalisé ne
  // peut jamais poser `aria-pressed`, et un lecteur d'écran ne sait plus
  // QUELLE sous-partie est ouverte (seule la branche `<button>` le portait).
  renderLink?: (props: { to: string; className: string; children: ReactNode; active: boolean }) => ReactNode
  size?: ComponentSize
  className?: string
  /**
   * LA FORME DU NIVEAU (option B, tranchée par Louis le 01/09/2026).
   *
   * `underline` — la barre de SECTION : on change d'écran.
   * `pill` — un second niveau DANS un écran : on filtre ce qu'on regarde.
   *
   * Elles ne se distinguaient par rien. Deux barres soulignées à seize pixels
   * l'une de l'autre, même graisse, même trait : « je fais pas attention et je
   * vais cliquer sur cette barre qui me ramène au général » (#1123). La
   * séparation par la FORME est ce qui rend les deux portées lisibles d'un
   * coup d'œil — et les pastilles n'ont pas de bordure pleine largeur, donc
   * plus de bande grise épaisse sous l'entête.
   */
  variant?: 'underline' | 'pill'
}

export const TabNav = memo<TabNavProps>(function TabNav({
  tabs,
  activeTab,
  onTabChange,
  renderLink,
  size = 'md',
  className,
  variant = 'underline',
}) {
  const sizes = sizeStyles[size]
  const pill = variant === 'pill'
  // #2653.1 — la barre déborde parfois (Missions à douze onglets), parfois
  // jamais (`/projects` : Kanban/Tableau, `ml-auto`). Le masque de bord ne
  // doit exister QUE dans le premier cas ; sinon le dernier onglet est rogné
  // en permanence même quand il n'y a rien derrière lui à laisser deviner.
  // Même mesure que `Table`/`ResponsiveTable` (GA-119), réutilisée plutôt que
  // réécrite (GA-26).
  const { ref: scroller, overflowing } = useHorizontalOverflow<HTMLElement>()
  const activeRef = useRef<HTMLElement>(null)

  /**
   * L'onglet ACTIF est amené dans le champ, à chaque changement.
   *
   * ⚠️ Défaut mesuré EN PRODUCTION le 31/08/2026, sur la démo publique. La
   * section Missions est passée à DOUZE onglets dans la journée. La barre
   * défile (voir plus bas) mais sa barre de défilement est masquée : en
   * arrivant sur `/missions/suivi`, on voyait le trait bleu de l'onglet actif
   * dépasser à droite… **sans son libellé**. L'écran était atteignable par une
   * URL et par aucun clic — c'est-à-dire pas livré, au sens de ce dépôt.
   *
   * `block: 'nearest'` ne bouge rien quand l'onglet est déjà visible : on ne
   * fait pas sursauter la page à chaque rendu.
   */
  useEffect(() => {
    activeRef.current?.scrollIntoView({ inline: 'nearest', block: 'nearest' })
  }, [activeTab])

  return (
    // Les onglets DÉFILENT plutôt que de déborder.
    //
    // Mesuré sur un téléphone de 500 px : la barre du centre d'actions —
    // « Depuis ma connexion · Tous · Analyses · Enrichissements · Exports ·
    // Messages · Rappels » — dépassait de 302 px, et les trois derniers onglets
    // étaient simplement inatteignables. Un onglet qu'on ne peut pas amener à
    // l'écran n'existe pas.
    //
    // `shrink-0` sur chaque onglet : sans lui, `flex` les comprime jusqu'à
    // couper les libellés, et le défilement ne sert plus à rien. La barre de
    // défilement est masquée — sur un écran tactile on glisse, et une barre
    // grise sous des onglets se lit comme une bordure de trop.
    <Box
      ref={scroller}
      display="flex"
      className={cn(
        'overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        pill ? 'items-center gap-1.5 py-1' : 'border-b border-[var(--bellum-border)]',
        // Le bord droit s'ESTOMPE quand il reste des onglets derrière.
        //
        // Sans lui, un utilisateur à la souris n'a AUCUN indice qu'il y a une
        // suite : pas de barre de défilement (masquée à dessein), pas de geste
        // de glissement comme sur un écran tactile. Un dégradé de MASQUE plutôt
        // qu'un dégradé de couleur : il estompe le contenu lui-même, donc il ne
        // suppose aucune couleur de fond et suit les deux thèmes sans rien
        // savoir d'eux.
        overflowing && '[mask-image:linear-gradient(to_right,black_calc(100%-2rem),transparent)]',
        pill ? '' : sizes.gap,
        className,
      )}
    >
      {tabs.map(tab => {
        const isActive = tab.key === activeTab

        /*
         * ⚠️ LA PASTILLE NE DÉCIDE PLUS DE SON PROPRE LOOK — 01/09/2026.
         *
         * Elle rendait `bg-[var(--bellum-surface-2)]` pour l'état ACTIF,
         * pendant que `FilterChips` rendait ce même gris pour l'état de REPOS.
         * Le même fond disait donc « c'est celui-ci » sur Missions et « ce
         * n'est pas celui-ci » sur la Veille — deux sens opposés pour une
         * seule couleur, sur deux barres séparées de deux pixels de hauteur.
         *
         * Les deux composants gardent leur code (l'un sait défiler et porter
         * des liens, l'autre sait compter et se sélectionner à plusieurs) mais
         * partagent désormais la grammaire : `chip-style.ts`.
         */
        const tabClassName = pill
          ? chipClassName({ active: isActive, className: 'shrink-0 max-md:min-h-11' })
          : cn(
              // #4576.7 — cible ≥ 44 px sous 768 px (borne mobile), sans attendre un pointeur déclaré tactile.
              'shrink-0 cursor-pointer rounded-md transition-colors hover:bg-[var(--bellum-surface-2)] max-md:min-h-11 pointer-coarse:min-h-11',
              sizes.padding,
              isActive
                ? 'text-[var(--bellum-text-primary)]'
                : 'text-[var(--bellum-text-secondary)] hover:text-[var(--bellum-text-primary)]',
            )

        const tabContent = (
          <span className="relative">
            {/* #2112.8 — la barre de SECTION (`underline`) porte son onglet
                actif en semibold, plus fort que le repos. La barre de second
                NIVEAU (`pill`) garde `medium` : son actif se lit déjà par un
                remplissage plein (`chip-style.ts`), pas par le poids du texte. */}
            <Text
              size={sizes.textSize}
              weight={isActive ? (pill ? 'medium' : 'semibold') : 'normal'}
              element="span"
              noWrap
            >
              {tab.label}
            </Text>
            {tab.showNotificationDot && (
              <span className="absolute -top-3 -right-3">
                <DotIndicator variant="danger" size="sm" pulse />
              </span>
            )}
          </span>
        )

        return (
          // `shrink-0` sur le CONTENEUR et pas seulement sur le bouton :
          // depuis que `min-width: 0` s'applique aux enfants de flex, un
          // conteneur sans lui se comprime sous la largeur de son bouton — 29 px
          // pour un onglet qui en demande 41, libellé coupé. La règle globale
          // est juste ; ce qui ne doit pas rétrécir doit le DIRE.
          <Box
            key={tab.key}
            ref={isActive ? activeRef : undefined}
            display="flex"
            // `title` sur le CONTENEUR et non sur le bouton : les deux branches
            // — bouton et lien personnalisé — en héritent, donc l'aide vit à un
            // seul endroit. Absente, aucun attribut n'est posé : un `title=""`
            // ferait une infobulle vide au survol.
            {...(tab.hint ? { title: tab.hint } : {})}
            className="shrink-0 flex-col items-center"
          >
            {tab.to && renderLink ? (
              renderLink({ to: tab.to, className: tabClassName, children: tabContent, active: isActive })
            ) : (
              <button
                type="button"
                onClick={() => onTabChange?.(tab.key)}
                className={tabClassName}
                {...(pill ? { 'aria-pressed': isActive } : {})}
              >
                {tabContent}
              </button>
            )}
            {/* Le trait ne vit que sous un onglet SOULIGNÉ : une pastille porte
                déjà son état dans son fond. */}
            {!pill && isActive && <Box className="w-full h-0.5 bg-primary rounded-full" />}
          </Box>
        )
      })}
    </Box>
  )
})
