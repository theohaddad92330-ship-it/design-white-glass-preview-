import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
;(globalThis as unknown as { React: typeof React }).React = React

vi.mock('@/lib/tool-registry', () => ({ fetchScopeGaps: vi.fn() }))

import { fetchScopeGaps } from '@/lib/tool-registry'
import { ScopeGapsPanel } from './scope-gaps-panel'

const fetchGaps = vi.mocked(fetchScopeGaps)

async function rendu(): Promise<string> {
  return renderToStaticMarkup(await ScopeGapsPanel())
}

beforeEach(() => {
  fetchGaps.mockReset()
})

describe('SCOPES-I.4 — connexions incomplètes', () => {
  it('nomme le connecteur, les espaces et les portées manquantes', async () => {
    fetchGaps.mockResolvedValue({
      connectors: [
        {
          provider: 'hubspot',
          label: 'HubSpot',
          workspaces: 3,
          users: 4,
          appSide: 1,
          missingScopes: [{ scope: 'crm.objects.deals.read', workspaces: 3 }],
        },
      ],
    })
    const html = await rendu()
    expect(html).toContain('HubSpot')
    expect(html).toContain('crm.objects.deals.read')
    expect(html).toContain('3 espaces')
  })

  it('dit « aucune » quand rien ne manque, et « indisponible » quand on n’a pas pu regarder', async () => {
    fetchGaps.mockResolvedValue({ connectors: [] })
    expect(await rendu()).toContain('Aucune connexion incomplète')
    fetchGaps.mockImplementation(() => {
      throw new Error('boom')
    })
    expect(await rendu()).toContain('Liste indisponible')
  })
})
