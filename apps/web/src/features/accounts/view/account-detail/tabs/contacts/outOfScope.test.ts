import { describe, expect, it } from 'vitest'
import { readContactsOutOfScope } from './outOfScope'

describe('readContactsOutOfScope', () => {
  it('surfaces the count and the entities the contacts came from', () => {
    const view = readContactsOutOfScope({
      contacts_out_of_scope: {
        dropped: 3,
        entities: [
          { name: 'SGTM', count: 2 },
          { name: "Société Générale Côte d'Ivoire", count: 1 },
        ],
      },
    })
    expect(view).toEqual({ dropped: 3, entities: ['SGTM', "Société Générale Côte d'Ivoire"] })
  })

  it('says nothing on a dossier produced before the field existed', () => {
    // Rétro-compatibilité : pas de date ni de compte inventés, juste rien.
    expect(readContactsOutOfScope({ sector: 'Banque' })).toBeNull()
    expect(readContactsOutOfScope(undefined)).toBeNull()
  })

  it('says nothing when the run dropped nobody', () => {
    // Un « 0 écarté » ferait croire qu'un filtrage a eu lieu.
    expect(readContactsOutOfScope({ contacts_out_of_scope: { dropped: 0, entities: [] } })).toBeNull()
  })

  it('keeps the count even when an employer had no name', () => {
    const view = readContactsOutOfScope({
      contacts_out_of_scope: { dropped: 2, entities: [{ name: 'SGTM', count: 1 }] },
    })
    expect(view).toEqual({ dropped: 2, entities: ['SGTM'] })
  })

  it('ignores a malformed block rather than rendering garbage', () => {
    expect(readContactsOutOfScope({ contacts_out_of_scope: { dropped: 'trois' } })).toBeNull()
  })
})
