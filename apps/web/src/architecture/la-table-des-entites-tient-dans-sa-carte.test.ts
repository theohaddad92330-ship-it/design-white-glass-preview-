import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Recette 21/10 (C.6, onglet sites) — la carte « Entités associées » rendait une table de 2 738 px
 * dans un conteneur de 1 479 px : la première cellule posait le nom (`noWrap`) puis trois badges
 * `shrink-0` sur UNE ligne insécable, et la colonne Périmètre sortait du champ. Le nom et ses badges
 * reviennent à la ligne ; jsdom ne met rien en page, d'où une garde sur la source.
 */
const source = readFileSync(
  join(__dirname, '../features/accounts/view/account-detail/components/EntitiesGraphCard.tsx'),
  'utf8',
)
const start = source.indexOf('<TableCell className={rowCellClass}>')
const firstCell = source.slice(start, source.indexOf('</TableCell>', start))

describe('la table des entités tient dans sa carte', () => {
  it('lit bien la première cellule d’une ligne', () => {
    expect(firstCell).toContain('row.entity.name')
  })

  it('le nom et ses badges reviennent à la ligne au lieu d’élargir la table', () => {
    expect(firstCell).toMatch(/className="[^"]*\bflex-wrap\b[^"]*"/)
    expect(firstCell).not.toMatch(/\bnoWrap\b/)
  })
})
