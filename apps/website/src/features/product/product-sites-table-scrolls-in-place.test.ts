import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Écart figma-sync — le tableau de priorité des villes (`ProductSites.tsx`)
 * n'avait aucun conteneur `overflow-x-auto` : sous 360px, ses trois colonnes
 * (ville + région, type, fit) pouvaient déborder sur le CORPS de la page —
 * interdit par §5/§8 du design system (« ce qui défile horizontalement le
 * fait dans SON conteneur, le corps de la page ne défile jamais »).
 */

const SOURCE_PATH = join(__dirname, 'ProductSites.tsx')

function readSource(): string {
  return readFileSync(SOURCE_PATH, 'utf8')
}

describe('ProductSites — le tableau des villes défile dans son conteneur', () => {
  it('le <table> est enveloppé dans un conteneur overflow-x-auto', () => {
    const source = readSource()
    const match = source.match(/<div className="overflow-x-auto">\s*<table\b/)
    expect(match, 'un <div overflow-x-auto> immédiatement avant <table>').not.toBeNull()
  })

  it('le wrapper est bien refermé après </table> (pas de balise orpheline)', () => {
    const source = readSource()
    const tableIndex = source.indexOf('<table className="w-full border-collapse">')
    expect(tableIndex).toBeGreaterThan(-1)
    const afterTable = source.slice(tableIndex, tableIndex + 3000)
    const closeTableIndex = afterTable.indexOf('</table>')
    expect(closeTableIndex).toBeGreaterThan(-1)
    const afterCloseTable = afterTable.slice(closeTableIndex, closeTableIndex + 60)
    expect(afterCloseTable).toMatch(/<\/table>\s*<\/div>/)
  })
})
