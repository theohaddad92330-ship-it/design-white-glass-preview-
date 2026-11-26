import type { QueryRunner } from 'typeorm'
import { ConsultantPhotoUrl1790973000001 } from '../1790973000001-ConsultantPhotoUrl'

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

describe('ConsultantPhotoUrl1790973000001', () => {
  it('ajoute une colonne texte nullable, sans défaut — jamais de photo devinée', async () => {
    const { runner, queries } = createRunner()
    await new ConsultantPhotoUrl1790973000001().up(runner)
    const flat = queries.map(normalize)
    expect(flat).toContain('ALTER TABLE consultants ADD COLUMN IF NOT EXISTS photo_url text')
    // Aucun DEFAULT nulle part : une valeur par défaut serait une photo inventée.
    expect(flat.some(q => q.includes('DEFAULT'))).toBe(false)
  })

  it('est idempotente (IF NOT EXISTS) — une seconde exécution ne casse rien', async () => {
    const { runner } = createRunner()
    await expect(new ConsultantPhotoUrl1790973000001().up(runner)).resolves.not.toThrow()
  })

  it('down() retire uniquement la colonne ajoutée', async () => {
    const { runner, queries } = createRunner()
    await new ConsultantPhotoUrl1790973000001().down(runner)
    expect(queries.map(normalize)).toEqual(['ALTER TABLE consultants DROP COLUMN IF EXISTS photo_url'])
  })
})
