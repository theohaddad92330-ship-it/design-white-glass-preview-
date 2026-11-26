import type { QueryRunner } from 'typeorm'
import { commercialAuditFeedbackKindSchema } from '@bellum/contracts'
import { CommercialAuditFeedbackValidated1796350797411 } from '../1796350797411-CommercialAuditFeedbackValidated'

describe('CommercialAuditFeedbackValidated1796350797411 (#2075.14)', () => {
  it('élargit le CHECK à chaque genre du contrat, et garde la validation sans texte', async () => {
    const queries: string[] = []
    const runner = {
      query: jest.fn(async (sql: string) => {
        queries.push(sql)
        return []
      }),
    } as unknown as QueryRunner
    await new CommercialAuditFeedbackValidated1796350797411().up(runner)
    const sql = queries.join(' ').replace(/\s+/g, ' ')
    for (const kind of commercialAuditFeedbackKindSchema.options) expect(sql).toContain(`'${kind}'`)
    expect(sql).toContain("kind IN ('refused', 'validated') AND comment_text IS NULL")
  })
})
