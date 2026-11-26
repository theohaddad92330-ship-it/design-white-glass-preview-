import { acronymOf, foldName, resolveAccountsByName } from './account-name-resolution'

// #3215 (recette prod 04/10) — « Est-ce que je peux ouvrir SG ? » : le compte actif « Société
// Générale » existe, une fiche archivée « Societe Generale » aussi (#3490).
const ARCHIVED = { id: '8b25ec87', company_name: 'Societe Generale', status: 'archived', commercial_status: 'archived' }
const ACTIVE = { id: '0125b778', company_name: 'Société Générale', status: 'completed', commercial_status: 'inbox' }
const OTHER = { id: 'o-1', company_name: 'Airbus Defence', status: 'completed', commercial_status: 'inbox' }

describe('résolution d’un compte par nom — #3215', () => {
  it('« SG » retrouve « Société Générale » par son sigle, et préfère la fiche ACTIVE à l’archivée', () => {
    const found = resolveAccountsByName('SG', [ARCHIVED, OTHER, ACTIVE])
    expect(found.map(account => account.id)).toEqual(['0125b778', '8b25ec87'])
  })

  it('insensible à la casse, aux accents, à la ponctuation et à la forme juridique', () => {
    for (const typed of [
      'sg',
      'S.G.',
      'societe generale',
      'SOCIÉTÉ GÉNÉRALE',
      'Société-Générale S.A.',
      'Societe Generale SA',
    ]) {
      expect(resolveAccountsByName(typed, [ACTIVE]).map(account => account.id)).toEqual(['0125b778'])
    }
  })

  it('ne rapproche rien qui ne ressemble pas : jamais un compte deviné', () => {
    expect(resolveAccountsByName('SG', [OTHER])).toEqual([])
    expect(resolveAccountsByName('', [ACTIVE])).toEqual([])
    expect(resolveAccountsByName('xyz', [ACTIVE, ARCHIVED])).toEqual([])
  })

  it('un sigle de un seul caractère ne rapproche rien (trop ambigu)', () => {
    expect(resolveAccountsByName('S', [ACTIVE])).toEqual([ACTIVE])
    expect(acronymOf('Société Générale')).toBe('sg')
    expect(acronymOf('Airbus')).toBeNull()
    expect(acronymOf('Caisse d’Épargne')).toBe('ce')
  })

  it('le nom exact passe devant le sigle, à activité égale', () => {
    const sg = { id: 'sg-1', company_name: 'SG', status: 'completed' }
    expect(resolveAccountsByName('SG', [ACTIVE, sg]).map(account => account.id)).toEqual(['sg-1', '0125b778'])
  })

  // #3670 (recette prod 10/10, « Altran Technologies ») — le nom TAPÉ est plus long que la fiche
  // (« Altran Technologies », « le compte Altran ») : le nom du compte est CONTENU dans la saisie.
  it('#3670 — le nom du compte contenu dans une saisie plus longue le retrouve', () => {
    const altran = { id: 'alt-1', company_name: 'ALTRAN', status: 'completed' }
    for (const typed of ['Altran Technologies', 'que sais-tu du compte Altran ?', 'le compte altran']) {
      expect(resolveAccountsByName(typed, [OTHER, altran]).map(account => account.id)).toEqual(['alt-1'])
    }
  })

  it('#3670 — NON : un mot trop court ou une simple sous-chaîne de mot ne rapproche rien', () => {
    const sa = { id: 'sa-1', company_name: 'Sa', status: 'completed' }
    const alt = { id: 'alt-1', company_name: 'Alt', status: 'completed' }
    expect(resolveAccountsByName('Société Générale', [sa])).toEqual([])
    expect(resolveAccountsByName('Altran Technologies', [alt])).toEqual([])
  })

  it('foldName retire accents et ponctuation', () => {
    expect(foldName('  Société-Générale S.A. ')).toBe('societe generale sa')
  })
})
