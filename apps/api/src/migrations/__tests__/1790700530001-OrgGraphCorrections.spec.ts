import { ORG_CORRECTION_FIELDS, ORG_CORRECTION_OBJECT_TYPES } from '@bellum/contracts'
import type { QueryRunner } from 'typeorm'
import { OrgGraphCorrections1790700530001 } from '../1790700530001-OrgGraphCorrections'

/** Capture chaque instruction SQL émise (aucune base réelle n'est nécessaire). */
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

async function ranQueries(): Promise<string[]> {
  const { runner, queries } = createRunner()
  await new OrgGraphCorrections1790700530001().up(runner)
  return queries.map(normalize)
}

describe('OrgGraphCorrections1790700530001', () => {
  it('crée org_graph_corrections avec les QUATORZE colonnes de la spécification, plus la preuve', async () => {
    const create = (await ranQueries()).find(q => q.includes('CREATE TABLE IF NOT EXISTS org_graph_corrections'))
    expect(create).toBeDefined()
    for (const column of [
      'id uuid PRIMARY KEY',
      'workspace_id uuid NOT NULL',
      'account_id uuid NOT NULL',
      'graph_version_before integer NOT NULL',
      'graph_version_after integer NOT NULL',
      'object_type text NOT NULL',
      'object_id text NOT NULL',
      'field text NOT NULL',
      'old_value jsonb',
      'new_value jsonb',
      'reason text NOT NULL',
      'user_id uuid NOT NULL',
      'created_at timestamptz NOT NULL DEFAULT now()',
      'reverted_at timestamptz',
    ]) {
      expect(create).toContain(column)
    }
    // La quinzième : une correction sans sa preuve serait un « parce que je le
    // dis » versionné, et la reprise après un run reperdrait ce qui la justifie.
    expect(create).toContain('evidence jsonb NOT NULL')
  })

  it('rend la ligne annulable sans l’effacer — `reverted_at` est nullable', async () => {
    const create = (await ranQueries()).find(q => q.includes('CREATE TABLE IF NOT EXISTS org_graph_corrections'))!
    expect(create).toContain('reverted_at timestamptz')
    expect(create).not.toContain('reverted_at timestamptz NOT NULL')
  })

  it('interdit en BASE une correction qui ne ferait pas avancer la version', async () => {
    const create = (await ranQueries()).find(q => q.includes('CREATE TABLE IF NOT EXISTS org_graph_corrections'))!
    expect(create).toContain('CONSTRAINT org_graph_corrections_version_advances_check')
    expect(create).toContain('CHECK (graph_version_after > graph_version_before)')
  })

  it('nomme ses contraintes d’énumération et les fait couvrir le contrat TypeScript', async () => {
    const flat = await ranQueries()

    const objectType = flat.find(
      q => q.includes('ADD CONSTRAINT org_graph_corrections_object_type_check') && q.includes('CHECK'),
    )
    expect(objectType).toBeDefined()
    // GA-12 : la contrainte SQL couvre l'énumération TypeScript. Écrire la liste
    // en dur ici la ferait diverger en silence le jour d'un ajout.
    for (const value of ORG_CORRECTION_OBJECT_TYPES) expect(objectType).toContain(`'${value}'`)

    const field = flat.find(q => q.includes('ADD CONSTRAINT org_graph_corrections_field_check') && q.includes('CHECK'))
    expect(field).toBeDefined()
    for (const value of ORG_CORRECTION_FIELDS) expect(field).toContain(`'${value}'`)

    // La garde LIT quelque chose : le corpus n'est pas vide.
    expect(ORG_CORRECTION_OBJECT_TYPES.length).toBeGreaterThan(2)
    expect(ORG_CORRECTION_FIELDS.length).toBeGreaterThan(5)
  })

  it('dépose ses contraintes avant de les poser — rejouable sans échouer', async () => {
    const flat = await ranQueries()
    expect(flat).toContain(
      'ALTER TABLE org_graph_corrections DROP CONSTRAINT IF EXISTS org_graph_corrections_object_type_check',
    )
    expect(flat).toContain(
      'ALTER TABLE org_graph_corrections DROP CONSTRAINT IF EXISTS org_graph_corrections_field_check',
    )
    // Et dans le BON ordre : déposée puis posée.
    const dropped = flat.indexOf(
      'ALTER TABLE org_graph_corrections DROP CONSTRAINT IF EXISTS org_graph_corrections_field_check',
    )
    const added = flat.findIndex(q => q.includes('ADD CONSTRAINT org_graph_corrections_field_check'))
    expect(dropped).toBeLessThan(added)
  })

  it('porte un workspace_id — deux espaces sont deux concurrents', async () => {
    const create = (await ranQueries()).find(q => q.includes('CREATE TABLE IF NOT EXISTS org_graph_corrections'))!
    expect(create).toContain('workspace_id uuid NOT NULL')
  })

  it('ne pose AUCUNE clé étrangère vers accounts — un nouveau run crée une nouvelle ligne', async () => {
    // Une FK `ON DELETE CASCADE` effacerait l'historique de correction au
    // premier relancement, ce qui est le contraire de ce que la table fait.
    const create = (await ranQueries()).find(q => q.includes('CREATE TABLE IF NOT EXISTS org_graph_corrections'))!
    expect(create).not.toContain('REFERENCES accounts')
  })

  it('indexe les deux lectures qui existent : l’historique et la reprise', async () => {
    const flat = await ranQueries()
    const historique = flat.find(q => q.includes('org_graph_corrections_account_idx'))
    expect(historique).toContain('(workspace_id, account_id, graph_version_after DESC)')
    const reprise = flat.find(q => q.includes('org_graph_corrections_active_idx'))
    // Index PARTIEL : une correction annulée n'est pas rejouée, mais elle reste
    // en base. On archive, on ne supprime pas.
    expect(reprise).toContain('WHERE reverted_at IS NULL')
  })

  it('rend la table à son état d’avant', async () => {
    const { runner, queries } = createRunner()
    await new OrgGraphCorrections1790700530001().down(runner)
    expect(queries.map(normalize)).toContain('DROP TABLE IF EXISTS org_graph_corrections')
  })
})
