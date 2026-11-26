import { describe, expect, it } from 'vitest'
import { compactSector } from './sector.js'

describe('compactSector', () => {
  it('rend null quand le secteur est absent', () => {
    expect(compactSector(null)).toBeNull()
    expect(compactSector(undefined)).toBeNull()
    expect(compactSector('')).toBeNull()
    expect(compactSector('   ')).toBeNull()
  })

  it('retire le code NAF et tout ce qui le suit', () => {
    expect(compactSector('Portails internet (NAF 63.12Z)')).toBe('Portails internet')
    expect(compactSector('Traitement de données et hébergement (NAF 63.11Z)')).toBe(
      'Traitement de données et hébergement',
    )
  })

  it('garde la tête lisible et jette le libellé NAF qui suit le tiret', () => {
    expect(compactSector('Banque — autres intermédiations monétaires (NAF 64.19Z)')).toBe('Banque')
    expect(compactSector('Industrie de haute technologie — activités des sièges sociaux (NAF 70.10Z)')).toBe(
      'Industrie de haute technologie',
    )
  })

  it('traite le cas réel vu sur /favorites — tiret simple et verbiage après le code', () => {
    expect(
      compactSector(
        "Activités immobilières - location de terrains et d'autres biens immobiliers (NAF 68.20B) pour l'entité juridique identifiée",
      ),
    ).toBe('Activités immobilières')
  })

  it('laisse intact un secteur déjà court', () => {
    expect(compactSector('Transport et logistique')).toBe('Transport et logistique')
    expect(compactSector('  Conseil  ')).toBe('Conseil')
  })

  it('ne coupe pas un nom composé sans espaces autour du trait d’union', () => {
    expect(compactSector('Auvergne-Rhône-Alpes')).toBe('Auvergne-Rhône-Alpes')
    expect(compactSector('Agro-alimentaire')).toBe('Agro-alimentaire')
  })

  it("rend le texte d'origine plutôt que rien quand il ne reste aucune tête lisible", () => {
    // On raccourcit quand on peut ; on n'efface jamais une donnée réelle.
    expect(compactSector('(NAF 68.20B)')).toBe('(NAF 68.20B)')
    expect(compactSector('— autres intermédiations monétaires')).toBe('— autres intermédiations monétaires')
  })

  it('accepte le tiret demi-cadratin comme séparateur', () => {
    expect(compactSector('Édition – logiciels applicatifs (NAF 58.29C)')).toBe('Édition')
  })

  it('#4321.1 — un secteur qui n’est qu’un code (« 9 / 64.19 Z ») se tait : de la référence, pas de la lecture', () => {
    expect(compactSector('9 / 64.19 Z')).toBeNull()
    expect(compactSector('64.19Z')).toBeNull()
    expect(compactSector('Banque — 64.19 Z')).toBe('Banque')
  })
})
