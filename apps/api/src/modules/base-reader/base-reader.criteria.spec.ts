import { BASE_READER_DEFAULT_LIMIT, BASE_READER_MAX_LIMIT } from './base-reader.limits'
import { baseReaderCriteriaOf } from './base-reader.criteria'

/**
 * #4792 — les critères, normalisés au bord. Une absence devient un NEUTRE, jamais une valeur devinée :
 * c'est ce qui permet au service de distinguer « aucun critère » de « critère qui ne correspond à rien ».
 */
const dto = (over: Record<string, unknown> = {}) => over as Parameters<typeof baseReaderCriteriaOf>[0]

describe('#4792 — les critères normalisés au bord', () => {
  it('un champ absent devient son NEUTRE, jamais une valeur devinée', () => {
    expect(baseReaderCriteriaOf(dto())).toEqual({
      terms: [],
      city: null,
      departments: [],
      regions: [],
      from: null,
      to: null,
      families: [],
      accountIds: [],
      limit: BASE_READER_DEFAULT_LIMIT,
      offset: 0,
    })
  })

  it('les critères donnés voyagent tels quels, et les bornes sont appliquées une fois', () => {
    const criteria = baseReaderCriteriaOf(
      dto({
        terms: ['Java', 'Vue'],
        departments: ['59'],
        regions: ['Hauts-de-France'],
        families: ['needs'],
        from: '2026-01-01',
        limit: 10_000 as never,
        offset: 700,
      }),
    )
    expect(criteria).toMatchObject({
      terms: ['Java', 'Vue'],
      departments: ['59'],
      regions: ['Hauts-de-France'],
      families: ['needs'],
      from: '2026-01-01',
      to: null,
      limit: BASE_READER_MAX_LIMIT,
      offset: 700,
    })
  })
})

describe('#4794 — excludeEsn voyage jusqu’au lecteur, et reste absent sinon', () => {
  it('posé, il est conservé ; absent, il n’apparaît pas', () => {
    expect(baseReaderCriteriaOf(dto({ excludeEsn: true })).excludeEsn).toBe(true)
    expect('excludeEsn' in baseReaderCriteriaOf(dto())).toBe(false)
    expect('excludeEsn' in baseReaderCriteriaOf(dto({ excludeEsn: false }))).toBe(false)
  })
})
