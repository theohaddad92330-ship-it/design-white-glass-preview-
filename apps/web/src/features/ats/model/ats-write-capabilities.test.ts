import type { AtsStatus } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { availableAtsWrites } from './ats-write-capabilities'

// #4691.3 — une capacité sans le scope accordé n'est PAS proposée (au lieu d'être proposée puis de refuser).
const base: AtsStatus = {
  connected: true,
  provider: 'boondmanager',
  authMode: 'oauth2',
  connectedAt: null,
  fromEnvironment: false,
  lastExchangeAt: null,
  needsReconnect: false,
  scopes: null,
  instanceLabel: null,
  oauthAvailable: true,
}

describe('availableAtsWrites', () => {
  it('OAuth2 sans deliveries:write : créer une mission et corriger un TJM sont ABSENTS', () => {
    const keys = availableAtsWrites({ ...base, scopes: 'companies:read opportunities:write' })
    expect(keys).toEqual(['need_status'])
  })

  it('OAuth2 avec deliveries:write et opportunities:write : les trois sont là', () => {
    const keys = availableAtsWrites({ ...base, scopes: 'deliveries:write,opportunities:write' })
    expect(keys).toEqual(['create_mission', 'fix_tjm', 'need_status'])
  })

  it('OAuth2 dont les scopes ne sont pas rendus : rien n’est supposé accordé', () => {
    expect(availableAtsWrites({ ...base, scopes: null })).toEqual([])
  })

  it('connexion héritée ou serveur (aucune notion de scope) : rien à filtrer', () => {
    expect(availableAtsWrites({ ...base, authMode: 'user_token' })).toHaveLength(3)
    expect(availableAtsWrites({ ...base, authMode: null, connected: false })).toHaveLength(3)
  })
})
