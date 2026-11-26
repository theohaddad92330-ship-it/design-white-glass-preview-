import { implantationPlaces, IMPLANTATION_PLACES_SQL } from './account-site-places'

describe('#4989.2 — implantations portées par la ligne de la liste', () => {
  it('rend les villes distinctes, sans blanc, sans doublon de casse', () => {
    expect(implantationPlaces(['Lille', ' lille ', '', null, 'Lyon', 42])).toEqual(['Lille', 'Lyon'])
  })

  it('une source absente ou illisible ne dit RIEN (jamais un tableau inventé)', () => {
    expect(implantationPlaces(null)).toBeUndefined()
    expect(implantationPlaces('Lille')).toBeUndefined()
    expect(implantationPlaces([])).toBeUndefined()
  })

  it('plafonne le nombre de lieux portés par ligne', () => {
    const many = Array.from({ length: 80 }, (_, i) => `Ville ${i}`)
    expect(implantationPlaces(many)?.length).toBe(40)
  })

  it('le SQL lit les établissements du registre ET les sites de l’analyse', () => {
    expect(IMPLANTATION_PLACES_SQL).toContain("'branches'")
    expect(IMPLANTATION_PLACES_SQL).toContain("'sites_france'")
  })
})
