import { describe, expect, it } from 'vitest'
import { factLinkKey, factNatureLabelKey, isCapitalIncreaseFact } from './discover-fact-type'

// #4068 — la NATURE lisible : une clé par nature, jamais un nom de source.
describe('#4068 — factNatureLabelKey', () => {
  it('range chaque nature dans sa clé de libellé', () => {
    expect(factNatureLabelKey('hiring')).toBe('facts.nature.hiring')
    expect(factNatureLabelKey('space')).toBe('facts.nature.space')
  })
})

// #4068.4 — le lien est GÉNÉRIQUE : « annonce » pour une annonce, « source » sinon.
describe('#4068.4 — factLinkKey', () => {
  it('une offre ou un appel d’offres est une annonce', () => {
    expect(factLinkKey('hiring')).toBe('facts.linkAnnouncement')
    expect(factLinkKey('tender')).toBe('facts.linkAnnouncement')
  })
  it('le reste n’est pas une annonce : « Voir la source »', () => {
    expect(factLinkKey('award')).toBe('facts.linkSource')
    expect(factLinkKey('legal')).toBe('facts.linkSource')
    expect(factLinkKey('tech')).toBe('facts.linkSource')
  })
})

// #4285.1 — le fait « Augmentation de capital » se reconnaît à son type ET à son libellé exact (jamais une actualité).
describe('#4285.1 — isCapitalIncreaseFact', () => {
  it('reconnaît le fait BODACC, casse et accents neutralisés', () => {
    expect(isCapitalIncreaseFact({ type: 'business', label: 'Augmentation de capital' })).toBe(true)
    expect(isCapitalIncreaseFact({ type: 'business', label: ' augmentation de CAPITAL ' })).toBe(true)
  })
  it('SAIT DIRE NON : une actualité qui en parle, un acte légal, une levée', () => {
    expect(isCapitalIncreaseFact({ type: 'business', label: 'Augmentation de capital de Latécoère' })).toBe(false)
    expect(isCapitalIncreaseFact({ type: 'legal', label: 'Augmentation de capital' })).toBe(false)
    expect(isCapitalIncreaseFact({ type: 'funding', label: 'Levée de fonds : 40 M€' })).toBe(false)
  })
})
