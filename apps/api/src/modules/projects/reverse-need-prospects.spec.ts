import { rankReverseProspects, sameZone, sharedSkillTerms, type ReverseProspectMatch } from './reverse-need-prospects'

/**
 * « Un besoin sans candidat ouvre une piste » — la moitié DÉTERMINISTE, comme
 * `project-similarity.spec.ts` : le croisement se justifie entièrement par ces
 * deux fonctions, sans base et sans modèle.
 */
describe('sameZone', () => {
  it('dit vrai pour la même zone, au mot près', () => {
    expect(sameZone('Lyon', 'Lyon')).toBe(true)
  })

  it('ignore la casse et les espaces qui l’entourent', () => {
    expect(sameZone(' Lyon ', 'lyon')).toBe(true)
  })

  it('ne confond PAS une zone avec une autre qui la contient — "Paris" n’est pas "Paris-Saclay"', () => {
    // Un sous-texte matcherait par accident et rendrait la liste illisible :
    // le commercial ne pourrait plus faire confiance à « même zone ».
    expect(sameZone('Paris', 'Paris-Saclay')).toBe(false)
  })

  it('dit faux dès qu’une des deux zones manque', () => {
    expect(sameZone(null, 'Lyon')).toBe(false)
    expect(sameZone('Lyon', null)).toBe(false)
    expect(sameZone(null, null)).toBe(false)
  })

  it('ne fait jamais matcher deux chaînes vides entre elles', () => {
    expect(sameZone('', '')).toBe(false)
    expect(sameZone('   ', '  ')).toBe(false)
  })
})

describe('sharedSkillTerms', () => {
  it('rend les termes que les deux besoins partagent', () => {
    const shared = sharedSkillTerms([{ term: 'Java' }, { term: 'AWS' }], [{ term: 'AWS' }, { term: 'Kubernetes' }])
    expect(shared).toEqual(['AWS'])
  })

  it('compare sans tenir compte de la casse — "java" doit trouver "Java"', () => {
    const shared = sharedSkillTerms([{ term: 'Java' }], [{ term: 'java' }])
    expect(shared).toEqual(['Java'])
  })

  it('rend la casse de la RÉFÉRENCE — c’est elle que le commercial a sous les yeux', () => {
    const shared = sharedSkillTerms([{ term: 'AWS' }], [{ term: 'aws' }])
    expect(shared).toEqual(['AWS'])
  })

  it('rend [] quand rien ne se recoupe — jamais une liste inventée', () => {
    expect(sharedSkillTerms([{ term: 'Java' }], [{ term: 'PHP' }])).toEqual([])
  })

  it('dédoublonne les termes répétés de la référence', () => {
    const shared = sharedSkillTerms([{ term: 'Java' }, { term: 'java' }], [{ term: 'Java' }])
    expect(shared).toEqual(['Java'])
  })

  it('ignore les termes vides ou blancs', () => {
    expect(sharedSkillTerms([{ term: '  ' }], [{ term: '  ' }])).toEqual([])
  })
})

describe('rankReverseProspects', () => {
  const match = (over: Partial<ReverseProspectMatch>): ReverseProspectMatch => ({
    need_id: 'n-x',
    need_title: 'Rôle',
    project_id: 'p-x',
    project_label: 'Affaire',
    account_id: 'a-x',
    account_name: 'Compte',
    location: 'Lyon',
    shared_skills: [],
    already_in_portfolio: false,
    ...over,
  })

  it('classe d’abord par nombre de compétences partagées, décroissant', () => {
    const one = match({ need_id: 'n-1', shared_skills: ['Java'] })
    const two = match({ need_id: 'n-2', shared_skills: ['Java', 'AWS'] })
    expect(rankReverseProspects([one, two]).map(m => m.need_id)).toEqual(['n-2', 'n-1'])
  })

  it('départage à égalité par le libellé du besoin, en français', () => {
    const b = match({ need_id: 'n-b', need_title: 'Beta' })
    const a = match({ need_id: 'n-a', need_title: 'Alpha' })
    expect(rankReverseProspects([b, a]).map(m => m.need_id)).toEqual(['n-a', 'n-b'])
  })

  it('ne modifie pas le tableau reçu', () => {
    const one = match({ need_id: 'n-1' })
    const two = match({ need_id: 'n-2' })
    const input = [one, two]
    rankReverseProspects(input)
    expect(input).toEqual([one, two])
  })
})
