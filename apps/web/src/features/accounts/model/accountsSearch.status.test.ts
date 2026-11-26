import { describe, expect, it } from 'vitest'
import { accountsSearchSchema } from '@/features/accounts/model/accountsSearch'

// #4886 — « Voir les échecs » porte `status: ['error', 'canceled']`. `canceled` n'a pas de clé dans
// STATUS_CONFIG (il se range sous « Erreur » à l'affichage) : le schéma le jetait, et avec lui TOUT l'axe.
describe("accountsSearchSchema — statuts d'échec (#4886)", () => {
  it("garde l'axe status quand le lien porte error + canceled", () => {
    const parsed = accountsSearchSchema.parse({ q: 'Engie', status: ['error', 'canceled'] })
    expect(parsed.status).toEqual(['error', 'canceled'])
  })

  it('accepte canceled seul', () => {
    expect(accountsSearchSchema.parse({ status: 'canceled' }).status).toBe('canceled')
  })

  it('jette toujours une valeur inconnue', () => {
    expect(accountsSearchSchema.parse({ status: ['nimporte-quoi'] }).status).toBeUndefined()
  })
})
