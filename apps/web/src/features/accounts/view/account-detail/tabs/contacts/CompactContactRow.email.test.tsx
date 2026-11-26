import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Recette 21/10 A.5 (la cellule « Coordonnées » partagée porte désormais l'e-mail) — `break-all` coupait « associe » en deux dans une colonne de 98 px.
const source = readFileSync(join(__dirname, '../../../../../contacts/components/ContactCoordinatesCell.tsx'), 'utf8')

describe('CompactContactRow — l’e-mail ne se coupe pas au milieu d’un mot', () => {
  it('ni break-all, ni truncate ; la coupure passe par EmailWithBreaks', () => {
    const link = source.slice(source.indexOf('href={`mailto:${display.value}`}'))
    const tag = link.slice(0, link.indexOf('</a>'))
    expect(tag).not.toContain('break-all')
    expect(tag).not.toContain('truncate')
    expect(tag).toContain('<EmailWithBreaks email={display.value} />')
  })
})
