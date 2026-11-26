import { describe, expect, it } from 'vitest'
import {
  parseRefreshDebitReason,
  parseRefreshRefundReason,
  REFRESH_REFUND_REASON_PREFIX,
  refreshRefundReason,
} from './refresh-refund.js'

/**
 * #2650.2 — le motif d'une ligne de remboursement est LE CONTRAT entre celui
 * qui l'écrit (l'API, au registre des crédits) et celui qui la lit (le relevé
 * de crédits de l'écran Facturation). Il porte la RÉFÉRENCE du débit
 * remboursé : c'est elle qui prouve qu'un débit n'est jamais remboursé deux
 * fois.
 */
describe('refreshRefundReason / parseRefreshRefundReason (#2650.2)', () => {
  const DEBIT = '0b8f2c3e-5a41-4c4e-9d0e-2f7a1c9b6d11'

  it("porte le préfixe du geste, l'axe ET la référence du débit remboursé", () => {
    const reason = refreshRefundReason('signals', DEBIT)
    expect(reason.startsWith(REFRESH_REFUND_REASON_PREFIX)).toBe(true)
    expect(reason).toContain('signals')
    expect(reason).toContain(DEBIT)
  })

  it('se relit à l’identique — l’axe et le débit reviennent', () => {
    expect(parseRefreshRefundReason(refreshRefundReason('contacts', DEBIT))).toEqual({
      dimension: 'contacts',
      debitId: DEBIT,
    })
  })

  it('refuse tout autre motif — un débit, une recharge, un motif vide', () => {
    expect(parseRefreshRefundReason('refresh:signals')).toBeNull()
    expect(parseRefreshRefundReason('topup:pack-50 (checkout evt_1)')).toBeNull()
    expect(parseRefreshRefundReason(null)).toBeNull()
    expect(parseRefreshRefundReason('')).toBeNull()
  })

  it('refuse un axe inconnu — on ne relit pas ce que le produit ne sait pas écrire', () => {
    expect(parseRefreshRefundReason(`${REFRESH_REFUND_REASON_PREFIX}:bogus (debit ${DEBIT})`)).toBeNull()
  })
})

describe('parseRefreshDebitReason (#2650.2)', () => {
  it('reconnaît le motif exact écrit par le rafraîchissement d’un axe', () => {
    expect(parseRefreshDebitReason('refresh:signals')).toBe('signals')
    expect(parseRefreshDebitReason('refresh:buying_path')).toBe('buying_path')
  })

  it('refuse un axe inconnu, un motif voisin, ou pas de motif', () => {
    expect(parseRefreshDebitReason('refresh:bogus')).toBeNull()
    expect(parseRefreshDebitReason('refresh:signals extra')).toBeNull()
    expect(parseRefreshDebitReason('Doctolib')).toBeNull()
    expect(parseRefreshDebitReason(null)).toBeNull()
  })
})
