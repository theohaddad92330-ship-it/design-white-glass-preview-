import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { ScrollArea } from '@bellum/ui'

/**
 * Contrat structurel du primitif `ScrollArea` (packages/ui).
 *
 * jsdom ne calcule aucune mise en page : on ne peut pas asserter `scrollHeight`.
 * On épingle donc l'INVARIANT STRUCTUREL qui rend le défilement possible —
 * c'est exactement ce qui manquait et qui a produit deux popovers rognés
 * (Notifications, Nouveautés).
 *
 * Le piège : le Root est `overflow-hidden` et le viewport `h-full`. Quand un
 * appelant ne donne au Root qu'un `max-h-*` (et pas de hauteur définie),
 * `height:100%` retombe sur `auto` — le viewport prend la hauteur du CONTENU,
 * n'a donc rien à faire défiler, et le Root le ROGNE. Contenu coupé, aucune
 * barre de défilement, aucun recours au clavier ou à la molette.
 */
describe('ScrollArea — contrat de défilement', () => {
  it('borne le viewport quand le Root ne porte QU’un max-height', () => {
    const { container } = render(
      <ScrollArea className="max-h-40">
        <div>contenu très long</div>
      </ScrollArea>,
    )

    const viewport = container.querySelector('[data-radix-scroll-area-viewport]')
    expect(viewport).not.toBeNull()
    // `max-h-[inherit]` redonne au viewport la borne du Root : il redevient le
    // conteneur de défilement au lieu d'être rogné. No-op quand le Root n'a pas
    // de max-height (inherit vaut alors `none`).
    expect(viewport?.className).toContain('max-h-[inherit]')
  })

  it('contraint le contenu à la largeur du viewport', () => {
    const { container } = render(
      <ScrollArea className="max-h-40">
        <p>texte</p>
      </ScrollArea>,
    )

    const viewport = container.querySelector('[data-radix-scroll-area-viewport]')
    const wrapper = viewport?.firstElementChild as HTMLElement | null

    // Radix enveloppe le contenu dans un `display:table` (il s'en sert pour
    // mesurer la largeur). Une table est en largeur « shrink-to-fit » : une
    // ligne `truncate` (white-space:nowrap) l'élargit AU-DELÀ du viewport.
    // Or l'overflow-x du viewport vaut toujours `hidden` ici — aucune barre
    // horizontale n'est montée par ce composant — donc le débord est coupé
    // sans recours. C'est le « texte coupé à droite » des notifications.
    expect(wrapper?.style.display).toBe('table')
    // …d'où l'override : en `block`, le wrapper est borné par le viewport et
    // `truncate` / le retour à la ligne refonctionnent.
    expect(viewport?.className).toContain('[&>div]:!block')
  })
})
