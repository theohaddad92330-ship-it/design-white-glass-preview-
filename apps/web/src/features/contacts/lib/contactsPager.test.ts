import { describe, expect, it } from 'vitest'
import { contactsPagerOf } from './contactsPager'

describe('contactsPagerOf', () => {
  it('865 contacts / 25 par page : la dernière page (35) est partielle et « Suivant » y est désactivé', () => {
    const last = contactsPagerOf({ page: 34, size: 25, loaded: 865, total: 865, hasNextPage: true })
    expect(last.pageCount).toBe(35)
    expect(last.from).toBe(851)
    expect(last.to).toBe(865)
    expect(last.canNext).toBe(false)
  })

  it('avant la dernière page « Suivant » reste actif', () => {
    expect(contactsPagerOf({ page: 33, size: 25, loaded: 850, total: 865, hasNextPage: true }).canNext).toBe(true)
  })

  it('une page au-delà du total est ramenée à la dernière : jamais « 36 / 35 », jamais « 0-875 sur 865 »', () => {
    const over = contactsPagerOf({ page: 35, size: 25, loaded: 865, total: 865, hasNextPage: false })
    expect(over.page).toBe(34)
    expect(over.to).toBeLessThanOrEqual(865)
    expect(over.from).toBe(851)
  })

  it('total inconnu : on suit les lignes chargées et la page serveur suivante', () => {
    expect(contactsPagerOf({ page: 0, size: 25, loaded: 25, total: undefined, hasNextPage: true }).canNext).toBe(true)
    expect(contactsPagerOf({ page: 0, size: 25, loaded: 25, total: undefined, hasNextPage: false }).canNext).toBe(false)
  })

  it('aucune ligne : plage 0-0', () => {
    const empty = contactsPagerOf({ page: 0, size: 25, loaded: 0, total: 0, hasNextPage: false })
    expect(empty.from).toBe(0)
    expect(empty.to).toBe(0)
    expect(empty.canNext).toBe(false)
  })
})
