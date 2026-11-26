import type { QueryRunner } from 'typeorm'
import { ExternalSourcingPartnerBriefs1796340441763 } from '../1796340441763-ExternalSourcingPartnerBriefs'

async function upQueries(): Promise<string[]> {
  const queries: string[] = []
  const runner = {
    query: jest.fn(async (sql: string) => {
      queries.push(sql.replace(/\s+/g, ' ').trim())
      return []
    }),
  } as unknown as QueryRunner
  await new ExternalSourcingPartnerBriefs1796340441763().up(runner)
  return queries
}

/** #2818 (lot T4) — le brief se PRÉPARE, il ne s'envoie jamais. */
describe('ExternalSourcingPartnerBriefs1796340441763', () => {
  it('crée la table avec un texte LIBRE pour le partenaire — aucun répertoire fermé', async () => {
    const sql = (await upQueries()).join('\n')
    const table = sql.split('CREATE TABLE IF NOT EXISTS external_sourcing_partner_briefs')[1] ?? ''
    expect(table).toContain('partner_name text NOT NULL')
  })

  it('n’a AUCUNE colonne "sent_at" — un brief ne porte jamais de preuve d’envoi', async () => {
    const sql = (await upQueries()).join('\n')
    expect(sql).not.toMatch(/\bsent_at\b/)
    expect(sql).not.toContain('status text')
  })

  it('feedback est nullable, jamais NOT NULL — l’absence de retour n’est pas une chaîne vide', async () => {
    const sql = (await upQueries()).join('\n')
    expect(sql).toContain('feedback text NULL')
  })

  it('référence le besoin et le workspace, ON DELETE CASCADE', async () => {
    const sql = (await upQueries()).join('\n')
    expect(sql).toContain('need_id uuid NOT NULL REFERENCES project_needs(id) ON DELETE CASCADE')
    expect(sql).toContain('workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE')
  })

  it('active la RLS', async () => {
    const sql = await upQueries()
    expect(sql).toContain('ALTER TABLE external_sourcing_partner_briefs ENABLE ROW LEVEL SECURITY')
  })
})
