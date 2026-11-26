import { Box, cn } from '@bellum/ui'
import { memo } from 'react'
import { ChangelogMenu } from '@/features/changelog/ChangelogMenu'
import { LanguageSwitcher } from '@/i18n/LanguageSwitcher'
import { NotificationBell } from '@/features/notifications/components/NotificationBell'
import { SidebarCollapseToggle } from './SidebarCollapseToggle'
import { ThemeToggle } from './ThemeToggle'

// #4463 — plus de pastille de crédits dans le rail : le débit continue, l'affichage disparaît.
// #4575 — `withCollapseToggle` : le chevron de repli rejoint la rangée au lieu de retomber seul à côté de
// l'identité. Les Réglages gardent le leur dans leur en-tête : le geste n'existe qu'une fois par barre (GA-26).
export const SidebarFooterActions = memo(function SidebarFooterActions({
  withCollapseToggle = false,
}: {
  withCollapseToggle?: boolean
}) {
  return (
    // Repliée, la rangée de cinq commandes devient une COLONNE : cinq boutons
    // côte à côte ne tiennent pas dans 44 px, et les laisser déborder les
    // rendrait inatteignables plutôt qu'invisibles.
    <Box
      data-shell="footer-actions"
      className={cn(
        'pt-4 flex items-center gap-2',
        // #4575.3 — au doigt, les cinq commandes valent 44 px (220 px > les 216 px utiles du rail) : la rangée
        // passe à la ligne plutôt que de rogner une zone cliquable. Souris : une seule ligne, comme demandé.
        'pointer-coarse:flex-wrap',
        'group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:flex-nowrap group-data-[collapsible=icon]:gap-1',
      )}
    >
      <ThemeToggle />
      <LanguageSwitcher variant="icon" side="right" align="start" />
      <NotificationBell />
      <ChangelogMenu />
      {/* `data-shell="collapse-toggle"` suit le bouton où qu'il aille : c'est par ce repère que la coque est
          gardée (« le bouton de repli RESTE au pied », #4520), il ne se perd pas en changeant de rangée. */}
      {withCollapseToggle ? (
        <div data-shell="collapse-toggle">
          <SidebarCollapseToggle />
        </div>
      ) : null}
    </Box>
  )
})
