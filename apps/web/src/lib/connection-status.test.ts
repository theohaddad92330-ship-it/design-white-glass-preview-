import type { AtsStatus } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { i18n } from '@/i18n'
import { atsConnectionState, connectionStatusLabel } from './connection-status'

// #4689 — UNE définition des trois états d'une connexion (Branché / À reconnecter / Non branché), lue par la carte et le panneau.
const ats = (over: Partial<AtsStatus>): AtsStatus => ({
  connected: false,
  provider: null,
  authMode: null,
  connectedAt: null,
  fromEnvironment: false,
  lastExchangeAt: null,
  needsReconnect: false,
  scopes: null,
  instanceLabel: null,
  oauthAvailable: true,
  ...over,
})

describe('#4689 — l’état d’une connexion ATS se nomme d’une seule façon', () => {
  const cases: [string, AtsStatus | undefined, ReturnType<typeof atsConnectionState>][] = [
    ['rien', undefined, 'not_connected'],
    ['non branché', ats({}), 'not_connected'],
    ['branché OAuth2', ats({ connected: true, authMode: 'oauth2' }), 'connected'],
    ['à reconnecter', ats({ connected: true, authMode: 'oauth2', needsReconnect: true }), 'needs_reconnect'],
    ['jeton hérité', ats({ connected: true, authMode: 'user_token' }), 'legacy'],
    ['configuration serveur', ats({ connected: true, fromEnvironment: true }), 'environment'],
  ]
  it.each(cases)('%s', (_name, status, expected) => {
    expect(atsConnectionState(status)).toBe(expected)
  })
})

describe('#4689 — les trois libellés, FR et EN', () => {
  it.each([
    ['fr', 'connected', 'Branché'],
    ['fr', 'action_required', 'À reconnecter'],
    ['fr', 'available', 'Non branché'],
    ['en', 'connected', 'Connected'],
    ['en', 'action_required', 'Needs reconnecting'],
    ['en', 'available', 'Not connected'],
  ] as const)('%s · %s → %s', async (lng, status, label) => {
    await i18n.changeLanguage(lng)
    expect(connectionStatusLabel(i18n.getFixedT(lng, 'integrationCenter'), status)).toBe(label)
  })
})
