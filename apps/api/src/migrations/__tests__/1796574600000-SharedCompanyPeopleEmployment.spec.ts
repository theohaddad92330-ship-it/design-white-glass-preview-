import type { QueryRunner } from 'typeorm'
import { SharedCompanyPeopleEmployment1796574600000 } from '../1796574600000-SharedCompanyPeopleEmployment'

async function run(): Promise<string[]> {
  const queries: string[] = []
  const runner = {
    query: jest.fn(async (sql: string) => {
      queries.push(sql.replace(/\s+/g, ' ').trim())
      return []
    }),
  } as unknown as QueryRunner
  await new SharedCompanyPeopleEmployment1796574600000().up(runner)
  return queries
}

describe('SharedCompanyPeopleEmployment1796574600000 (#4286.15.b)', () => {
  it('ADDITIVE : ajoute l’état employeur et la date de départ, ne retire ni ne réécrit rien', async () => {
    const all = (await run()).join('\n')
    expect(all).toContain("ADD COLUMN IF NOT EXISTS employment_state text NOT NULL DEFAULT 'current'")
    expect(all).toContain('ADD COLUMN IF NOT EXISTS left_at date NULL')
    expect(all).not.toMatch(/DROP COLUMN|DROP TABLE|DELETE FROM|TRUNCATE|UPDATE shared_company_people/i)
  })

  it('le vocabulaire est fermé en base, AVANT le code qui l’écrit (GA-11/12)', async () => {
    const all = (await run()).join('\n')
    expect(all).toContain(
      "CONSTRAINT shared_company_people_employment_state_check CHECK (employment_state IN ('current', 'former'))",
    )
  })

  it('sait dire NON — une date de départ sur une personne actuelle est refusée par la base', async () => {
    const all = (await run()).join('\n')
    expect(all).toContain(
      "CONSTRAINT shared_company_people_left_at_check CHECK (left_at IS NULL OR employment_state = 'former')",
    )
  })

  it('n’ajoute aucune colonne d’espace, de note, de statut commercial ni de coût (GA-43)', async () => {
    const all = (await run()).join('\n')
    expect(all).not.toMatch(/\b(workspace_id|user_id|account_id|notes?|cost|price|tjm|credits?|provider)\b/i)
  })
})
