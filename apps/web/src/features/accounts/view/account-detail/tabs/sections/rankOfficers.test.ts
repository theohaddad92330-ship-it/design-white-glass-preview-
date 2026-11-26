import { describe, expect, it } from 'vitest'
import { rankOfficers } from './publicDataViewData'

/**
 * #1086 — sur KLESIA (mutuelle), la carte Dirigeants n'affichait que des
 * administrateurs : « les administrateurs des mutuelles on s'en fiche un peu
 * nan ? J'aurai davantage besoin des DG, DSI, etc. […] faire apparaitre au
 * moins le/la/les directeurs informatiques ».
 *
 * La cause n'était pas le tri, c'est qu'il n'y en avait AUCUN : la liste était
 * coupée à huit AVANT tout classement, donc un directeur des systèmes
 * d'information en 12ᵉ position du registre n'atteignait jamais l'écran.
 */
describe('rankOfficers', () => {
  const named = (name: string, role: string | null) => ({ name, role })

  it('remonte les fonctions informatiques en tête', () => {
    const ranked = rankOfficers([
      named('A', 'Administrateur'),
      named('B', "Directeur des systèmes d'information"),
      named('C', 'Directeur général'),
    ])
    expect(ranked.officers.map(o => o.name)).toEqual(['B', 'C', 'A'])
  })

  it('classe la direction générale avant la gouvernance', () => {
    const ranked = rankOfficers([named('Conseil', "Membre du conseil d'administration"), named('Gérante', 'Gérant')])
    expect(ranked.officers.map(o => o.name)).toEqual(['Gérante', 'Conseil'])
  })

  it("distingue un président de SAS d'un président de conseil", () => {
    // Sur une SAS le président EST l'opérationnel ; sur une mutuelle le
    // président du conseil ne l'est pas. Le libellé porte la différence, et
    // c'est la seule chose qu'on ait le droit de lire.
    const ranked = rankOfficers([named('Conseil', "Président du conseil d'administration"), named('SAS', 'Président')])
    expect(ranked.officers.map(o => o.name)).toEqual(['SAS', 'Conseil'])
  })

  it('ne relègue pas une fonction inconnue au fond', () => {
    // Un rôle absent n'est pas une preuve que la personne est secondaire. Il se
    // range au milieu : devant la gouvernance, derrière ce qui est prouvé.
    const ranked = rankOfficers([
      named('Admin', 'Administrateur'),
      named('Inconnu', null),
      named('DG', 'Directeur général'),
    ])
    expect(ranked.officers.map(o => o.name)).toEqual(['DG', 'Inconnu', 'Admin'])
  })

  it("garde l'ordre du registre à rang égal", () => {
    const ranked = rankOfficers([
      named('Premier', 'Administrateur'),
      named('Second', 'Administrateur'),
      named('Troisième', 'Administrateur'),
    ])
    expect(ranked.officers.map(o => o.name)).toEqual(['Premier', 'Second', 'Troisième'])
  })

  it('déduplique sur le nom, à la casse près', () => {
    const ranked = rankOfficers([named('Jean Dupont', 'Administrateur'), named('JEAN DUPONT', 'Directeur général')])
    expect(ranked.officers).toHaveLength(1)
  })

  it('classe AVANT de couper, et dit combien il en reste', () => {
    // Le défaut exact : huit administrateurs devant, le DSI en douzième, et la
    // coupe à huit le faisait disparaître.
    const many = Array.from({ length: 11 }, (_, i) => named(`Admin ${i}`, 'Administrateur'))
    const ranked = rankOfficers([...many, named('La DSI', 'Directrice informatique')], 8)
    expect(ranked.officers[0]?.name).toBe('La DSI')
    expect(ranked.officers).toHaveLength(8)
    expect(ranked.hiddenCount).toBe(4)
  })

  it('ne compte aucun masqué quand tout tient', () => {
    expect(rankOfficers([named('Seule', 'Gérant')], 8).hiddenCount).toBe(0)
  })

  it('écarte les personnes sans nom', () => {
    expect(rankOfficers([named('', 'Directeur général'), named('  ', null)]).officers).toEqual([])
  })
})
