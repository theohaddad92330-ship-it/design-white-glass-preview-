import type { QueryRunner } from 'typeorm'
import { NotificationSmsChannel1792800210000 } from '../1792800210000-NotificationSmsChannel'

/** Capture every SQL statement the migration issues (no live DB needed). */
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

async function run(): Promise<string[]> {
  const { runner, queries } = createRunner()
  await new NotificationSmsChannel1792800210000().up(runner)
  return queries.map(normalize)
}

/**
 * #1938.4 — décision Louis 13/09 batch 13. La migration vient AVANT le code qui
 * écrit (GA-11/12) : chaque colonne que `SmsChannelService` écrit existe, et
 * chaque borne que le service tient est aussi tenue par la base.
 */
describe('NotificationSmsChannel1792800210000', () => {
  it('crée notification_sms_channels, une ligne par personne, idempotent', async () => {
    const create = (await run()).find(q => q.includes('CREATE TABLE IF NOT EXISTS notification_sms_channels'))
    expect(create).toBeDefined()
    expect(create).toContain('user_id uuid PRIMARY KEY')
    expect(create).toContain('phone_e164 text NOT NULL')
    expect(create).toContain('phone_verified_at timestamptz NULL')
    expect(create).toContain('consent_at timestamptz NULL')
    expect(create).toContain('verification_code_hash text NULL')
    expect(create).toContain('verification_expires_at timestamptz NULL')
    expect(create).toContain('verification_sent_at timestamptz NULL')
    expect(create).toContain('verification_attempts integer NOT NULL DEFAULT 0')
  })

  it('opt-in par type, JAMAIS coché par défaut', async () => {
    const create = (await run()).find(q => q.includes('CREATE TABLE IF NOT EXISTS notification_sms_channels')) ?? ''
    for (const type of ['buy_signal', 'credit_low', 'action_overdue']) {
      expect(create).toContain(`sms_${type} boolean NOT NULL DEFAULT false`)
    }
    expect(create).not.toMatch(/sms_\w+ boolean NOT NULL DEFAULT true/)
  })

  it('la base refuse un numéro hors E.164, et un type coché sans numéro vérifié', async () => {
    const create = (await run()).find(q => q.includes('CREATE TABLE IF NOT EXISTS notification_sms_channels')) ?? ''
    expect(create).toContain(
      "CONSTRAINT notification_sms_channels_phone_e164_check CHECK (phone_e164 ~ '^[+][1-9][0-9]{7,14}$')",
    )
    expect(create).toContain(
      'CONSTRAINT notification_sms_channels_opt_in_verified_check CHECK (phone_verified_at IS NOT NULL OR NOT (sms_buy_signal OR sms_credit_low OR sms_action_overdue))',
    )
    expect(create).toContain('CONSTRAINT notification_sms_channels_attempts_check CHECK (verification_attempts >= 0)')
  })

  it('RLS : un numéro de téléphone n’est lisible que par son propriétaire', async () => {
    const queries = await run()
    expect(queries).toContain('ALTER TABLE notification_sms_channels ENABLE ROW LEVEL SECURITY')
    const policy = queries.find(q => q.includes('CREATE POLICY'))
    expect(policy).toContain('ON notification_sms_channels')
    expect(policy).toContain('USING (auth.uid() = user_id)')
    expect(policy).toContain('WITH CHECK (auth.uid() = user_id)')
    // Idempotent : rejouée, la migration ne recrée pas la politique.
    expect(policy).toContain('IF NOT EXISTS')
  })

  it('down() is not supported (repo convention — additive, forward-only)', async () => {
    await expect(new NotificationSmsChannel1792800210000().down()).rejects.toThrow('down migrations are not supported')
  })
})
