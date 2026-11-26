import { marketMatchKey, marketRootDomain } from './market-company-key'

describe('marketMatchKey — la même normalisation des deux côtés', () => {
  it('retire les accents, la casse et la ponctuation', () => {
    expect(marketMatchKey('Société Générale')).toBe('societe generale')
    expect(marketMatchKey('SOCIETE GENERALE')).toBe('societe generale')
    expect(marketMatchKey("L'Oréal")).toBe('l oreal')
  })

  it('écarte les formes juridiques et les mots de structure', () => {
    expect(marketMatchKey('Groupe Thales')).toBe('thales')
    expect(marketMatchKey('Thales SA')).toBe('thales')
    expect(marketMatchKey('Capgemini France')).toBe('capgemini')
  })

  it('rapproche « Groupe X » et « X » — c’est voulu, et c’est pour ça que ce rapprochement est FAIBLE', () => {
    expect(marketMatchKey('Groupe SII')).toBe(marketMatchKey('SII'))
  })

  it('NE rapproche PAS deux entreprises que le nom distingue vraiment', () => {
    expect(marketMatchKey('ROCHE')).not.toBe(marketMatchKey('ROCHE BOBOIS'))
  })

  it('garde la forme brute quand tout le nom serait écarté — sinon tous les vides se rapprocheraient', () => {
    expect(marketMatchKey('Groupe France')).toBe('groupe france')
  })

  it('rend une chaîne vide sur un nom vide — un cas à traiter, pas un joker', () => {
    expect(marketMatchKey('   ')).toBe('')
    expect(marketMatchKey('')).toBe('')
  })
})

describe('marketRootDomain — le rapprochement fort', () => {
  it('réduit une URL à son domaine racine', () => {
    expect(marketRootDomain('https://www.thalesgroup.com/fr/europe')).toBe('thalesgroup.com')
    expect(marketRootDomain('http://decathlon.fr')).toBe('decathlon.fr')
  })

  it('accepte une URL sans schéma', () => {
    expect(marketRootDomain('www.capgemini.com')).toBe('capgemini.com')
  })

  it('rend null sur une absence, un vide ou une URL illisible', () => {
    expect(marketRootDomain(null)).toBeNull()
    expect(marketRootDomain(undefined)).toBeNull()
    expect(marketRootDomain('   ')).toBeNull()
    expect(marketRootDomain('pas une url du tout')).toBeNull()
  })

  it('rend null sur une plateforme — dix mille entreprises partagent le même hôte', () => {
    expect(marketRootDomain('https://www.linkedin.com/company/capgemini')).toBeNull()
    expect(marketRootDomain('https://facebook.com/decathlon')).toBeNull()
  })

  it('rend null sur un hôte sans point — il ne peut pas être un domaine d’entreprise', () => {
    expect(marketRootDomain('http://localhost')).toBeNull()
  })
})
