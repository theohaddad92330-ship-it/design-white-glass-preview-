import { missingScopes, scopeSignature } from './oauth-scope-gap'

describe('missingScopes — portées DEMANDÉES moins portées ACCORDÉES', () => {
  it('rend les portées demandées que le jeton ne porte pas', () => {
    expect(
      missingScopes(
        'oauth crm.objects.contacts.read crm.objects.deals.read crm.objects.deals.write',
        'oauth crm.objects.contacts.read',
      ),
    ).toEqual(['crm.objects.deals.read', 'crm.objects.deals.write'])
  })

  it('rend [] quand tout est accordé, quel que soit l’ordre', () => {
    expect(missingScopes('a b', 'b a c')).toEqual([])
  })

  it('compare des jetons ENTIERS : Mail.Read n’accorde pas Mail.ReadWrite', () => {
    expect(missingScopes('Mail.ReadWrite', 'Mail.Read')).toEqual(['Mail.ReadWrite'])
  })

  it('ignore la casse (Microsoft rend mail.read pour Mail.Read)', () => {
    expect(missingScopes('Mail.Read', 'mail.read')).toEqual([])
  })

  it('accepte des listes séparées par des virgules (Zoho)', () => {
    expect(missingScopes('ZohoCRM.users.READ,ZohoCRM.modules.deals.READ', 'ZohoCRM.users.READ')).toEqual([
      'ZohoCRM.modules.deals.READ',
    ])
  })

  it('ne rend rien quand le fournisseur ne rend pas ses portées (null) : on ne devine pas', () => {
    expect(missingScopes('a b', null)).toBeNull()
    expect(missingScopes('a b', undefined)).toBeNull()
  })

  it('ne demande rien ⇒ rien ne manque', () => {
    expect(missingScopes('', 'a')).toEqual([])
    expect(missingScopes(null, 'a')).toEqual([])
  })
})

describe('scopeSignature — l’empreinte stable d’un ensemble de portées manquantes', () => {
  it('ne dépend ni de l’ordre ni de la casse', () => {
    expect(scopeSignature(['b', 'A'])).toBe(scopeSignature(['a', 'B']))
  })
  it('change quand l’ensemble change', () => {
    expect(scopeSignature(['a'])).not.toBe(scopeSignature(['a', 'b']))
  })
})
