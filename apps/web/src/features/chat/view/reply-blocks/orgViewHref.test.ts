import { describe, expect, it } from 'vitest'
import { orgViewHref } from './orgViewHref'

describe('orgViewHref — #AM.32', () => {
  it('cyber chez EDF : l’onglet Organigramme du compte, filtré sur la famille Cyber', () => {
    const url = new URL(orgViewHref({ account_id: 'acc-1', perimeter: 'cyber' }), 'https://app.test')
    expect(url.pathname).toBe('/accounts/acc-1')
    expect(url.searchParams.get('tab')).toBe('organigramme')
    expect(url.searchParams.get('of')).toBe('family=Cyber')
  })

  it('« RSSI » désigne la même famille ; un périmètre inconnu n’écrit aucun filtre', () => {
    expect(new URL(orgViewHref({ account_id: 'a', perimeter: 'RSSI' }), 'https://x.test').searchParams.get('of')).toBe(
      'family=Cyber',
    )
    const unknown = new URL(orgViewHref({ account_id: 'a', perimeter: 'zzz inconnu' }), 'https://x.test')
    expect(unknown.searchParams.has('of')).toBe(false)
    expect(unknown.searchParams.get('tab')).toBe('organigramme')
  })
})
