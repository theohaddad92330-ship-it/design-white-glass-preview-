import { describe, expect, it } from 'vitest'

import tokensJson from '../../generated/tokens.json'
import type { TokenSet } from '../extract/types'
import { PAGES } from '../spec/pages'
import { buildComponents, buildPages, buildTemplates, type BuildContext } from './builders'
import { createFakeFigma, createMemoryLog } from './fake-figma'
import { createFakeScene } from './fake-scene'
import { FIGMA_PAGES } from './pages'
import { frameName } from './pages/render'
import { findTemplateVariant } from './templates/layout'
import { upsertPages } from './upsert'
import { syncVariables } from './variables'

/**
 * Défaut M (25/09/2026) : dans Figma, la synchronisation s'est ARRÊTÉE après « Site » — aucune page DM.
 * Une exception dans un cadre ne doit jamais emporter le reste : le plugin journalise une ERREUR qui nomme
 * le cadre, et continue cadre par cadre, page par page, surface par surface.
 */
describe('résilience — une exception dans un cadre n’arrête pas la synchronisation', () => {
  it('un gabarit qui lève sur le site : erreur journalisée, les autres cadres ET les pages DM sont dessinés', async () => {
    const tokens = tokensJson as unknown as TokenSet
    const vars = createFakeFigma()
    const variables = await syncVariables(vars.api, tokens, createMemoryLog())
    const scene = createFakeScene()
    upsertPages(scene.api as never, FIGMA_PAGES)
    const log = createMemoryLog()
    const ctx: BuildContext = { tokens, variables, log, draw: scene.api, widths: [1440, 390] }
    await buildComponents(ctx)
    await buildTemplates(ctx)
    const site = PAGES.filter(p => p.surface === 'site').slice(0, 2)
    const dm = PAGES.filter(p => p.surface === 'dm').slice(0, 2)
    const templates = scene.pages.find(p => p.name === 'Templates') as unknown as PageNode
    const broken = findTemplateVariant(templates, site[0]?.template ?? 'marketing', 1440) as ComponentNode
    broken.createInstance = () => {
      throw new Error('boum')
    }
    await buildPages(ctx, 'site', site)
    await buildPages(ctx, 'dm', dm)

    const errors = log.lines.filter(l => l.level === 'error').map(l => l.text)
    expect(errors.some(e => e.includes(frameName(site[0]?.id ?? '', 1440, 'default')) && e.includes('boum'))).toBe(true)
    const names = scene.pages.flatMap(p => p.children.map(c => c.name))
    // Le même gabarit à 390 px, et les pages DM, sont dessinés malgré l'exception.
    expect(names).toContain(frameName(site[0]?.id ?? '', 390, 'default'))
    for (const spec of dm) expect(names).toContain(frameName(spec.id, 1440, 'default'))
  }, 120_000)
})
