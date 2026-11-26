import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Écart figma-sync — `ModeTabs` et `TabBar` débordaient de leur conteneur sous
 * 768px au lieu de défiler : la rangée d'onglets était un simple flex sans
 * `overflow-x-auto` ni `shrink-0` sur les boutons, donc un jeu d'onglets trop
 * large soit poussait le corps de page à défiler latéralement, soit écrasait
 * les libellés (flex-shrink par défaut).
 *
 * Le §5/§8 du design system : « ce qui défile horizontalement le fait dans
 * SON conteneur ». Même rendu quand ça tient — la garde vérifie donc la
 * PRÉSENCE des deux utilitaires, pas un changement de layout visible.
 */

const UI_SRC = join(__dirname, '..')

function readSource(relPath: string): string {
  return readFileSync(join(UI_SRC, relPath), 'utf8')
}

/** Le conteneur de la rangée porte `overflow-x-auto` (jamais `overflow-hidden` seul, qui empêcherait tout défilement). */
function rowScrolls(source: string): boolean {
  return /overflow-x-auto/.test(source)
}

/** Chaque bouton d'onglet porte `shrink-0` : il ne se comprime jamais, il pousse la rangée à défiler. */
function tabsNeverShrink(source: string): boolean {
  return /shrink-0/.test(source)
}

describe('ModeTabs et TabBar défilent en mobile au lieu de déborder', () => {
  it('ModeTabs (packages/ui/src/components/mode-tabs.tsx) : rangée scrollable, onglets non compressibles', () => {
    const source = readSource('components/mode-tabs.tsx')
    expect(rowScrolls(source), 'overflow-x-auto sur le conteneur de la rangée').toBe(true)
    expect(tabsNeverShrink(source), 'shrink-0 sur chaque bouton d’onglet').toBe(true)
  })

  it('TabBar (packages/ui/src/molecules/tab-bar.tsx) : rangée scrollable, onglets non compressibles', () => {
    const source = readSource('molecules/tab-bar.tsx')
    expect(rowScrolls(source), 'overflow-x-auto sur le conteneur de la rangée').toBe(true)
    expect(tabsNeverShrink(source), 'shrink-0 sur chaque bouton d’onglet').toBe(true)
  })

  it('SAIT DIRE NON — une rangée flex sans overflow-x-auto ni shrink-0 est détectée', () => {
    const snippet = `<div className="inline-flex rounded-lg"><button className="px-4">a</button></div>`
    expect(rowScrolls(snippet)).toBe(false)
    expect(tabsNeverShrink(snippet)).toBe(false)
  })
})
