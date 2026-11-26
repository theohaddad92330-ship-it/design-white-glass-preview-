import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RapportPremierePreuve } from './premiere-preuve.client'

/**
 * issue 2076.13 — l'écran Produit › Première preuve : la recette produit des
 * verdicts « juste / partielle / fausse / incomplète ». Ce qui compte : les
 * quatre verdicts partagés sont lus, les privés sont un COMPTE, l'absence de
 * verdict partagé se dit « non mesuré » (jamais 0 %), une panne se dit, FR et EN.
 */
;(globalThis as unknown as { React: typeof React }).React = React

const langue = vi.hoisted(() => ({ value: 'fr' as 'fr' | 'en' }))

vi.mock('@/lib/i18n', async () => {
  const actual = await vi.importActual<typeof import('@/lib/i18n')>('@/lib/i18n')
  return { ...actual, getLang: () => langue.value }
})

vi.mock('./premiere-preuve.client', async () => {
  const actual = await vi.importActual<typeof import('./premiere-preuve.client')>('./premiere-preuve.client')
  return { ...actual, fetchFirstProofVerdicts: vi.fn() }
})

import { fetchFirstProofVerdicts } from './premiere-preuve.client'
import PremierePreuvePage from './page'

const fetchReport = vi.mocked(fetchFirstProofVerdicts)

function rapport(overrides: Partial<RapportPremierePreuve> = {}): RapportPremierePreuve {
  return {
    windowDays: 90,
    verdicts: { juste: 7, partiel: 3, faux: 1, manquant: 2 },
    shared: 13,
    distinctWorkspaces: 4,
    withheldPrivate: 21,
    computedAt: '2026-09-24T08:00:00.000Z',
    ...overrides,
  }
}

async function rendu(): Promise<string> {
  return renderToStaticMarkup(await PremierePreuvePage())
}

describe('/produit/premiere-preuve — issue 2076.13', () => {
  beforeEach(() => {
    fetchReport.mockReset()
    langue.value = 'fr'
  })

  it('lit les quatre verdicts partagés et compte ce qui reste privé', async () => {
    fetchReport.mockResolvedValue(rapport())
    const html = await rendu()
    for (const libelle of ['Juste', 'Partielle', 'Fausse', 'Incomplète']) expect(html).toContain(libelle)
    expect(html).toContain('Verdicts restés privés')
    expect(html).toContain('21')
  })

  it('sait dire NON — aucun verdict partagé : « non mesuré », jamais un tableau à zéro', async () => {
    fetchReport.mockResolvedValue(
      rapport({ verdicts: { juste: 0, partiel: 0, faux: 0, manquant: 0 }, shared: 0, distinctWorkspaces: 0 }),
    )
    const html = await rendu()
    expect(html).toContain('n’est pas mesurée')
    expect(html).not.toContain('<table')
  })

  it('une panne se dit', async () => {
    fetchReport.mockRejectedValue(new Error('first-proof-verdicts endpoint returned 503'))
    expect(await rendu()).toContain('Impossible de lire les verdicts de première preuve')
  })

  it('parle anglais', async () => {
    langue.value = 'en'
    fetchReport.mockResolvedValue(rapport())
    const html = await rendu()
    expect(html).toContain('First proof — verdicts on known accounts')
    expect(html).toContain('Incomplete')
  })
})
