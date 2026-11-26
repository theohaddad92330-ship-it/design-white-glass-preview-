import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { GUIDE_REGISTRY } from './guide-registry'

/**
 * #2214.24 — LES GUIDES MARCHENT EN DÉMONSTRATION (craft rule n°9).
 *
 * La démonstration n'a pas d'écrans à elle : après `/demo`, le prospect
 * parcourt les MÊMES routes, sous un espace de démonstration. Un guide y marche
 * donc tant que (1) la route qu'il ouvre existe, et (2) cette route ne remplace
 * pas son écran par un autre en démonstration — c'est exactement ce que faisait
 * `/chat` avant (`isDemo ? <DemoChat /> : <Chat />`) : l'écran de démonstration
 * n'aurait porté AUCUN des ancrages, et le guide aurait sauté chaque pas en
 * silence, devant le prospect.
 *
 * Ce test lit les fichiers de route (commentaires retirés : le commentaire de
 * `/chat` qui raconte l'ancien branchement ne doit pas l'accuser).
 */
const ROUTES_DIR = join(__dirname, '../../routes')

/** `/missions` → `missions/index.tsx`, `/settings/import` → `settings/import.tsx`, `/accounts/` → `accounts/$id.tsx`. */
function routeFile(route: string): string {
  if (route === '/accounts/') return join(ROUTES_DIR, 'accounts/$id.tsx')
  const bare = route.replace(/^\//, '')
  const index = join(ROUTES_DIR, bare, 'index.tsx')
  return existsSync(index) ? index : join(ROUTES_DIR, `${bare}.tsx`)
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

const DEMO_BRANCH = /\b(?:useIsDemo|isDemo|is_demo)\b/

describe('les guides d’écran marchent en démonstration (#2214.24, craft rule n°9)', () => {
  const screens = GUIDE_REGISTRY.flatMap(definition => (definition.help.screen ? [definition.help.screen.route] : []))

  it('a des écrans à lire', () => {
    expect(screens.length).toBeGreaterThanOrEqual(11)
  })

  it('chaque écran de guide a sa route dans le produit', () => {
    for (const route of screens) expect(existsSync(routeFile(route)), route).toBe(true)
  })

  it('aucune route de guide ne bascule sur un autre écran en démonstration', () => {
    for (const route of screens) {
      const source = stripComments(readFileSync(routeFile(route), 'utf8'))
      expect(DEMO_BRANCH.test(source), route).toBe(false)
    }
  })

  it('sait dire NON : un branchement de démonstration est vu', () => {
    expect(DEMO_BRANCH.test(stripComments('const Screen = isDemo ? DemoChat : Chat'))).toBe(true)
    expect(DEMO_BRANCH.test(stripComments('// autrefois : isDemo ? <DemoChat /> : <Chat />'))).toBe(false)
  })
})
