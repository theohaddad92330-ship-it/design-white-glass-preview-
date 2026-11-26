import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { i18n } from '@/i18n'
import { ROUTE_META, routeMetaFor } from './route-titles'

/** Every route id TanStack generated, read from the generated tree so a new
 *  route shows up here the moment it is created. */
function generatedRouteIds(): string[] {
  const tree = readFileSync(resolve(process.cwd(), 'src/routeTree.gen.ts'), 'utf8')
  const ids = new Set<string>()
  for (const match of tree.matchAll(/id: '([^']+)'/g)) {
    const id = match[1]
    // Keep absolute ids only; nested relative ids ('/$stage', '/context'…) are
    // fragments of a full id that also appears on its own.
    if (id && id.startsWith('/')) ids.add(id)
  }
  return [...ids]
}

/** Layout routes render an <Outlet/>; their child carries the title. */
const LAYOUT_ROUTE_IDS = new Set(['/onboarding/$id/$stage', '/settings/profile'])

/** Relative child ids emitted inside a nested route's options. */
// `/$accountId` est le fragment relatif émis DANS les options de
// `/pilotage/memoire-collective` ; son id absolu
// (`/pilotage/memoire-collective/$accountId`) est déclaré dans ROUTE_META, et
// c'est lui qui porte le titre.
const RELATIVE_CHILD_IDS = new Set([
  '/$slug',
  '/$stage',
  '/context',
  '/identity',
  '/$accountId',
  // `/audit` est le fragment relatif emis DANS les options de
  // `/settings/profile` ; son id absolu (`/settings/profile/audit`) est
  // declare dans ROUTE_META, et c'est lui qui porte le titre.
  '/audit',
])

describe('route titles', () => {
  it('covers every generated route — no screen can inherit the previous title', () => {
    const missing = generatedRouteIds().filter(
      id => !ROUTE_META[id] && !LAYOUT_ROUTE_IDS.has(id) && !RELATIVE_CHILD_IDS.has(id),
    )
    expect(missing).toEqual([])
  })

  it('maps no route that does not exist any more', () => {
    const known = new Set(generatedRouteIds())
    expect(Object.keys(ROUTE_META).filter(id => !known.has(id))).toEqual([])
  })

  it('resolves every title key in FR and EN — never renders a raw key', async () => {
    // A missing key resolves to the key MINUS its namespace, so compare against
    // both forms — otherwise a missing translation slips through.
    const unresolved = (key: string) => {
      const value = i18n.t(key)
      return value === key || value === key.slice(key.indexOf(':') + 1) || value.length === 0
    }
    const broken: string[] = []
    for (const language of ['fr', 'en']) {
      await i18n.changeLanguage(language)
      for (const [routeId, meta] of Object.entries(ROUTE_META)) {
        if (unresolved(meta.titleKey)) broken.push(`${language} ${routeId} → ${meta.titleKey}`)
        if (meta.descriptionKey && unresolved(meta.descriptionKey)) {
          broken.push(`${language} ${routeId} → ${meta.descriptionKey}`)
        }
      }
    }
    await i18n.changeLanguage('fr')
    expect(broken).toEqual([])
  })

  it('picks the DEEPEST matched route, not the layout', () => {
    expect(routeMetaFor(['/', '/settings/profile', '/settings/profile/identity'])?.titleKey).toBe(
      'routes:settingsProfileIdentity.title',
    )
  })

  it('falls back to the closest known ancestor for an unmapped child', () => {
    expect(routeMetaFor(['/settings/', '/settings/unknown-future'])?.titleKey).toBe('routes:settings.title')
  })

  it('returns null when nothing matches', () => {
    expect(routeMetaFor(['/nope'])).toBeNull()
  })
})
