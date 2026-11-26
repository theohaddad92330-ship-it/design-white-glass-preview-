import { describe, expect, it } from 'vitest'
import { displayCompanyName } from './company-display-name.js'

describe('displayCompanyName (#3530)', () => {
  it.each([
    ['CENTRE HOSPITALIER DE VALENCIENNES', 'Centre Hospitalier de Valenciennes'],
    ['BNP PARIBAS', 'BNP Paribas'],
    ['L’OREAL', 'L’Oreal'],
    ["L'OREAL FRANCE", "L'Oreal France"],
    ['CAPGEMINI', 'Capgemini'],
    ['SAINT-GOBAIN', 'Saint-Gobain'],
    ['LVMH', 'LVMH'],
    ['IBM FRANCE', 'IBM France'],
    ['BANQUE DES TERRITOIRES', 'Banque des Territoires'],
  ])('%s → %s', (raw, expected) => {
    expect(displayCompanyName(raw)).toBe(expected)
  })

  it('laisse intact un nom déjà en casse mixte (c’est le nom usuel)', () => {
    expect(displayCompanyName('Doctolib')).toBe('Doctolib')
    expect(displayCompanyName('OVHcloud')).toBe('OVHcloud')
  })

  it('ne touche ni au vide ni aux espaces superflus', () => {
    expect(displayCompanyName('')).toBe('')
    expect(displayCompanyName('  SAFRAN  ')).toBe('Safran')
  })
})
