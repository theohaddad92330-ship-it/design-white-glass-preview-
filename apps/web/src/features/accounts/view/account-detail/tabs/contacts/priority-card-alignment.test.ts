import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * SIMON-FIX S.9 (recette 20/10) — « Pourquoi ce rang ? » à x=870 sur sept lignes et x=1013 sur trois : la
 * colonne d'actions de la carte prenait la largeur de ses boutons, donc la colonne centrale bougeait avec elle.
 * Les trois colonnes de la carte ont une largeur qui ne dépend ni du nom ni du libellé du bouton.
 */
describe('SIMON-FIX S.9 — alignement constant de la carte contact prioritaire', () => {
  const source = readFileSync(join(__dirname, 'PriorityPathSection.tsx'), 'utf8')

  it('la colonne identité garde une largeur fixe en fraction (md:w-2/5)', () => {
    expect(source).toMatch(/className="flex items-start gap-3 md:w-2\/5 md:shrink-0"/)
  })

  it('la colonne d’actions a une largeur fixe, pas celle de ses boutons', () => {
    expect(source).toMatch(/className="mt-auto flex flex-wrap gap-2 pt-4 md:mt-0 md:w-64 md:shrink-0 md:pt-0"/)
  })
})
