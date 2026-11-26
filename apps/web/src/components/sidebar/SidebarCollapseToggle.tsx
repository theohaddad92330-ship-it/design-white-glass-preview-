import { Button, Tooltip, TooltipContent, TooltipTrigger, useSidebarOptional } from '@bellum/ui'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { ShortcutKeys } from '@/features/shortcuts/ShortcutKeys'
import { shortcutAriaKeys } from '@/features/shortcuts/shortcut-format'
import { shortcutById } from '@/features/shortcuts/shortcuts'

/**
 * Le déclencheur de repli de la barre latérale.
 *
 * Un vrai `<button type="button">` : ce qui se clique se tabule (GA-35). Il ne
 * montre qu'une icône, donc il porte un nom (GA-32) — et ce nom annonce
 * l'ACTION (« Replier… »), pas l'état, parce que c'est ce qu'un lecteur d'écran
 * lit avant de décider s'il appuie.
 *
 * Masqué en CSS sous 768 px, dans le MÊME rendu : la coque mobile a sa propre
 * navigation, et la barre y est déjà traitée autrement. Une branche de rendu
 * `isMobile ? null : …` ferait la même chose au prix d'un arbre différent selon
 * la largeur — ce que les règles mobiles du dépôt refusent.
 *
 * ⚠️ `useSidebarOptional` et non `useSidebar` — et c'est « masqué en CSS » qui
 * l'impose. `/settings/*` tombait en erreur sur téléphone APRÈS le premier
 * correctif : `SettingsPage.tsx:62` rend la barre des Réglages dans
 * `MobileShell`, hors de tout `SidebarProvider`, et `SettingsNavbarBody.tsx:123`
 * rend ce bouton dans son en-tête. Masqué en CSS veut dire RENDU : le hook
 * s'exécutait, `useSidebar` levait, et la seule navigation des Réglages sur
 * téléphone était une page d'erreur. Le premier correctif avait guéri `Sidebar`
 * et `useSidebarCollapsePreference` ; il avait manqué ce troisième appelant.
 *
 * Sans état de repli, il n'y a rien à replier : on ne rend RIEN. Pas un bouton
 * inerte, qui se tabulerait pour ne rien faire.
 */
export const SidebarCollapseToggle = memo(function SidebarCollapseToggle() {
  const sidebar = useSidebarOptional()
  const { t } = useTranslation('nav')
  const collapsed = sidebar?.state === 'collapsed'
  const label = collapsed ? t('sidebar.expand') : t('sidebar.collapse')
  const Icon = collapsed ? PanelLeftOpen : PanelLeftClose
  // `⌘B` repliait la barre depuis toujours — le gestionnaire vit dans le
  // composant `Sidebar` de `packages/ui` — et il n'était écrit NULLE PART.
  // Un raccourci parfaitement fonctionnel que personne ne pouvait apprendre :
  // c'est le cas d'école du §30. La touche est déclarée au registre, et une
  // garde compare ce registre à la constante de `packages/ui`.
  const shortcut = shortcutById('sidebar')

  // Les hooks sont TOUS appelés avant ce retour : l'ordre des hooks ne dépend
  // jamais de la présence du fournisseur.
  if (!sidebar) {
    return null
  }
  const { toggleSidebar } = sidebar

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label={label}
          aria-keyshortcuts={shortcutAriaKeys(shortcut)}
          onClick={toggleSidebar}
          className="hidden size-7 pointer-coarse:size-11 shrink-0 cursor-pointer rounded-lg text-[var(--bellum-text-muted)] hover:bg-[var(--bellum-surface-2)] hover:text-[var(--bellum-text-primary)] md:inline-flex"
        >
          <Icon className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right">
        <span className="flex items-center gap-2">
          {label}
          <ShortcutKeys shortcut={shortcut} />
        </span>
      </TooltipContent>
    </Tooltip>
  )
})
