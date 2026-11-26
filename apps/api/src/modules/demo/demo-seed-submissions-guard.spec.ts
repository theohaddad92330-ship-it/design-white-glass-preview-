import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * #2873 (recette prod 29/09) — « reset failed — duplicate key … "submissions_unique" ».
 * Un `NOT EXISTS` seul ne tient pas sous deux semis concurrents : CHAQUE écriture de
 * `submissions` du semis doit porter son `ON CONFLICT … DO NOTHING`.
 */
describe('DemoSeedService — chaque INSERT INTO submissions est idempotent', () => {
  const source = readFileSync(join(__dirname, 'demo-seed.service.ts'), 'utf8')
  const inserts = source.split('INSERT INTO submissions').slice(1)

  it('en trouve au moins trois (positionnement direct, shortlist, refus)', () => {
    expect(inserts.length).toBeGreaterThanOrEqual(3)
  })

  it.each(inserts.map((chunk, index) => [index, chunk.split('`')[0]] as const))(
    'l’INSERT n°%i porte ON CONFLICT ... DO NOTHING',
    (_index, statement) => {
      expect(statement).toMatch(/ON CONFLICT \(project_id, consultant_id, coalesce\(need_id/)
      expect(statement).toMatch(/DO NOTHING/)
    },
  )
})
