import { describe, expect, it } from 'vitest'
import { companyRegistryUrl } from './company-registry'

describe('#1884 — l’adresse de la fiche publique d’une entreprise', () => {
  it('rend la fiche du registre pour un SIREN à neuf chiffres', () => {
    expect(companyRegistryUrl('402968655')).toBe('https://www.pappers.fr/entreprise/402968655')
  })

  it('tolère un SIREN écrit par groupes de trois — c’est la même valeur, mise en forme', () => {
    expect(companyRegistryUrl('402 968 655')).toBe('https://www.pappers.fr/entreprise/402968655')
    expect(companyRegistryUrl('  402968655  ')).toBe('https://www.pappers.fr/entreprise/402968655')
  })

  it('ne rend RIEN sans SIREN — jamais une recherche vide', () => {
    expect(companyRegistryUrl(null)).toBeUndefined()
    expect(companyRegistryUrl(undefined)).toBeUndefined()
    expect(companyRegistryUrl('')).toBeUndefined()
    expect(companyRegistryUrl('   ')).toBeUndefined()
  })

  it('ne rend RIEN pour ce qui n’est pas un SIREN — un identifiant étranger n’est pas au registre français', () => {
    // Un SIRET (14 chiffres) désigne un ÉTABLISSEMENT, pas l'entité.
    expect(companyRegistryUrl('40296865500056')).toBeUndefined()
    // Trop court, ou pas des chiffres : `registry_id` d'un compte hors France
    // (CIK américain, UID suisse, BCE belge) passe par ce chemin s'il atterrit
    // un jour dans `siren`.
    expect(companyRegistryUrl('12345678')).toBeUndefined()
    expect(companyRegistryUrl('CHE-105.874.199')).toBeUndefined()
    expect(companyRegistryUrl('0403170701')).toBeUndefined()
  })

  it('ne laisse rien s’échapper dans l’URL — le segment est toujours neuf chiffres', () => {
    // Une valeur qui tenterait d'ouvrir un autre chemin ou un autre hôte ne
    // ressort pas : elle n'est pas un SIREN, donc il n'y a pas de lien.
    expect(companyRegistryUrl('../../evil')).toBeUndefined()
    expect(companyRegistryUrl('402968655/../x')).toBeUndefined()
    expect(companyRegistryUrl('javascript:alert(1)')).toBeUndefined()
  })
})
