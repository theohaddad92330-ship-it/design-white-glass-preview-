import { describe, expect, it } from 'vitest'
import { talentPaginationRange } from './talentPagination'

describe('talentPaginationRange', () => {
  it('rend une seule page quand il n’y en a qu’une', () => {
    expect(talentPaginationRange(1, 1)).toEqual([1])
  })

  it('rend toutes les pages sans coupure quand elles tiennent', () => {
    expect(talentPaginationRange(2, 5)).toEqual([1, 2, 3, 4, 5])
  })

  it('coupe autour de la page courante sur un grand vivier', () => {
    expect(talentPaginationRange(30, 63)).toEqual([1, null, 29, 30, 31, null, 63])
  })

  it('ne coupe qu’une fois quand la page courante est près du début', () => {
    expect(talentPaginationRange(1, 63)).toEqual([1, 2, null, 63])
  })

  it('ne coupe qu’une fois quand la page courante est près de la fin', () => {
    expect(talentPaginationRange(63, 63)).toEqual([1, null, 62, 63])
  })

  it('ne pose jamais deux coupures consécutives', () => {
    const range = talentPaginationRange(3, 5)
    expect(range).toEqual([1, 2, 3, 4, 5])
  })
})
