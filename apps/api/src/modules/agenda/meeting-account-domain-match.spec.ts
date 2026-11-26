import { matchAccountByDomain } from './meeting-account-domain-match'

/**
 * #2390.4/#2390.17 (épopée #2926) — le rattachement rendez-vous → compte assez
 * SÛR pour agir sans geste humain : le DOMAINE d'un invité externe, jamais le
 * titre (un indice, pas une preuve — réservé à l'ouverture manuelle côté
 * web, `meeting-account-match.ts`).
 */

function event(attendees: { email: string; external: boolean }[]) {
  return {
    attendees: attendees.map(a => ({ email: a.email, displayName: null, responseStatus: null, external: a.external })),
  }
}

describe('matchAccountByDomain (#2926, #2390.4/#2390.17)', () => {
  const accounts = [
    { id: 'acc-1', company_name: 'ACME', website: 'https://acme.fr' },
    { id: 'acc-2', company_name: 'Nova Logistique', website: 'www.nova-logistique.com' },
  ]

  it('rattache par le domaine d’un invité externe', () => {
    const result = matchAccountByDomain(event([{ email: 'j.morvan@acme.fr', external: true }]), accounts)
    expect(result?.id).toBe('acc-1')
  })

  it('ignore un invité interne, même sur un domaine qui matcherait par ailleurs', () => {
    const result = matchAccountByDomain(event([{ email: 'j.morvan@acme.fr', external: false }]), accounts)
    expect(result).toBeNull()
  })

  it('aucun domaine externe connu ⇒ null, jamais un compte deviné', () => {
    const result = matchAccountByDomain(event([{ email: 'x@inconnu.io', external: true }]), accounts)
    expect(result).toBeNull()
  })

  it('un compte sans website n’est jamais candidat', () => {
    const result = matchAccountByDomain(event([{ email: 'x@sanssite.fr', external: true }]), [
      { id: 'acc-3', company_name: 'Sans Site', website: null },
    ])
    expect(result).toBeNull()
  })

  it('aucun invité ⇒ null', () => {
    expect(matchAccountByDomain(event([]), accounts)).toBeNull()
  })
})
