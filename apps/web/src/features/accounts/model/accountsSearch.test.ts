import { describe, expect, it } from 'vitest'
import { accountsSearchSchema } from './accountsSearch'

/** #4886 — « Voir les échecs » portait `canceled`, inconnu du schéma : le `.catch(undefined)` jetait TOUT l'axe. */
describe('accountsSearchSchema — status', () => {
  it('garde l’axe des échecs (error + canceled) : le lien « Voir les échecs » filtre vraiment', () => {
    expect(accountsSearchSchema.parse({ q: 'Engie', status: ['error', 'canceled'] }).status).toEqual([
      'error',
      'canceled',
    ])
  })

  it('sait dire NON : un statut inconnu jette l’axe, il ne se devine pas', () => {
    expect(accountsSearchSchema.parse({ status: ['error', 'inventé'] }).status).toBeUndefined()
  })
})
