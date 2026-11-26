import { describe, expect, it } from 'vitest'
import type { Submission } from '@bellum/contracts'
import { SHORTLIST_PREVIEW_SIZE, shortlistOf } from './need-shortlist'

// #4344.4 — la shortlist d'un besoin, au bon périmètre.
const sub = (id: string, needId: string | null) => ({ id, needId }) as unknown as Submission

describe('shortlistOf', () => {
  const items = [sub('1', 'n1'), sub('2', 'n2'), sub('3', 'n1'), sub('4', null), sub('5', 'n1'), sub('6', 'n1')]

  it('ne garde que les positionnés sur CE besoin, pas les rôles voisins ni les non rattachés', () => {
    expect(shortlistOf(items, 'n1').first.map(s => s.id)).toEqual(['1', '3', '5', '6'])
  })

  it('compte tout et ne nomme que les premiers', () => {
    const preview = shortlistOf(items, 'n1', SHORTLIST_PREVIEW_SIZE)
    expect(preview.count).toBe(4)
    expect(preview.first.map(s => s.id)).toEqual(['1', '3', '5'])
  })

  it('personne sur ce besoin → count 0 et aucune ligne (l’appelant ne rend rien)', () => {
    expect(shortlistOf(items, 'n9')).toEqual({ count: 0, first: [] })
  })
})
