import { describe, expect, it } from 'vitest'
import { REGISTRY_CONTRACT_BY_COUNTRY, contractDebitsCredits, registryContractFor } from './registry-contract.js'

describe("#4016 L13a — l'état du contrat d'un registre étranger", () => {
  it('CH, BE, US, CA sont vérifiés ; LU est documenté', () => {
    expect(registryContractFor('CH')).toBe('verified')
    expect(registryContractFor('BE')).toBe('verified')
    expect(registryContractFor('US')).toBe('verified')
    expect(registryContractFor('CA')).toBe('verified')
    expect(registryContractFor('LU')).toBe('documented')
    // #4736 lot G — packs bêta : documentés, donc jamais débités.
    for (const code of ['DE', 'GB', 'ES']) expect(registryContractFor(code)).toBe('documented')
  })

  it('lit le code sans tenir compte de la casse ni des espaces', () => {
    expect(registryContractFor(' lu ')).toBe('documented')
  })

  it('un pays sans pack, ou une absence, ne reçoit AUCUN état — jamais « vérifié » par défaut', () => {
    expect(registryContractFor('FR')).toBeNull()
    expect(registryContractFor('ZZ')).toBeNull()
    expect(registryContractFor(null)).toBeNull()
    expect(registryContractFor(undefined)).toBeNull()
  })

  it("SANS DÉBIT tant que le contrat n'est pas vérifié : documenté ne débite pas, inconnu non plus", () => {
    expect(contractDebitsCredits('verified')).toBe(true)
    expect(contractDebitsCredits('documented')).toBe(false)
    expect(contractDebitsCredits(null)).toBe(false)
  })

  it('sait dire NON : un pays passé en « documenté » dans la table cesse de débiter', () => {
    const copy = { ...REGISTRY_CONTRACT_BY_COUNTRY, CH: 'documented' as const }
    expect(contractDebitsCredits(copy.CH)).toBe(false)
  })
})
