import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { CopilotSourceConnectionsController } from './copilot-source-connections.controller'

// #3904.3 — la lecture UNIQUE des quatre connecteurs, côté Laura.
const USER = '11111111-1111-4111-8111-111111111111'

function build(tools: unknown[]) {
  const list = jest.fn().mockResolvedValue(tools)
  return { controller: new CopilotSourceConnectionsController({ list } as never), list }
}

describe('CopilotSourceConnectionsController — #3904.3', () => {
  it('relit le Tool Registry de l’appelant et nomme les quatre sources, même absentes', async () => {
    const { controller, list } = build([
      { provider: 'hubspot', family: 'crm', status: 'connected', last_sync: '2026-10-05T08:00:00.000Z' },
    ])
    const result = await controller.sources({ userId: USER })
    expect(list).toHaveBeenCalledWith(USER)
    expect(result.sources).toEqual([
      { source: 'crm', state: 'connected', lastSync: '2026-10-05T08:00:00.000Z' },
      { source: 'telephony', state: 'not_connected', lastSync: null },
      { source: 'calendar', state: 'not_connected', lastSync: null },
      { source: 'email', state: 'not_connected', lastSync: null },
    ])
  })

  it('ne laisse jamais passer un nom d’éditeur vers le modèle (GA-69)', async () => {
    const { controller } = build([
      { provider: 'hubspot', family: 'crm', status: 'connected', last_sync: null, display_name: 'HubSpot' },
    ])
    expect(JSON.stringify(await controller.sources({ userId: USER })).toLowerCase()).not.toContain('hubspot')
  })

  it('est un pont INTERNE : gardé par le secret, sous internal/copilot', () => {
    expect(Reflect.getMetadata(PATH_METADATA, CopilotSourceConnectionsController)).toBe('internal/copilot')
    expect(Reflect.getMetadata(GUARDS_METADATA, CopilotSourceConnectionsController)).toEqual([InternalSecretGuard])
  })
})
