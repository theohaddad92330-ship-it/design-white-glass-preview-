import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RapportNonCompris } from './unrouted-intents.client'

/**
 * Issue 1949.23 — décision Louis 13/09 batch 12 : l'écran Produit › Laura — non
 * compris. Ce qui compte : le texte d'une demande n'apparaît que publié par
 * l'API (plancher déjà appliqué), le nombre de demandes retenues est DIT, une
 * panne se dit, et l'écran parle FR et EN.
 */
;(globalThis as unknown as { React: typeof React }).React = React

const langue = vi.hoisted(() => ({ value: 'fr' as 'fr' | 'en' }))

vi.mock('@/lib/i18n', async () => {
  const actual = await vi.importActual<typeof import('@/lib/i18n')>('@/lib/i18n')
  return { ...actual, getLang: () => langue.value }
})

vi.mock('./unrouted-intents.client', async () => {
  const actual = await vi.importActual<typeof import('./unrouted-intents.client')>('./unrouted-intents.client')
  return { ...actual, fetchUnroutedIntents: vi.fn() }
})

import { fetchUnroutedIntents } from './unrouted-intents.client'
import LauraNonComprisPage from './page'

const fetchReport = vi.mocked(fetchUnroutedIntents)

function rapport(overrides: Partial<RapportNonCompris> = {}): RapportNonCompris {
  return {
    windowDays: 90,
    minDistinctOccurrences: 5,
    recorded: 14,
    groups: [
      {
        text: 'Réserve-moi un train pour Lyon',
        occurrences: 7,
        distinctOccurrences: 6,
        surfaces: ['chat', 'account'],
        categories: ['capacite_absente'],
        languages: ['fr'],
      },
    ],
    withheldGroups: 2,
    computedAt: '2026-09-13T08:00:00.000Z',
    ...overrides,
  }
}

async function rendu(): Promise<string> {
  return renderToStaticMarkup(await LauraNonComprisPage())
}

// ⚠️ « issue 1949.23 » et non le numéro précédé d'un dièse : la garde des
// couleurs (#1642) lit un dièse suivi de quatre chiffres comme un hexadécimal.
describe('/produit/laura-non-compris — issue 1949.23', () => {
  beforeEach(() => {
    fetchReport.mockReset()
    langue.value = 'fr'
  })

  it('une demande publiée montre son texte masqué, ses occurrences distinctes, sa catégorie et ses écrans', async () => {
    fetchReport.mockResolvedValue(rapport())
    const html = await rendu()
    expect(html).toContain('Laura — demandes non comprises')
    expect(html).toContain('Réserve-moi un train pour Lyon')
    expect(html).toContain('Capacité absente')
    expect(html).toContain('Laura (plein écran)')
    expect(html).toContain('Fiche compte')
    expect(html).toContain('>6<')
  })

  it('dit ce qui est gardé et ce qui ne l’est pas — anonyme, masqué, 90 jours', async () => {
    fetchReport.mockResolvedValue(rapport())
    const html = await rendu()
    expect(html).toContain('anonyme')
    expect(html).toContain('masqué')
    expect(html).toContain('90 jours')
  })

  it('les demandes retenues sous le plancher sont COMPTÉES et nommées, jamais montrées', async () => {
    fetchReport.mockResolvedValue(rapport())
    const html = await rendu()
    expect(html).toContain('2 demandes pas encore assez répétées (moins de 5 occurrences distinctes)')
  })

  it('rien n’a encore atteint le plancher → un état vide qui NOMME le plancher', async () => {
    fetchReport.mockResolvedValue(rapport({ groups: [], withheldGroups: 4 }))
    const html = await rendu()
    expect(html).toContain('Aucune demande n’a encore atteint le plancher de 5 occurrences distinctes.')
  })

  it('un compte illisible rend un tiret, jamais « 0 »', async () => {
    fetchReport.mockResolvedValue(rapport({ recorded: null }))
    const html = await rendu()
    expect(html).toContain('—')
  })

  it('une panne de l’API se DIT — jamais un écran vide qui la cacherait', async () => {
    fetchReport.mockRejectedValue(new Error('laura-unrouted-intents endpoint returned 500 Internal Server Error'))
    const html = await rendu()
    expect(html).toContain('Impossible de lire les demandes non comprises')
    expect(html).toContain('500')
  })

  it('parle anglais quand l’opérateur l’a choisi', async () => {
    langue.value = 'en'
    fetchReport.mockResolvedValue(rapport())
    const html = await rendu()
    expect(html).toContain('Laura — requests not understood')
    expect(html).toContain('Missing capability')
    expect(html).toContain('2 requests not repeated enough yet (fewer than 5 distinct occurrences)')
  })
})
