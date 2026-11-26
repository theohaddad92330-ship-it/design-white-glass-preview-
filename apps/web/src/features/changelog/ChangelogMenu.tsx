import {
  Button,
  cn,
  DotIndicator,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  ScrollArea,
  Text,
} from '@bellum/ui'
import { Compass, Crosshair, LifeBuoy, Sparkles } from 'lucide-react'
import { memo, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useChangelog } from '@/features/changelog/useChangelog'
import { useProductTourStore } from '@/features/product-tour/product-tour-store'
import { useGuideStore } from '@/features/guide/guide-store'
import { FEEDBACK_COACHMARK } from '@/features/guide/guide-starters'
import { GuideHelpCenter } from '@/features/guide/GuideHelpCenter'

/**
 * Sidebar "Nouveautés" menu: lists the in-repo changelog and surfaces a warning
 * dot when there's an unseen entry (gated by the `sidebar_changelog` toggle).
 * Opening it marks everything seen. Mounted in the real authenticated shell.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * #1794.2 — LA VISITE GUIDÉE SE RELANCE D'ICI
 * ─────────────────────────────────────────────────────────────────────────
 * Verbatim du retour : « à chaque changement visuel, on devrait pouvoir le
 * relancer pour comprendre les nouveautés — donc sinon pourquoi pas ranger ce
 * bouton dans le changelog en bas à gauche ».
 *
 * ⚠️ Ce que ça ne veut PAS dire : relancer la visite à CHAQUE entrée de
 * changelog. Il y en a plusieurs par jour (voir `entries.ts`) — un tutoriel
 * qui surgit à chaque nouveauté serait insupportable en trois jours, la même
 * loi que la grammaire du mouvement (§16 du tome, GA-25) applique déjà au
 * mouvement lui-même. Ce qui reste défendable, et c'est ce que ce bouton fait,
 * est un geste offert à la personne : elle lit une nouveauté ici, et PEUT
 * décider de revoir le tour — jamais un déclenchement automatique.
 */
export const ChangelogMenu = memo(function ChangelogMenu() {
  const { t } = useTranslation(['changelog', 'onboarding', 'guide'])
  const [open, setOpen] = useState(false)
  const { entries, hasUnseen, markAllSeen } = useChangelog()
  // #1863.3 — ce menu ALLUME la visite, il ne la porte plus. Elle est montée
  // à la racine (`ProductTour`) pour survivre à la navigation : depuis ce
  // pied de barre latérale, elle se fermait à la première page ouverte.
  const startTour = useProductTourStore(state => state.start)
  const startGuide = useGuideStore(state => state.start)

  useEffect(() => {
    if (open && hasUnseen) markAllSeen()
  }, [open, hasUnseen, markAllSeen])

  // Le menu se ferme D'ABORD : sans ça, son panneau resterait ouvert
  // par-dessus la modale de la visite — deux surcouches, et la mauvaise
  // au-dessus. Fermer via l'état contrôlé plutôt que compter sur l'auto-close
  // de Radix, dont le déclenchement n'est pas garanti pour un bouton qui n'est
  // pas un `DropdownMenuItem`.
  const openTour = () => {
    setOpen(false)
    startTour()
  }

  /**
   * #2214.3 — l'aide ANCRÉE : elle désigne un endroit de l'écran où l'on est.
   *
   * Le menu se ferme d'abord, pour la même raison qu'au-dessus — et ici elle est
   * plus forte encore : le panneau du menu recouvrirait précisément la zone que
   * le halo est censé montrer.
   */
  const showMeWhere = () => {
    setOpen(false)
    startGuide(FEEDBACK_COACHMARK)
  }

  // #2214.24 — le menu se ferme d'abord, pour la même raison qu'au-dessus.
  const [helpCenterOpen, setHelpCenterOpen] = useState(false)
  const openHelpCenter = () => {
    setOpen(false)
    setHelpCenterOpen(true)
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      {/*
        Pas d'infobulle sur ce bouton (arbitrage Louis 16/08) : elle s'ouvrait au
        survol par-dessus le contenu et gênait. Le nom reste porté par
        `aria-label` — le retirer aussi laisserait un bouton anonyme au lecteur
        d'écran.
      */}
      <DropdownMenuTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          aria-label={t('menu.title')}
          className={cn(
            'relative size-7 pointer-coarse:size-11 cursor-pointer rounded-full border border-[var(--bellum-border)] bg-[var(--bellum-bg-lighter)] text-[var(--bellum-text-muted)] shadow-xs hover:bg-[var(--bellum-surface-2)] hover:text-[var(--bellum-text-primary)]',
            open && 'bg-[var(--bellum-surface-2)] text-[var(--bellum-text-primary)]',
          )}
        >
          <Sparkles className="w-4 h-4" />
          {hasUnseen && (
            <span className="absolute -top-2 -right-0.5">
              <DotIndicator variant="warning" size="md" />
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      {/*
        Même montage que la cloche Notifications : panneau ancré EN BAS de la
        sidebar. La borne est posée sur la zone défilante (voir plus bas) et non
        ici — un `max-h` sur le panneau laisserait sa hauteur INDÉFINIE et le
        `h-full` du viewport Radix retomberait sur `auto`, donc rogné.
      */}
      <DropdownMenuContent
        side="top"
        align="end"
        sideOffset={8}
        collisionPadding={12}
        className="z-50 ml-4 w-80 border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-0 text-[var(--bellum-text-primary)] shadow-[var(--shadow-elevated)]"
      >
        <div className="border-b border-[var(--bellum-border)] px-3 py-2">
          <Text element="span" size="sm" weight="medium">
            {t('menu.title')}
          </Text>
        </div>
        {/* Borne sur le conteneur de défilement lui-même — cf. NotificationBell.
            #1794.2 — `-6rem` et non `-3rem` : le pied « Revoir la visite
            guidée » ajouté sous cette zone défilante doit être déduit de la
            même place disponible, sous peine de pousser le panneau plus haut
            que l'écran sur une fenêtre courte.
            #2214.3 — `-9rem` désormais : le pied porte DEUX boutons. C'est
            exactement ce que l'avertissement ci-dessus annonçait — ajouter une
            entrée au pied sans reprendre cette déduction repousse le panneau
            au-delà du haut de l'écran sur une fenêtre courte. */}
        <ScrollArea className="max-h-[min(24rem,calc(var(--radix-dropdown-menu-content-available-height,100dvh)-9rem))]">
          <div className="divide-y divide-[var(--bellum-border)]">
            {entries.map(entry => (
              <div key={entry.id} className="px-3 py-2.5">
                <div className="flex items-baseline justify-between gap-2">
                  <Text element="span" size="sm" weight="medium">
                    {entry.title}
                  </Text>
                  <Text element="span" size="xs" className="shrink-0 text-[var(--bellum-text-muted)]">
                    {entry.date}
                  </Text>
                </div>
                <ul className="mt-1.5 space-y-1">
                  {entry.items.map(item => (
                    <li key={item} className="flex gap-1.5 text-[var(--bellum-text-secondary)]">
                      <span className="mt-1 size-1 shrink-0 rounded-full bg-[var(--bellum-text-muted)]" aria-hidden />
                      <Text element="span" size="xs">
                        {item}
                      </Text>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </ScrollArea>
        {/* #1794.2 — le geste reste à la personne : lire une nouveauté ICI, et
            décider elle-même de revoir le tour. Rien ne le déclenche seul. */}
        <div className="border-t border-[var(--bellum-border)] p-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            fullWidth
            onClick={openTour}
            className="justify-start gap-2 text-[var(--bellum-text-secondary)] hover:text-[var(--bellum-text-primary)]"
          >
            <Compass className="size-4 shrink-0" aria-hidden />
            {t('onboarding:tour.menuButton')}
          </Button>
          {/* #2214.3 — l'aide de niveau 2, à côté de la visite de niveau 3 et
              non à sa place : la visite RACONTE les écrans, le coachmark MONTRE
              un endroit précis, là où on est. Deux gestes distincts, tous deux
              demandés par la personne — rien ne se déclenche seul (#2214.5). */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            fullWidth
            onClick={showMeWhere}
            className="justify-start gap-2 text-[var(--bellum-text-secondary)] hover:text-[var(--bellum-text-primary)]"
          >
            <Crosshair className="size-4 shrink-0" aria-hidden />
            {t('guide:start.label')}
          </Button>
          {/* #2214.24 — le centre d'aide : les onze parcours d'écran et le
              guide 1, chacun lancé sur un clic. */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            fullWidth
            onClick={openHelpCenter}
            className="justify-start gap-2 text-[var(--bellum-text-secondary)] hover:text-[var(--bellum-text-primary)]"
          >
            <LifeBuoy className="size-4 shrink-0" aria-hidden />
            {t('guide:helpCenter.open')}
          </Button>
        </div>
      </DropdownMenuContent>
      <GuideHelpCenter open={helpCenterOpen} onOpenChange={setHelpCenterOpen} />
    </DropdownMenu>
  )
})
