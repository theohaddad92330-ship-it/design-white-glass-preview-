import type { ConnectedTool } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { demoConnectedNames } from './demo-connection-label'

/**
 * G.6 (recette R3, 19/10) — /settings/integrations n'affichait aucun
 * « (démonstration) » sur Gmail et HubSpot : l'overlay du registre
 * (`tool-registry/demo-connections.ts`) pose `display_name`, mais aucune carte
 * ne le lit. La mention se dérive donc ici, des outils CONNECTÉS, en démo seulement.
 */
const tool = (provider: string, status: ConnectedTool['status']): ConnectedTool =>
  ({ provider, family: provider === 'gmail' ? 'email' : 'crm', status, capabilities: [] }) as unknown as ConnectedTool

describe('demoConnectedNames', () => {
  it('en démo, nomme les outils connectés (Gmail, HubSpot)', () => {
    expect(demoConnectedNames([tool('gmail', 'connected'), tool('hubspot', 'connected')], true).sort()).toEqual([
      'Gmail',
      'HubSpot',
    ])
  })

  it('sait dire NON : hors démo, ou outil non connecté, aucune mention', () => {
    expect(demoConnectedNames([tool('gmail', 'connected')], false)).toEqual([])
    expect(demoConnectedNames([tool('gmail', 'available')], true)).toEqual([])
    expect(demoConnectedNames([], true)).toEqual([])
  })
})
