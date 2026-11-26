import type { QueryRunner } from 'typeorm'
import { ContactEmailSendAttachments1796437901202 } from '../1796437901202-ContactEmailSendAttachments'

function createRunner(): { runner: QueryRunner; queries: string[] } {
  const queries: string[] = []
  const runner = {
    query: jest.fn(async (sql: string) => {
      queries.push(sql)
      return []
    }),
  } as unknown as QueryRunner
  return { runner, queries }
}

const normalize = (sql: string): string => sql.replace(/\s+/g, ' ').trim()

// #3699.6 — la base accepte la preuve des pièces AVANT le code qui l'écrit (GA-11/GA-12).
describe('ContactEmailSendAttachments1796437901202', () => {
  it('ajoute une colonne jsonb NULLABLE, bornée à un tableau', async () => {
    const { runner, queries } = createRunner()
    await new ContactEmailSendAttachments1796437901202().up(runner)
    const all = queries.map(normalize).join('\n')
    expect(all).toContain('ALTER TABLE contacts ADD COLUMN IF NOT EXISTS email_send_attachments jsonb')
    expect(all).not.toContain('email_send_attachments jsonb NOT NULL')
    expect(all).toContain("CHECK (email_send_attachments IS NULL OR jsonb_typeof(email_send_attachments) = 'array')")
  })

  it('down() retire la contrainte puis la colonne', async () => {
    const { runner, queries } = createRunner()
    await new ContactEmailSendAttachments1796437901202().down(runner)
    expect(queries.map(normalize)).toEqual([
      'ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_email_send_attachments_check',
      'ALTER TABLE contacts DROP COLUMN IF EXISTS email_send_attachments',
    ])
  })
})
