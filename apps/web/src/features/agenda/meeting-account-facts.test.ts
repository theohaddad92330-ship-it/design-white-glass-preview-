import { describe, expect, it } from 'vitest'
import { resolveAccountGroupRoleFact } from './meeting-account-facts'

describe('resolveAccountGroupRoleFact (#2319.5 — la filiale du compte associé)', () => {
  it('rend le lien quand le compte est une FILIALE observée et datée', () => {
    const fact = resolveAccountGroupRoleFact({
      group_role: 'filiale',
      group_head_siren: '222222222',
      group_link_observed_at: '2026-09-10T08:00:00.000Z',
    })
    expect(fact).toEqual({ role: 'filiale', headSiren: '222222222', date: '2026-09-10T08:00:00.000Z' })
  })

  it('rend le lien quand le compte EST la tête de groupe, sans SIREN de tête (aucun au-dessus de lui)', () => {
    const fact = resolveAccountGroupRoleFact({
      group_role: 'groupe',
      group_head_siren: null,
      group_link_observed_at: '2026-09-10T08:00:00.000Z',
    })
    expect(fact).toEqual({ role: 'groupe', headSiren: null, date: '2026-09-10T08:00:00.000Z' })
  })

  it('rend `null` sans rôle connu — jamais un rôle deviné', () => {
    expect(
      resolveAccountGroupRoleFact({ group_role: null, group_head_siren: null, group_link_observed_at: null }),
    ).toBeNull()
    expect(resolveAccountGroupRoleFact({})).toBeNull()
  })

  it('un rôle SANS date d’observation ne date rien — le fait ne s’affiche pas', () => {
    // Même règle que secteur/effectif/CA : un fait sans date se tait plutôt que
    // de se faire passer pour « à l’instant ».
    expect(
      resolveAccountGroupRoleFact({
        group_role: 'filiale',
        group_head_siren: '222222222',
        group_link_observed_at: null,
      }),
    ).toBeNull()
  })
})
