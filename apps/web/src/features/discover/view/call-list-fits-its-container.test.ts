import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * SIMON-FIX S.10 (recette 20/10) — /discover?type=calls : un tableau de 1 120 px dans un conteneur de 926 px,
 * colonne Action hors champ. Les planchers de colonnes ne doivent plus dépasser ce que le conteneur offre
 * (926 px = 57,875 rem, moins la case à cocher et les marges) ; l'Action reste dans le champ.
 */
describe('SIMON-FIX S.10 — la liste d’appels tient dans son conteneur', () => {
  const source = readFileSync(join(__dirname, 'CallListResults.tsx'), 'utf8')
  const header = source.slice(source.indexOf('<TableHeader'), source.indexOf('</TableHeader>'))

  it('la somme des planchers de colonnes laisse la place de la case à cocher', () => {
    const floors = [...header.matchAll(/<TableHead className="md:min-w-\[(\d+(?:\.\d+)?)rem\]">/g)].map(m =>
      Number(m[1]),
    )
    // LUDOVIC-F F.2 (LC.4) — un plancher peut être fractionnaire (7.5rem) : il compte aussi.
    expect(floors.length).toBe(6)
    const total = floors.reduce((sum, rem) => sum + rem, 0)
    // 926 px = 57,9 rem ; la case à cocher + les marges de cellule en prennent ~5 rem.
    expect(total).toBeLessThanOrEqual(54)
  })

  it('les gestes de la colonne Action s’empilent dès 768 px au lieu de s’aligner', () => {
    expect(source).toMatch(/flex flex-col gap-1 max-md:flex-row max-md:flex-wrap/)
  })
})
