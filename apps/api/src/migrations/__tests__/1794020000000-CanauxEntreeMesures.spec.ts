import type { QueryRunner } from 'typeorm'
import { CanauxEntreeMesures1794020000000 } from '../1794020000000-CanauxEntreeMesures'

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

// #2048 / #2049 — lot L19 : canaux d'entrée + unités comparables.
describe('CanauxEntreeMesures1794020000000', () => {
  it('ajoute les quatre facettes des canaux en tableau de texte (#2048)', async () => {
    const { runner, queries } = createRunner()
    await new CanauxEntreeMesures1794020000000().up(runner)
    const sql = normalize(queries.join(' '))

    for (const column of [
      'entry_channels_used',
      'entry_channels_measured',
      'entry_channels_last_starts',
      'entry_channels_time_split',
    ]) {
      expect(sql).toContain(`ADD COLUMN IF NOT EXISTS ${column} text[] NOT NULL DEFAULT '{}'`)
    }
  })

  it('ajoute les unités comptées et la période, la période restant NULLABLE (#2049.13)', async () => {
    const { runner, queries } = createRunner()
    await new CanauxEntreeMesures1794020000000().up(runner)
    const sql = normalize(queries.join(' '))
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS activity_measures_tracked text[] NOT NULL DEFAULT '{}'")
    // ⚠️ Sans période, aucun taux ne se calcule : `NULL` est une question sans
    // réponse, jamais « zéro période ». Une colonne NOT NULL l'aurait effacé.
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS activity_reference_period text;')
    expect(sql).not.toMatch(/activity_reference_period text NOT NULL/)
  })

  it('n’impose AUCUNE contrainte de valeur : le catalogue vit au contrat (GA-11/GA-12)', async () => {
    const { runner, queries } = createRunner()
    await new CanauxEntreeMesures1794020000000().up(runner)
    const sql = normalize(queries.join(' '))
    expect(sql).not.toContain('CHECK')
  })

  it('est rejouable : six énoncés, tous en IF NOT EXISTS', async () => {
    const { runner, queries } = createRunner()
    await new CanauxEntreeMesures1794020000000().up(runner)
    const statements = normalize(queries.join(' '))
      .split(';')
      .map(s => s.trim())
      .filter(Boolean)
    expect(statements.length).toBe(6)
    for (const statement of statements) {
      expect(statement).toContain('IF NOT EXISTS')
    }
  })

  it('ne touche à aucune colonne existante (témoin — ajout seulement)', async () => {
    const { runner, queries } = createRunner()
    await new CanauxEntreeMesures1794020000000().up(runner)
    const sql = normalize(queries.join(' '))
    // Les trois volumes déjà posés restent où ils sont : leur canal les CITE
    // (`EntryChannel.volumeAnswerKey`), il ne les recopie pas (GA-26).
    for (const existing of ['weekly_calls', 'weekly_emails', 'weekly_linkedin', 'go_to_market_channels']) {
      expect(sql).not.toContain(existing)
    }
    expect(sql).not.toContain('DROP COLUMN')
  })

  it('sait redescendre', async () => {
    const { runner, queries } = createRunner()
    await new CanauxEntreeMesures1794020000000().down(runner)
    const sql = normalize(queries.join(' '))
    expect(sql).toContain('DROP COLUMN IF EXISTS entry_channels_used')
    expect(sql).toContain('DROP COLUMN IF EXISTS activity_reference_period')
  })
})
