import { QueryRunner } from 'typeorm'
import { AtsOauth21796584177275 } from '../1796584177275-AtsOauth2'

// #4688 — la contrainte `auth_mode` s'élargit à 'oauth2' AVANT le code qui l'écrit ; ajout seul, rien ne se resserre.
describe('AtsOauth2 (#4688)', () => {
  it('élargit auth_mode à oauth2 sans retirer les deux modes existants, et ajoute les colonnes de jeton', async () => {
    const query = jest.fn().mockResolvedValue(undefined)
    await new AtsOauth21796584177275().up({ query } as unknown as QueryRunner)
    const sql = query.mock.calls.map(c => String(c[0])).join('\n')
    expect(sql).toMatch(/CHECK \(auth_mode IN \('user_token', 'client_jwt', 'oauth2'\)\)/)
    for (const column of [
      'access_token_enc',
      'refresh_token_enc',
      'expires_at',
      'refresh_failed_at',
      'scopes',
      'oauth_state_hash',
      'oauth_verifier_enc',
      'oauth_started_at',
    ]) {
      expect(sql).toMatch(new RegExp(`ADD COLUMN IF NOT EXISTS ${column}\\s`))
    }
    expect(sql).not.toMatch(/DROP TABLE|DROP COLUMN|DELETE|UPDATE ats_connections/i)
  })
})
