import { describeDecisionRoleChange } from './decision-role-change'

describe('describeDecisionRoleChange (#2875 #2402.3)', () => {
  it('un passage entre deux rôles dont un décisionnel est un changement de décideur', () => {
    expect(describeDecisionRoleChange('economic', 'user')).toEqual({ from: 'economic', to: 'user' })
    expect(describeDecisionRoleChange('user', 'technical')).toEqual({ from: 'user', to: 'technical' })
  })

  it('une première classification (ancien rôle absent) n’est PAS un changement — l’inconnu se tait', () => {
    expect(describeDecisionRoleChange(null, 'economic')).toBeNull()
    expect(describeDecisionRoleChange('', 'economic')).toBeNull()
  })

  it('un rôle effacé (nouveau rôle absent) n’est PAS un changement de décideur', () => {
    expect(describeDecisionRoleChange('economic', null)).toBeNull()
  })

  it('deux rôles non décisionnels (champion → influenceur) ne font pas de signal', () => {
    expect(describeDecisionRoleChange('champion', 'influencer')).toBeNull()
  })

  it('deux fois le même rôle (casse ou espaces près) n’est pas un changement', () => {
    expect(describeDecisionRoleChange('Economic', ' economic ')).toBeNull()
  })
})
