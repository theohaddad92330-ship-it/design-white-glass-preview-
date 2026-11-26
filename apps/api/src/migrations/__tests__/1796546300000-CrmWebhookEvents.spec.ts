import type { QueryRunner } from 'typeorm'
import { CRM_WEBHOOK_PROVIDERS } from '../../modules/crm-webhooks/crm-webhooks.service'
import { CrmWebhookEvents1796546300000 } from '../1796546300000-CrmWebhookEvents'

async function run(): Promise<string> {
  const queries: string[] = []
  const runner = { query: jest.fn(async (sql: string) => void queries.push(sql.replace(/\s+/g, ' '))) }
  await new CrmWebhookEvents1796546300000().up(runner as unknown as QueryRunner)
  return queries.join(' ')
}

describe('CrmWebhookEvents1796546300000 (#4189.7)', () => {
  it('un événement ne compte qu’une fois : clé unique (fournisseur, identifiant)', async () => {
    expect(await run()).toContain('CONSTRAINT crm_webhook_events_unique UNIQUE (provider, event_id)')
  })

  it('la contrainte porte exactement les fournisseurs du code (GA-11/12), sans donnée du CRM', async () => {
    const sql = await run()
    const values = [...(sql.match(/provider IN \(([^)]*)\)/)?.[1] ?? '').matchAll(/'([^']+)'/g)].map(m => m[1])
    expect(values).toEqual([...CRM_WEBHOOK_PROVIDERS])
    expect(sql).not.toMatch(/payload|body|email|jsonb/i)
  })
})
