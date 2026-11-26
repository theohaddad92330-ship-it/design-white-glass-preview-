import { describe, expect, it } from 'vitest'
import { contactEmploymentStatus } from './contactEmploymentStatus'

// #4055.8 (Louis 15/10/2026) — trois états : « Pas encore vérifié », « Non retrouvé », « A quitté l'entreprise ».
const AT = '2026-10-11T08:00:00.000Z'

describe('contactEmploymentStatus', () => {
  it('jamais relu, jamais vérifié : « pas encore vérifié »', () => {
    expect(contactEmploymentStatus({ rawData: null, employmentVerifiedAt: null })).toEqual({ state: 'unverified' })
    expect(contactEmploymentStatus({ rawData: { employmentCheck: {} }, employmentVerifiedAt: undefined })).toEqual({
      state: 'unverified',
    })
  })

  it('relu sans résultat : « non retrouvé », daté', () => {
    const raw = { employmentCheck: { at: AT, state: 'not_found' } }
    expect(contactEmploymentStatus({ rawData: raw, employmentVerifiedAt: null })).toEqual({
      state: 'not_found',
      at: AT,
    })
  })

  it('un autre employeur observé, daté : « a quitté l’entreprise », avec l’employeur vu', () => {
    const raw = { employmentCheck: { at: AT, state: 'left', organization: 'Capgemini' } }
    expect(contactEmploymentStatus({ rawData: raw, employmentVerifiedAt: null })).toEqual({
      state: 'left',
      at: AT,
      organization: 'Capgemini',
    })
  })

  it('SAIT DIRE NON — « a quitté » sans date lisible ou sans employeur observé n’existe pas', () => {
    expect(
      contactEmploymentStatus({
        rawData: { employmentCheck: { state: 'left', organization: 'Capgemini' } },
        employmentVerifiedAt: null,
      }).state,
    ).not.toBe('left')
    expect(
      contactEmploymentStatus({ rawData: { employmentCheck: { at: AT, state: 'left' } }, employmentVerifiedAt: null })
        .state,
    ).not.toBe('left')
    expect(
      contactEmploymentStatus({
        rawData: { employmentCheck: { at: 'pas une date', state: 'left', organization: 'X' } },
        employmentVerifiedAt: null,
      }).state,
    ).not.toBe('left')
  })

  it('confirmé ou vu : un fait daté « vu le », jamais « vérifié » ni « a quitté »', () => {
    expect(
      contactEmploymentStatus({
        rawData: { employmentCheck: { at: AT, state: 'confirmed', organization: 'Orange' } },
        employmentVerifiedAt: null,
      }),
    ).toEqual({ state: 'seen', at: AT })
  })

  it('SAIT DIRE NON — un emploi déjà vérifié (fournisseur ou main) n’est pas « pas encore vérifié »', () => {
    expect(contactEmploymentStatus({ rawData: null, employmentVerifiedAt: '2026-09-01T00:00:00Z' }).state).toBe('seen')
  })
})
