import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { RITUAL_CATALOG } from '@bellum/contracts'

/**
 * Un ordre du jour dont un point ouvre « Page introuvable » se saute — et une
 * fois qu'un point se saute, la réunion perd son standard.
 *
 * Même mécanisme que `hygiene-routes.spec.ts` et `briefing-routes.spec.ts` : une
 * destination est une CHAÎNE dans le catalogue et un fichier de route côté web.
 * Rien ne les relie sauf ce test.
 */
function readWebRoutePaths(): string[] {
  const path = join(__dirname, '..', '..', '..', '..', 'web', 'src', 'routeTree.gen.ts')
  const source = readFileSync(path, 'utf8')
  const start = source.indexOf('export interface FileRoutesByTo {')
  const end = source.indexOf('export interface FileRoutesById {')
  const block = source.slice(start, end)
  return [...block.matchAll(/^\s*'([^']+)':/gm)].map(match => match[1] as string)
}

describe('les rituels ouvrent des écrans qui existent', () => {
  const routes = readWebRoutePaths()

  it('chaque lien d’ordre du jour est une route réelle', () => {
    const broken = RITUAL_CATALOG.flatMap(ritual =>
      ritual.agenda
        .filter(item => item.link !== null && !routes.includes(item.link))
        .map(item => `${ritual.key} #${item.position} → ${item.link}`),
    )
    expect(broken).toEqual([])
  })

  it('la garde lit bien quelque chose', () => {
    expect(routes.length).toBeGreaterThan(20)
    expect(RITUAL_CATALOG.flatMap(ritual => ritual.agenda).some(item => item.link !== null)).toBe(true)
  })
})
