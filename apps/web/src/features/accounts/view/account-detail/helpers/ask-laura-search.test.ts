import { describe, expect, it } from 'vitest'
import type { Account } from '@bellum/contracts'
import { askLauraSearch } from './ask-laura-search'

function account(user_context: string | null): Pick<Account, 'id' | 'user_context'> {
  return { id: 'a0000000-0000-4000-8000-000000000001', user_context }
}

describe('askLauraSearch (#2164.52)', () => {
  it('transmet le contexte enregistré comme prompt PRÉ-REMPLI, pas envoyé', () => {
    expect(askLauraSearch(account('Cherche à s’implanter en Allemagne, budget serré'))).toEqual({
      accountId: 'a0000000-0000-4000-8000-000000000001',
      prompt: 'Cherche à s’implanter en Allemagne, budget serré',
    })
  })

  it('n’invente aucune question quand aucun contexte n’a été enregistré', () => {
    expect(askLauraSearch(account(null))).toEqual({ accountId: 'a0000000-0000-4000-8000-000000000001' })
  })

  it('n’invente aucune question pour une chaîne vide', () => {
    expect(askLauraSearch(account(''))).toEqual({ accountId: 'a0000000-0000-4000-8000-000000000001' })
  })
})
