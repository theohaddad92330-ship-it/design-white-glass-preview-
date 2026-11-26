import type { QueryRunner } from 'typeorm'
import { LauraUnroutedIntents1792800190000 } from '../1792800190000-LauraUnroutedIntents'

/** Capture chaque instruction SQL de la migration (aucune base réelle). */
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

async function upQueries(): Promise<string[]> {
  const { runner, queries } = createRunner()
  await new LauraUnroutedIntents1792800190000().up(runner)
  return queries.map(normalize)
}

/**
 * #1949.23 — décision Louis 13/09 batch 12 : la table de la trace anonyme des
 * demandes que Laura n'a pas su router. Ce qui compte n'est pas qu'elle existe,
 * c'est ce qu'elle N'A PAS : une colonne d'identité.
 */
describe('LauraUnroutedIntents1792800190000 — #1949.23', () => {
  it('crée laura_unrouted_intents avec la date, la surface, la langue, la catégorie et le texte masqué', async () => {
    const create = (await upQueries()).find(q => q.includes('CREATE TABLE IF NOT EXISTS laura_unrouted_intents'))
    expect(create).toBeDefined()
    expect(create).toContain('occurred_on date NOT NULL')
    expect(create).toContain('surface text NOT NULL')
    expect(create).toContain('language text')
    expect(create).toContain('category text NOT NULL')
    expect(create).toContain('text_masked text NOT NULL')
    expect(create).toContain('text_normalized text NOT NULL')
    expect(create).toContain('workspace_day_hash text NOT NULL')
  })

  it('AUCUNE colonne d’identité, et aucune heure précise — seulement le jour', async () => {
    const create = (await upQueries()).find(q => q.includes('CREATE TABLE IF NOT EXISTS laura_unrouted_intents')) ?? ''
    expect(create).not.toMatch(/\buser_id\b/)
    expect(create).not.toMatch(/\bworkspace_id\b/)
    // Une heure à la seconde se recoupe avec `chat_messages.created_at` : le
    // jour suffit à la purge et au regroupement.
    expect(create).not.toContain('timestamptz')
  })

  it('pose les contraintes AVANT tout écrivain (GA-11 / GA-12) : longueur, catégorie, langue', async () => {
    const all = (await upQueries()).join('\n')
    expect(all).toContain('CHECK (char_length(text_masked) <= 300)')
    expect(all).toContain("CHECK (category IN ('hors_perimetre', 'capacite_absente', 'intention_incomprise'))")
    expect(all).toContain("CHECK (language IS NULL OR language IN ('fr', 'en'))")
  })

  it('indexe la purge (le jour) et le regroupement (le texte normalisé)', async () => {
    const all = (await upQueries()).join('\n')
    expect(all).toContain(
      'CREATE INDEX IF NOT EXISTS laura_unrouted_intents_occurred_on_idx ON laura_unrouted_intents (occurred_on)',
    )
    expect(all).toContain(
      'CREATE INDEX IF NOT EXISTS laura_unrouted_intents_text_normalized_idx ON laura_unrouted_intents (text_normalized)',
    )
  })

  it('rejouable — chaque instruction tolère d’avoir déjà tourné', async () => {
    for (const query of await upQueries()) {
      expect(query.includes('IF NOT EXISTS')).toBe(true)
    }
  })

  it('down() ne fait tomber que ce que up() a créé', async () => {
    const { runner, queries } = createRunner()
    await new LauraUnroutedIntents1792800190000().down(runner)
    expect(queries.map(normalize)).toEqual([
      'DROP INDEX IF EXISTS laura_unrouted_intents_text_normalized_idx',
      'DROP INDEX IF EXISTS laura_unrouted_intents_occurred_on_idx',
      'DROP TABLE IF EXISTS laura_unrouted_intents',
    ])
  })
})
