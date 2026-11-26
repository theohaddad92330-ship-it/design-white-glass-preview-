import type { ConnectedTool } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { findToolForProvider } from './sync-tool-lookup'

function tool(over: Partial<ConnectedTool> & { provider: string }): ConnectedTool {
  return {
    family: 'crm',
    display_name: over.provider,
    status: 'connected',
    scopes: [],
    owner: 'workspace',
    last_sync: null,
    data_types: { reads: [], writes: [] },
    allowed_actions: [],
    coverage_period: null,
    latency: null,
    beta: null,
    capability_state: 'operational',
    capabilities: [],
    ...over,
  }
}

describe('#2207.21 — findToolForProvider', () => {
  it('rend une correspondance exacte quand le provider existe tel quel', () => {
    const tools = [tool({ provider: 'hubspot' }), tool({ provider: 'notion' })]
    expect(findToolForProvider(tools, 'hubspot')?.provider).toBe('hubspot')
  })

  it("`google` retombe sur Gmail — la première surface de l'onboarding", () => {
    const tools = [tool({ provider: 'google-drive' }), tool({ provider: 'gmail' })]
    expect(findToolForProvider(tools, 'google')?.provider).toBe('gmail')
  })

  it('`google` sans Gmail retombe sur la surface suivante disponible', () => {
    const tools = [tool({ provider: 'googlechat' }), tool({ provider: 'google-drive' })]
    expect(findToolForProvider(tools, 'google')?.provider).toBe('google-drive')
  })

  it('`undefined` quand rien ne correspond — jamais une devinette', () => {
    const tools = [tool({ provider: 'notion' })]
    expect(findToolForProvider(tools, 'salesforce')).toBeUndefined()
  })
})
