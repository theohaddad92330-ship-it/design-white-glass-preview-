import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// #4300 — sur /discover le titre, le contexte et les pistes rapides sont à gauche, mais l'encart de
// recherche et ses résultats étaient la colonne DROITE d'une grille à deux colonnes (left=553 contre 273).
// Une colonne de lecture : la recherche et les résultats s'alignent avec le reste, « Ta cible » passait dessous — retiré par #4530.5.
const source = readFileSync(join(__dirname, 'Discover.tsx'), 'utf8')

describe('Découvrir — une colonne de lecture (#4300)', () => {
  it('ne range plus la recherche en colonne droite d’une grille à deux colonnes', () => {
    expect(source).not.toMatch(/lg:grid-cols-\[\d+px_minmax\(0,1fr\)\]/)
  })

  it('#4530.5 — plus de panneau « Ta cible » sous les résultats : « Ma cible » est un bouton dans la barre', () => {
    expect(source).not.toContain('<DiscoverSidebar')
    expect(source).toContain('<MyTargetToggle')
  })
})
