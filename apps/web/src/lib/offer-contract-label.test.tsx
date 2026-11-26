import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { offerContractLabelKey, useOfferContractLabel } from './offer-contract-label'

describe('#5000.2 — un seul libellé du type de contrat (fiche et Découvrir)', () => {
  it.each([
    ['CDI', 'cdi'],
    ['CDD', 'cdd'],
    ['intérim', 'interim'],
    ['freelance', 'freelance'],
    ['autre', 'other'],
    ['non précisé', 'unspecified'],
    [undefined, 'unspecified'],
    [null, 'unspecified'],
    ['', 'unspecified'],
  ])('%s → %s', (raw, key) => {
    expect(offerContractLabelKey(raw)).toBe(key)
  })

  it('le libellé lu est le même pour la même valeur, absent ⇒ « non précisé »', () => {
    const { result } = renderHook(() => useOfferContractLabel())
    expect(result.current('CDD')).toBe('CDD')
    expect(result.current(undefined)).toBe('Contrat non précisé')
    expect(result.current('CDI')).toBe(result.current('CDI'))
  })
})
