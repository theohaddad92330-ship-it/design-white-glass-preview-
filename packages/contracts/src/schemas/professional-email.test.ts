import { describe, expect, it } from 'vitest'
import { emailDomainOf, isPublicEmailDomain, professionalEmailSchema } from './professional-email.js'

describe('isPublicEmailDomain', () => {
  it('reconnaît les domaines grand public nommés par Théo', () => {
    expect(isPublicEmailDomain('gmail.com')).toBe(true)
    expect(isPublicEmailDomain('Hotmail.FR')).toBe(true)
    expect(isPublicEmailDomain('  yahoo.com  ')).toBe(true)
  })

  it('laisse passer un domaine d’entreprise', () => {
    expect(isPublicEmailDomain('acme.fr')).toBe(false)
    expect(isPublicEmailDomain('bellum-it.com')).toBe(false)
  })
})

describe('emailDomainOf', () => {
  it('extrait le domaine en minuscules', () => {
    expect(emailDomainOf('Marie@ACME.fr')).toBe('acme.fr')
  })

  it('rend null sur ce qui n’est pas une adresse', () => {
    expect(emailDomainOf('pas-une-adresse')).toBeNull()
    expect(emailDomainOf('@acme.fr')).toBeNull()
    expect(emailDomainOf('marie@')).toBeNull()
  })
})

describe('professionalEmailSchema', () => {
  it('accepte une adresse professionnelle', () => {
    const result = professionalEmailSchema.safeParse('Marie.Dupont@Acme.fr')
    expect(result.success).toBe(true)
    if (result.success) expect(result.data).toBe('marie.dupont@acme.fr')
  })

  it('refuse une adresse personnelle', () => {
    expect(professionalEmailSchema.safeParse('marie@gmail.com').success).toBe(false)
  })

  it('refuse un format invalide', () => {
    expect(professionalEmailSchema.safeParse('pas-une-adresse').success).toBe(false)
  })
})
