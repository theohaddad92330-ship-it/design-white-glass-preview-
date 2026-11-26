import { companyNamesScope, headcountFloorOf, pickScopeCandidate } from './analysis-scope-candidate'

describe('#3434 — pickScopeCandidate : la garde porte sur le plus gros homonyme, jamais sur le seul rang 0', () => {
  it('prend l’entité GE même quand une filiale PME de même nom est classée avant', () => {
    const picked = pickScopeCandidate('Michelin', [
      { name: 'Michelin Conseil', employees_min: 10, employees_max: 19 },
      { name: 'Compagnie Générale des Établissements Michelin — Michelin', size_class: 'GE', employees_min: 10000 },
    ])
    expect(picked?.size_class).toBe('GE')
  })

  it('ignore un homonyme énorme dont le nom ne correspond pas à la demande', () => {
    const picked = pickScopeCandidate('Michelin', [
      { name: 'Michelin Services', employees_min: 20, employees_max: 49 },
      { name: 'Total Énergies', size_class: 'GE' },
    ])
    expect(picked?.name).toBe('Michelin Services')
  })

  it('accents et casse ne comptent pas', () => {
    const picked = pickScopeCandidate('societe generale', [
      { name: 'Société Générale Assurances', employees_min: 100 },
      { name: 'SOCIÉTÉ GÉNÉRALE', headcount_label: '10 000 salariés et plus' },
    ])
    expect(picked?.name).toBe('SOCIÉTÉ GÉNÉRALE')
  })

  it('aucun nom ne correspond : le rang 0 du registre, jamais rien d’inventé', () => {
    expect(pickScopeCandidate('Zzz', [{ name: 'Autre' }, { name: 'Encore' }])?.name).toBe('Autre')
  })

  it('liste vide : rien', () => {
    expect(pickScopeCandidate('Michelin', [])).toBeNull()
  })
})

describe('#3434 — headcountFloorOf', () => {
  it.each([
    [{ size_class: 'GE' }, 5000],
    [{ employees_min: 10000 }, 10000],
    [{ headcount_label: '10 000 salariés et plus' }, 10000],
    [{ headcount_label: '5 000 à 9 999 salariés' }, 5000],
    [{ headcount_label: '10000 salariés et plus' }, 10000],
    [{ size_class: 'PME' }, null],
    [{}, null],
  ])('%j → %s', (suggestion, floor) => {
    expect(headcountFloorOf(suggestion)).toBe(floor)
  })
})

describe('#3434 — companyNamesScope : un périmètre déjà nommé ne repose pas la question', () => {
  it.each([
    ['Michelin — direction Data/IA France', true],
    ['Michelin - programme Data', true],
    ['Michelin (filiale Italie)', true],
    ['Michelin : entités France', true],
    ['Michelin', false],
    ['Société Générale', false],
    ['Air Liquide', false],
  ])('%s → %s', (company, named) => {
    expect(companyNamesScope(company)).toBe(named)
  })
})
