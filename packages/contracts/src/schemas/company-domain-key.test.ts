import { describe, expect, it } from 'vitest'
import { companyDomainKey } from './company-domain-key.js'

/**
 * #2284.20 (tranche 2) — le DOMAINE comme clé de résolution.
 *
 * Une saisie qui EST un domaine (ou une URL) se résout par son domaine racine ;
 * un nom d'entreprise n'en est jamais un, même s'il contient un point. Une
 * plateforme (réseau social, hébergeur) ne caractérise personne.
 */
describe('companyDomainKey', () => {
  it.each([
    ['thalesgroup.com', 'thalesgroup.com'],
    ['www.thalesgroup.com', 'thalesgroup.com'],
    ['https://www.thalesgroup.com/fr/groupe', 'thalesgroup.com'],
    ['HTTP://SocieteGenerale.COM', 'societegenerale.com'],
    ['  leboncoin.fr  ', 'leboncoin.fr'],
  ])('%s → %s', (input, expected) => {
    expect(companyDomainKey(input)).toBe(expected)
  })

  it.each([
    'Thales',
    'Société Générale',
    // Un nom qui contient un point n'est pas un domaine.
    'Capgemini S.A.',
    'Veolia Env.',
    'A.B.C',
    '',
    '   ',
    // Une plateforme ne caractérise personne.
    'linkedin.com',
    'https://www.linkedin.com/company/thales',
  ])('%j → null', input => {
    expect(companyDomainKey(input)).toBeNull()
  })

  it('accepte une absence', () => {
    expect(companyDomainKey(null)).toBeNull()
    expect(companyDomainKey(undefined)).toBeNull()
  })
})
