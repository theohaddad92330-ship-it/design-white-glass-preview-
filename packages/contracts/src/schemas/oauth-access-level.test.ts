import { describe, expect, it } from 'vitest'
import { OAUTH_ACCESS_LEVELS, accessLevelToRequest, oauthAccessLevelSchema } from './oauth-access-level.js'

// #2078.22 / #2078.23 — les deux niveaux d'accès d'une connexion, et la seule
// règle qui dit lequel redemander.
describe('niveaux d’accès OAuth', () => {
  it('nomme exactement deux niveaux, lecture d’abord', () => {
    expect(OAUTH_ACCESS_LEVELS).toEqual(['read', 'read_write'])
  })

  it('refuse un niveau inventé', () => {
    expect(oauthAccessLevelSchema.safeParse('admin').success).toBe(false)
    expect(oauthAccessLevelSchema.safeParse('').success).toBe(false)
    expect(oauthAccessLevelSchema.safeParse('read').success).toBe(true)
  })

  it('une reconnexion ne RÉTROGRADE jamais une connexion en écriture', () => {
    // Un écran de lecture (import de documents) qui propose de reconnecter ne
    // doit pas retirer l'écriture à qui l'avait accordée.
    expect(accessLevelToRequest('read_write', 'read')).toBe('read_write')
  })

  it('une reconnexion ne DONNE jamais l’écriture sans qu’un geste d’écriture la demande', () => {
    expect(accessLevelToRequest('read', 'read')).toBe('read')
    expect(accessLevelToRequest(null, 'read')).toBe('read')
  })

  it('un geste d’écriture demande l’écriture, quel que soit le niveau actuel', () => {
    expect(accessLevelToRequest('read', 'read_write')).toBe('read_write')
    expect(accessLevelToRequest(null, 'read_write')).toBe('read_write')
  })
})
