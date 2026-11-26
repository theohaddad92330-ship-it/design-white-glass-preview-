import type { CapabilityDescriptor, ConnectedTool } from '@bellum/contracts'
import { demoAtsConnection } from '../demo/demo-dataset'
import { withDemoConnections } from '../tool-registry/demo-connections'
import { AtsCredentialsService } from './ats-credentials.service'
import { AtsService } from './ats.service'

/**
 * #4689 — recette écran du 28/10 : en démonstration la CARTE BoondManager disait « Non connecté » pendant que le
 * PANNEAU disait « Branché ». La carte lit le registre d'outils (`/tools`), le panneau lit `AtsService.status` :
 * deux sources, deux réponses. Les deux ne doivent plus pouvoir diverger, ni sur l'état ni sur la date du dernier
 * échange — qui vient de `demoAtsConnection`, la seule définition de la connexion de démonstration.
 */
const boondTool = (status: ConnectedTool['status']): ConnectedTool =>
  ({
    provider: 'boondmanager',
    display_name: 'BoondManager',
    status,
    capability_state: 'not_connected',
    last_sync: null,
    capabilities: [] as CapabilityDescriptor[],
  }) as unknown as ConnectedTool

function demoAtsService() {
  return new AtsService(
    { findOne: jest.fn(async () => null) } as never,
    {
      resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'w1' }),
      isDemoWorkspace: jest.fn().mockResolvedValue(true),
    } as never,
    new AtsCredentialsService({} as never),
  )
}

describe('#4689 — la connexion BoondManager de démonstration a UNE source pour la carte et le panneau', () => {
  it('le registre (carte) et le statut ATS (panneau) disent « branché » tous les deux', async () => {
    const panel = await demoAtsService().status('u1')
    const [card] = withDemoConnections([boondTool('available')], new Date())
    expect(panel.connected).toBe(true)
    expect(card?.status).toBe('connected')
  })

  it('même date de dernier échange sur la carte et dans le panneau, tirée de demoAtsConnection', async () => {
    const now = new Date()
    const panel = await demoAtsService().status('u1')
    const [card] = withDemoConnections([boondTool('available')], now)
    expect(card?.last_sync).toBe(demoAtsConnection(now.getTime()).lastExchangeAt)
    expect(panel.lastExchangeAt).toBe(card?.last_sync)
  })

  it('la garde sait dire NON : un registre non surchargé (hors démonstration) reste « à brancher »', () => {
    // Si le registre ne passait pas par l'overlay, la carte resterait « available » alors que le panneau est branché.
    expect(boondTool('available').status).not.toBe('connected')
  })

  it('le nom reste honnête : la carte porte la mention « (démonstration) »', () => {
    const [card] = withDemoConnections([boondTool('available')], new Date())
    expect(card?.display_name).toContain('(démonstration)')
  })
})

describe('#4689 — la date du dernier échange de démonstration est STABLE', () => {
  const MIDI = Date.parse('2026-10-28T12:00:00.000Z')

  it('ne bouge pas pendant la journée : deux rendus à quelques heures d’écart donnent la même date', () => {
    const a = demoAtsConnection(MIDI).lastExchangeAt
    const b = demoAtsConnection(MIDI + 9 * 3_600_000).lastExchangeAt
    expect(b).toBe(a)
  })

  it('n’est jamais dans le futur et n’est jamais vide', () => {
    for (const hour of [0, 1, 6, 13, 23]) {
      const now = Date.parse('2026-10-28T00:00:00.000Z') + hour * 3_600_000
      const { lastExchangeAt, connectedAt } = demoAtsConnection(now)
      expect(Date.parse(lastExchangeAt)).toBeLessThanOrEqual(now)
      expect(Date.parse(connectedAt)).toBeLessThan(Date.parse(lastExchangeAt))
    }
  })

  it('suit tout de même le calendrier : le lendemain, la date avance', () => {
    const a = Date.parse(demoAtsConnection(MIDI).lastExchangeAt)
    const b = Date.parse(demoAtsConnection(MIDI + 86_400_000).lastExchangeAt)
    expect(b - a).toBe(86_400_000)
  })
})
