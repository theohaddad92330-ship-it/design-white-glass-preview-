import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * KEVIN-FIX (d) — le bouton qui lance mesurait 36 px de haut (recette prod 20/10, GA-35 : cible ≥ 44 px).
 * #4493 — c'est désormais « Explorer », au bout du champ libre. La garde lit CE bouton, et sait dire NON :
 * un `h-9` (36 px) y est refusé.
 */
describe('FilterRail — le bouton qui lance est une cible ≥ 44 px', () => {
  const source = readFileSync(join(__dirname, 'FilterRail.tsx'), 'utf8')
  const end = source.indexOf("{t('explore.submit')}")
  const start = source.lastIndexOf('<Button', end)
  const block = source.slice(start, end)

  it('lit bien le bouton de lancement', () => {
    expect(start).toBeGreaterThan(0)
    expect(block).toContain('type="submit"')
    expect(block).toContain("guideAnchorProps('decouvrir.lancer')")
  })

  it('porte h-11 (44 px) et non h-9 (36 px)', () => {
    expect(block).toMatch(/\bh-11\b/)
    expect(block).not.toMatch(/\bh-9\b/)
  })
})
