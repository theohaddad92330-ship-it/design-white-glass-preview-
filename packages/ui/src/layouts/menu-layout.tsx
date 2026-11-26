import { memo, type ReactNode } from 'react'
import { MainContainer } from '../atoms/container'
import { SidebarProvider } from '../components/sidebar'

export type MenuLayoutProps = {
  menuBody: ReactNode
  pageContent: ReactNode
  /** Optional full-width banner pinned at the top of the content card
   *  (e.g. a demo-mode notice). Renders nothing when omitted. */
  banner?: ReactNode
  /** Optional full-width footer rendered under the content card. */
  footer?: ReactNode
}

export const MenuLayout = memo<MenuLayoutProps>(function MenuLayout(props: MenuLayoutProps) {
  const { menuBody, pageContent, banner, footer } = props

  return (
    <SidebarProvider className="!min-h-0 h-full">
      {menuBody}
      {/*
        #1701 — `p-2` et non `m-2`. Une MARGE se paie EN DEHORS de la boîte :
        `h-full` prend déjà 100 % du parent, et les 8 px de marge s'ajoutent
        par-dessus. La boîte dépassait donc son parent de 16 px, sur TOUS les
        écrans de l'application puisque `MenuLayout` les enveloppe tous — et ce
        dépassement faisait défiler le CORPS de la page sous `#app-shell`, dans
        une zone que personne ne peint. Mesuré en production le 07/09/2026 sur
        /dashboard : `scrollHeight` 869 pour un `clientHeight` de 861.
        Un `padding` se paie DEDANS : même gouttière de 8 px à l'œil, plus
        aucun débordement.

        `max-h-[98vh]` a disparu avec la cause : c'était le pansement posé sur
        ce même dépassement (rogner 2 % de l'écran pour que la marge « rentre »),
        et il redéclarait la hauteur du viewport à l'intérieur du viewport —
        exactement ce que GA-256 interdit désormais.
      */}
      {/* Coque Théo (23/10/2026) — la maquette pose le contenu À PLAT contre la barre latérale (son
          liseré droit sépare les deux), sur le fond de page : plus de gouttière de 8 px ni de cadre
          arrondi autour. La structure (deux `data-slot`, `flex-1 min-h-0`) est celle de #1701. */}
      <div data-slot="menu-page-shell" className="flex h-full w-full flex-col overflow-hidden">
        {banner}
        {/*
          #1701 — `min-h-0 flex-1` et non `h-full`. Le cadre a deux frères
          possibles (le bandeau au-dessus, le pied de page en dessous) dans un
          parent en `flex-col` : `h-full` lui fait réclamer 100 % de la hauteur
          du parent SANS compter ses frères, donc le pied de page sort du cadre
          et le total dépasse. `flex-1` réclame ce qui RESTE — la seule mesure
          qui tienne compte des frères — et `min-h-0` l'autorise à descendre
          sous la hauteur de son contenu, sans quoi il refuserait de rétrécir.
        */}
        <div
          data-slot="menu-page-content-frame"
          className="flex w-full min-h-0 flex-1 flex-col overflow-hidden bg-[var(--bellum-bg)]"
        >
          <MainContainer className="flex min-h-0 flex-1 flex-col">{pageContent}</MainContainer>
        </div>
        {footer}
      </div>
    </SidebarProvider>
  )
})
