import { describe, expect, it } from 'vitest'
import { secretsConfigures } from './secrets-configures'

describe('secretsConfigures — #1671.4, présence seulement', () => {
  it('tout absent → tout non configuré', () => {
    const result = secretsConfigures({})
    expect(result.every(s => s.configure === false)).toBe(true)
    expect(result.length).toBeGreaterThan(0)
  })

  it('une capacité à deux variables n’est configurée que si LES DEUX sont posées', () => {
    const partiel = secretsConfigures({ DM_BASIC_AUTH_USER: 'x' })
    expect(partiel.find(s => s.capacite.includes('Basic Auth'))?.configure).toBe(false)

    const complet = secretsConfigures({ DM_BASIC_AUTH_USER: 'x', DM_BASIC_AUTH_PASSWORD: 'y' })
    expect(complet.find(s => s.capacite.includes('Basic Auth'))?.configure).toBe(true)
  })

  it('n’expose jamais la valeur — seulement une présence booléenne', () => {
    const result = secretsConfigures({ INTERNAL_API_SECRET: 'super-secret-value-that-must-not-leak' })
    expect(JSON.stringify(result)).not.toContain('super-secret-value-that-must-not-leak')
  })
})
