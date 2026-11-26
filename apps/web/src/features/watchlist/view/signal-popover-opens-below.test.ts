import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * SIMON-FIX S.16 (recette 20/10) — /mes-cibles : le popover d'un signal recouvrait deux puces de filtre. Il s'ouvrait
 * AU-DESSUS de la ligne (`side="top"`), c'est-à-dire sur la rangée de filtres qui précède le tableau.
 */
describe('SIMON-FIX S.16 — l’aperçu d’un signal ne recouvre pas les filtres', () => {
  const source = readFileSync(join(__dirname, 'WatchlistTable.tsx'), 'utf8')
  const content = source.slice(source.indexOf('<PopoverContent'), source.indexOf('</PopoverContent>'))

  it('s’ouvre sous la ligne, jamais au-dessus', () => {
    expect(content).toContain('side="bottom"')
    expect(content).not.toContain('side="top"')
  })
})
