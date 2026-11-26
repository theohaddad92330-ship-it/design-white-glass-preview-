import type { ConnectedTool } from '@bellum/contracts'
import { DEMO_LISTED_CRM_PROVIDERS, DEMO_RECONNECT_PROVIDERS, withDemoConnections } from './demo-connections'

const tool = (provider: string, status: string): ConnectedTool =>
  ({
    provider,
    display_name: provider,
    status,
    capability_state: 'unknown',
    last_sync: null,
    capabilities: [],
  }) as unknown as ConnectedTool

describe('withDemoConnections — recette R24 (15/10/2026)', () => {
  const NOW = new Date('2026-10-15T10:00:00.000Z')

  it('liste en « à brancher » les CRM que le serveur n’offre pas, jamais en « connecté »', () => {
    const out = withDemoConnections(
      DEMO_LISTED_CRM_PROVIDERS.map(provider => tool(provider, 'coming_soon')),
      NOW,
    )
    expect(DEMO_LISTED_CRM_PROVIDERS).toEqual(expect.arrayContaining(['zoho', 'pipedrive', 'attio']))
    expect(out.every(t => t.status === 'available')).toBe(true)
  })

  it('un CRM déjà « à brancher » ou « connecté » n’est pas touché ; HubSpot reste branché (démonstration)', () => {
    const out = withDemoConnections(
      [tool('zoho', 'connected'), tool('salesforce', 'available'), tool('hubspot', 'available')],
      NOW,
    )
    expect(out.map(t => t.status)).toEqual(['connected', 'available', 'connected'])
  })

  it('un outil hors CRM en « bientôt » reste « bientôt »', () => {
    expect(withDemoConnections([tool('notion', 'coming_soon')], NOW)[0]?.status).toBe('coming_soon')
  })
})

describe('withDemoConnections — #5048 une puce « à reconnecter » en salle de démonstration', () => {
  const NOW = new Date('2026-10-31T10:00:00.000Z')

  it('montre au moins un outil « à reconnecter » (action requise), jamais « connecté »', () => {
    expect(DEMO_RECONNECT_PROVIDERS.length).toBeGreaterThan(0)
    const out = withDemoConnections(
      DEMO_RECONNECT_PROVIDERS.map(provider => tool(provider, 'available')),
      NOW,
    )
    expect(out.every(t => t.status === 'action_required')).toBe(true)
  })

  it('les outils branchés de la salle restent connectés (au moins un outil lu)', () => {
    const out = withDemoConnections([tool('gmail', 'available'), tool('hubspot', 'available')], NOW)
    expect(out.map(t => t.status)).toEqual(['connected', 'connected'])
  })
})
