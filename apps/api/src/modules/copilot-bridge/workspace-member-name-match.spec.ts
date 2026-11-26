import { matchWorkspaceMemberByName } from './workspace-member-name-match'

const MEMBERS = [
  { userId: 'u-1', fullName: 'Bedros Astourian' },
  { userId: 'u-2', fullName: 'Louis Schlegel' },
  { userId: 'u-3', fullName: 'Louis Martin' },
]

describe('matchWorkspaceMemberByName — #3094', () => {
  it('trouve un nom complet exact, insensible à la casse', () => {
    expect(matchWorkspaceMemberByName(MEMBERS, 'bedros astourian')).toEqual({
      kind: 'found',
      member: { userId: 'u-1', fullName: 'Bedros Astourian' },
    })
  })

  it('trouve un prénom seul quand un seul membre commence par ce mot', () => {
    expect(matchWorkspaceMemberByName(MEMBERS, 'Bedros')).toEqual({
      kind: 'found',
      member: { userId: 'u-1', fullName: 'Bedros Astourian' },
    })
  })

  it('ignore les accents (Bédros retrouve Bedros)', () => {
    expect(matchWorkspaceMemberByName(MEMBERS, 'Bédros')).toEqual({
      kind: 'found',
      member: { userId: 'u-1', fullName: 'Bedros Astourian' },
    })
  })

  it('ne matche jamais un préfixe qui ne coupe pas sur un mot entier', () => {
    expect(matchWorkspaceMemberByName(MEMBERS, 'Bedro')).toEqual({ kind: 'not_found' })
  })

  it('dit "ambiguous" avec les deux noms quand deux membres partagent le même prénom', () => {
    const result = matchWorkspaceMemberByName(MEMBERS, 'Louis')
    expect(result.kind).toBe('ambiguous')
    expect(result).toMatchObject({ candidates: expect.arrayContaining(['Louis Schlegel', 'Louis Martin']) })
  })

  it('dit "not_found" plutôt que de deviner, pour un nom qui ne correspond à personne', () => {
    expect(matchWorkspaceMemberByName(MEMBERS, 'Personne Inconnue')).toEqual({ kind: 'not_found' })
  })

  it('dit "not_found" sur un nom vide, jamais un premier membre au hasard', () => {
    expect(matchWorkspaceMemberByName(MEMBERS, '   ')).toEqual({ kind: 'not_found' })
  })
})
