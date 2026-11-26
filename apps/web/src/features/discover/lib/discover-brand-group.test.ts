import { describe, expect, it } from 'vitest'
import { collapseBrandMembers } from './discover-brand-group'
import type { DiscoverCandidate } from './discover-types'

const row = (siren: string, name: string, brandGroup?: DiscoverCandidate['brandGroup']) =>
  ({ siren, name, ...(brandGroup ? { brandGroup } : {}) }) as unknown as DiscoverCandidate

describe('#4892.1 — une marque = une ligne', () => {
  it('replie l’entité membre sous sa tête : Décathlon ×2 devient une ligne', () => {
    const head = row('1', 'DECATHLON FRANCE', { role: 'head', members: [{ siren: '2', name: 'DECATHLON' }] })
    const member = row('2', 'DECATHLON', { role: 'member', headSiren: '1' })
    const other = row('3', 'AUTRE')
    expect(collapseBrandMembers([head, member, other]).map(c => c.siren)).toEqual(['1', '3'])
  })

  it('une entité dont la tête n’est pas dans la liste RESTE affichée (rien ne disparaît)', () => {
    const member = row('2', 'DECATHLON', { role: 'member', headSiren: '1' })
    expect(collapseBrandMembers([member])).toEqual([member])
  })

  it('sans regroupement proposé, la liste est rendue telle quelle', () => {
    const list = [row('1', 'A'), row('2', 'B')]
    expect(collapseBrandMembers(list)).toBe(list)
  })
})

describe('garde #4892.3 — les entités du groupe se déplient sous la tête', () => {
  it('la tête garde ses membres avec nom, SIREN, ville et effectif lus sur leur ligne', () => {
    const head = row('1', 'DECATHLON', { role: 'head', members: [{ siren: '2', name: 'BEL DECATHLON' }] })
    const member = {
      ...row('2', 'BEL DECATHLON', { role: 'member', headSiren: '1' }),
      city: 'Lille',
      headcountRange: '50-99',
    } as DiscoverCandidate
    const [out] = collapseBrandMembers([head, member])
    expect(out?.brandGroup).toEqual({
      role: 'head',
      members: [{ siren: '2', name: 'BEL DECATHLON', city: 'Lille', headcountRange: '50-99' }],
    })
  })
})
