import { describe, expect, it } from 'vitest'
import { ApiError } from './api-error'
import {
  connectorFailureIsActionable,
  connectorFailureSpeaksForItself,
  connectorFailureState,
  type ConnectorFailureState,
} from './connector-failure'

/**
 * #1836 — la dérivation que quatre écrans recopiaient.
 *
 * Ces tests gardent trois choses : que le quatrième état existe, qu'il ouvre un
 * chemin, et qu'une VRAIE panne n'en ouvre toujours pas — sans quoi on aurait
 * remplacé un mensonge par un autre.
 */
describe('connectorFailureState', () => {
  it('reconnaît les quatre échecs, et les distingue', () => {
    const cases: Array<[unknown, ConnectorFailureState]> = [
      [new ApiError('portées', 503, 'scope_missing'), 'scope_missing'],
      [new ApiError('autorisation', 503, 'authorization_expired'), 'authorization_expired'],
      [new ApiError('rien de branché', 503, 'not_connected'), 'not_connected'],
      // Les routes CRM rendent 412 sans code : « la route existe, il manque une
      // CONDITION ». C'est ce qu'on observe sur `/billing`.
      [new ApiError('Aucun CRM connecté à cet espace.', 412), 'not_connected'],
      [new ApiError('boom', 500), 'failed'],
      [new Error('network'), 'failed'],
      [undefined, 'failed'],
    ]
    for (const [error, expected] of cases) {
      expect(connectorFailureState(error)).toBe(expected)
    }
  })

  it('classe l’irréversible avant le rattrapable', () => {
    // Un corps qui porterait les deux : la portée passe devant, comme côté
    // serveur. Sinon on conseille « réessaie » pour ce qui ne repasse jamais.
    expect(connectorFailureState(new ApiError('x', 412, 'scope_missing'))).toBe('scope_missing')
    expect(connectorFailureState(new ApiError('x', 412, 'authorization_expired'))).toBe('authorization_expired')
  })

  it('sait dire NON : un 503 NU reste une panne', () => {
    // C'est le comportement d'AVANT #1836, et il reste juste pour un vrai 503
    // sans code. Ce que #1836 corrige, c'est le serveur qui n'en envoyait pas.
    expect(connectorFailureState(new ApiError('CRM token expired and cannot be refreshed', 503))).toBe('failed')
  })
})

describe('ce que l’écran doit en faire', () => {
  it('la phrase du serveur ne prime que là où il en sait plus que nous', () => {
    expect(connectorFailureSpeaksForItself('scope_missing')).toBe(true)
    expect(connectorFailureSpeaksForItself('authorization_expired')).toBe(true)
    // Une panne : notre phrase, dans la langue de l'utilisateur.
    expect(connectorFailureSpeaksForItself('failed')).toBe(false)
    expect(connectorFailureSpeaksForItself('not_connected')).toBe(false)
  })

  it('une PANNE n’ouvre aucun chemin vers Intégrations — les trois autres, si', () => {
    expect(connectorFailureIsActionable('failed')).toBe(false)
    for (const state of ['scope_missing', 'authorization_expired', 'not_connected'] as const) {
      expect(`${state} → ${connectorFailureIsActionable(state)}`).toBe(`${state} → true`)
    }
  })
})
