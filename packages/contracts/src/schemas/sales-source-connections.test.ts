import { describe, expect, it } from 'vitest'
import { SALES_SOURCE_KINDS, salesSourceConnections } from './sales-source-connections.js'
import type { ConnectedTool } from './tool-registry.js'

type Row = Pick<ConnectedTool, 'provider' | 'family' | 'status' | 'last_sync'>

const row = (
  provider: string,
  family: ConnectedTool['family'],
  status: ConnectedTool['status'],
  last_sync: string | null = null,
): Row => ({
  provider,
  family,
  status,
  last_sync,
})

describe('salesSourceConnections — #3904.3, la lecture UNIQUE des quatre connecteurs', () => {
  it('nomme TOUJOURS les quatre sources, dans le même ordre — un connecteur absent se nomme', () => {
    const sources = salesSourceConnections([])
    expect(sources.map(s => s.source)).toEqual([...SALES_SOURCE_KINDS])
    expect(sources.every(s => s.state === 'not_connected' && s.lastSync === null)).toBe(true)
  })

  it('lit le CRM et la téléphonie par famille, la dernière synchro la plus récente des outils branchés', () => {
    const sources = salesSourceConnections([
      row('hubspot', 'crm', 'connected', '2026-10-01T08:00:00.000Z'),
      row('salesforce', 'crm', 'connected', '2026-10-05T08:00:00.000Z'),
      row('pipedrive', 'crm', 'available'),
      row('aircall', 'telephony', 'action_required', '2026-09-01T08:00:00.000Z'),
    ])
    expect(sources.find(s => s.source === 'crm')).toEqual({
      source: 'crm',
      state: 'connected',
      lastSync: '2026-10-05T08:00:00.000Z',
    })
    expect(sources.find(s => s.source === 'telephony')?.state).toBe('action_required')
  })

  it('la messagerie Microsoft compte pour le mail ET pour l’agenda ; Gmail seul ne branche pas l’agenda', () => {
    const gmailOnly = salesSourceConnections([row('gmail', 'email', 'connected')])
    expect(gmailOnly.find(s => s.source === 'email')?.state).toBe('connected')
    expect(gmailOnly.find(s => s.source === 'calendar')?.state).toBe('not_connected')
    const microsoft = salesSourceConnections([row('microsoft', 'email', 'connected')])
    expect(microsoft.find(s => s.source === 'calendar')?.state).toBe('connected')
  })

  it('n’attrape pas ce qu’elle ne vise pas : l’accès messagerie du copilote n’est pas une boîte branchée', () => {
    const sources = salesSourceConnections([row('copilot-bridge', 'email', 'connected', '2026-10-01T00:00:00.000Z')])
    expect(sources.find(s => s.source === 'email')?.state).toBe('not_connected')
  })

  it('une synchro jamais mesurée reste `null`, jamais une date inventée', () => {
    const sources = salesSourceConnections([row('google-calendar', 'calendar', 'connected', null)])
    expect(sources.find(s => s.source === 'calendar')).toEqual({
      source: 'calendar',
      state: 'connected',
      lastSync: null,
    })
  })
})
