import { describe, expect, it } from 'vitest'
import { BULK_SEND_MAX, buildBulkPreflight, type BulkRecipient } from './bulkEmail'

function contact(id: string, email: string | null): BulkRecipient {
  return { id, email, full_name: `Contact ${id}` }
}

describe('buildBulkPreflight', () => {
  it('keeps only contacts with an email as recipients', () => {
    const selected = [contact('1', 'a@x.com'), contact('2', null), contact('3', '  '), contact('4', 'd@x.com')]
    const pre = buildBulkPreflight(selected)

    expect(pre.total).toBe(4)
    expect(pre.recipients.map(c => c.id)).toEqual(['1', '4'])
    expect(pre.withoutEmail.map(c => c.id)).toEqual(['2', '3'])
    expect(pre.overCap).toBe(false)
    expect(pre.droppedForCap).toBe(0)
  })

  it('caps recipients at BULK_SEND_MAX and reports the overflow', () => {
    const selected = Array.from({ length: BULK_SEND_MAX + 7 }, (_, i) => contact(String(i), `${i}@x.com`))
    const pre = buildBulkPreflight(selected)

    expect(pre.recipients).toHaveLength(BULK_SEND_MAX)
    expect(pre.overCap).toBe(true)
    expect(pre.droppedForCap).toBe(7)
  })

  it('returns an empty batch when nothing is addressable', () => {
    const pre = buildBulkPreflight([contact('1', null)])
    expect(pre.recipients).toHaveLength(0)
    expect(pre.overCap).toBe(false)
  })
})
