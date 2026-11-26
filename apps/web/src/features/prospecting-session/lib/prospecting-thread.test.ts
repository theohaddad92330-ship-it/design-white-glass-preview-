import { describe, expect, it } from 'vitest'
import { nextProspectingThreadStep, prospectingThreadFromSearch, prospectingThreadNextLink } from './prospecting-thread'

describe('#2386.1 — prospecting-thread', () => {
  it('enchaîne prepare → send → issue, puis NON — rien après la dernière étape', () => {
    expect(nextProspectingThreadStep('prepare')).toBe('send')
    expect(nextProspectingThreadStep('send')).toBe('issue')
    expect(nextProspectingThreadStep('issue')).toBeNull()
  })

  it('porte le compte et le mode en paramètres, vers le bon écran', () => {
    const link = prospectingThreadNextLink('prepare', { accountId: 'acc-1', mode: 'email' })
    expect(link).toEqual({
      to: '/actions/sequences',
      search: { prospecting_thread_step: 'send', prospecting_account_id: 'acc-1', prospecting_mode: 'email' },
    })
  })

  it('NON — un compte absent (session multi-comptes) n’est jamais deviné dans le lien', () => {
    const link = prospectingThreadNextLink('prepare', {})
    expect(link).toEqual({ to: '/actions/sequences', search: { prospecting_thread_step: 'send' } })
    expect(link?.search).not.toHaveProperty('prospecting_account_id')
  })

  it('NON — la dernière étape ne rend aucun lien « suivant »', () => {
    expect(prospectingThreadNextLink('issue', { accountId: 'acc-1' })).toBeNull()
  })

  it('lit le contexte porté par un écran ouvert PAR le fil', () => {
    expect(
      prospectingThreadFromSearch({
        prospecting_thread_step: 'send',
        prospecting_account_id: 'acc-1',
        prospecting_mode: 'appels',
      }),
    ).toEqual({ step: 'send', context: { accountId: 'acc-1', mode: 'appels' } })
  })

  it('NON — un écran ouvert SANS le fil ne rend rien (jamais une étape devinée)', () => {
    expect(prospectingThreadFromSearch({})).toBeNull()
    expect(prospectingThreadFromSearch({ prospecting_thread_step: 'not-a-step' })).toBeNull()
  })
})
