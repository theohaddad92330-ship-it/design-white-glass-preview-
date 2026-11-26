import { describe, expect, it } from 'vitest'
import { resolveProofSectorGroup } from './proof-sector-group.js'

// #3181.2 / #3247 — `Proof.sector` est un texte libre ; `APPLICATION_SECTORS` un vocabulaire fermé.
// Le pont ne devine pas : libellé exact, code, groupe ou alias nommé — sinon `null`.
describe('resolveProofSectorGroup', () => {
  it('un libellé du vocabulaire (FR ou EN, casse et accents ignorés) rend son groupe', () => {
    expect(resolveProofSectorGroup('Assurance & mutuelles')).toBe('finance')
    expect(resolveProofSectorGroup('  AÉRONAUTIQUE & SPATIAL ')).toBe('industrie')
    expect(resolveProofSectorGroup('Rail')).toBe('transport')
  })

  it('un code ou un nom de groupe rend le groupe', () => {
    expect(resolveProofSectorGroup('oil_gas')).toBe('energie')
    expect(resolveProofSectorGroup('Santé')).toBe('sante')
  })

  it('un alias courant NOMMÉ rend son groupe', () => {
    expect(resolveProofSectorGroup('Banque')).toBe('finance')
    expect(resolveProofSectorGroup('BTP')).toBe('construction')
  })

  it('SAIT DIRE NON : un texte inconnu, vide ou ambigu rend null — jamais un groupe deviné', () => {
    expect(resolveProofSectorGroup('Secteur exotique du jeudi')).toBeNull()
    expect(resolveProofSectorGroup('')).toBeNull()
    expect(resolveProofSectorGroup(null)).toBeNull()
    expect(resolveProofSectorGroup(undefined)).toBeNull()
  })
  // #3247 — la forme réellement saisie : « Secteur — précision (NAF 64.19Z) ».
  it('un libellé composé « Secteur — précision (NAF …) » se lit segment par segment', () => {
    expect(resolveProofSectorGroup('Banque — autres intermédiations monétaires (NAF 64.19Z)')).toBe('finance')
    expect(resolveProofSectorGroup('Énergie — électricité, gaz et services à l’énergie')).toBe('energie')
    expect(resolveProofSectorGroup('Assurance - mutuelles')).toBe('finance')
  })

  it('SAIT DIRE NON sur un libellé composé dont les segments se contredisent', () => {
    expect(resolveProofSectorGroup('Banque / Hôpital')).toBeNull()
    expect(resolveProofSectorGroup('Banque — Santé')).toBeNull()
  })

  it('un segment inconnu seul ne rend toujours rien', () => {
    expect(resolveProofSectorGroup('Prestations diverses — conseil (NAF 70.22Z)')).toBeNull()
  })
})
