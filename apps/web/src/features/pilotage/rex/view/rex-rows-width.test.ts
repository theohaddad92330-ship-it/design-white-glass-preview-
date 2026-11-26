import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// #3295.3 (18/10) — recette prod : trois `li` de « Règles apprises » à 617 px dans un `ul` de 1206 px.
// Cause : le repli D81 d'index.css (`:where(p, li…) { max-width: 70ch }`) borne tout `li` sans `w-full`
// ni bouton — or les boutons de ces lignes sont conditionnés au droit de décider.
const dir = __dirname
const sources = readdirSync(dir).filter(f => f.endsWith('.tsx') && !f.endsWith('.test.tsx'))

describe('les lignes de la page REX ne tombent pas sous la largeur de lecture', () => {
  it('lit bien un corpus de lignes', () => {
    const count = sources.reduce((n, f) => n + [...readFileSync(join(dir, f), 'utf8').matchAll(/<li\b/g)].length, 0)
    // Théo PR12 : la file « À recueillir » est passée au tableau commun (ResponsiveTable) — un <li> de moins ici.
    expect(count).toBeGreaterThanOrEqual(4)
  })

  it('chaque <li> porte w-full', () => {
    const offenders: string[] = []
    for (const f of sources) {
      for (const tag of readFileSync(join(dir, f), 'utf8').matchAll(/<li\b([^>]*)>/g)) {
        if (!/\bw-full\b/.test(tag[1])) offenders.push(`${f}: ${tag[0]}`)
      }
    }
    expect(offenders).toEqual([])
  })
})
