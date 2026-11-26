import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEMO_COLLEAGUES } from './demo-dataset'
import { DEMO_TEAM_COLLEAGUE_ID } from './demo-team-continuity'
import { buildDemoTeamInboxRows } from './demo-team-inbox'

// #4158 (intégration passe 2) — `DEMO_COLLEAGUES` (L2) est la SEULE source des identifiants de collègues fictifs.
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/g
// Les identifiants que L3 / L4 / L5 avaient posés en attendant l'alignement.
const LEGACY_PREFIXES = ['de000000-4158-', '00000000-0000-4000-8000-0000000d3a']

function demoSources(): { file: string; text: string }[] {
  return readdirSync(__dirname)
    .filter(name => name.endsWith('.ts') && !name.endsWith('.spec.ts'))
    .map(file => ({ file, text: readFileSync(join(__dirname, file), 'utf8') }))
}

describe('#4158 — un seul endroit pour les collègues fictifs', () => {
  it('aucun identifiant de collègue démo n’existe hors de DEMO_COLLEAGUES (demo-dataset.ts)', () => {
    const own = new Set(DEMO_COLLEAGUES.map(colleague => colleague.userId))
    for (const { file, text } of demoSources()) {
      if (file === 'demo-dataset.ts') continue
      const literals = text.match(UUID) ?? []
      for (const literal of literals)
        expect({ file, literal, isColleague: own.has(literal) }).toEqual({ file, literal, isColleague: false })
      for (const prefix of LEGACY_PREFIXES)
        expect({ file, prefix, found: text.includes(prefix) }).toEqual({ file, prefix, found: false })
    }
  })

  it('la preuve sait dire NON : elle lit bien demo-dataset.ts et y trouve les trois ids', () => {
    const dataset = demoSources().find(source => source.file === 'demo-dataset.ts')
    expect(dataset).toBeDefined()
    for (const colleague of DEMO_COLLEAGUES) expect(dataset!.text).toContain(colleague.userId)
  })

  it('la boîte d’équipe (L3) et la continuité (L5) désignent des membres de DEMO_COLLEAGUES', () => {
    const own = new Set(DEMO_COLLEAGUES.map(colleague => colleague.userId))
    expect(own.has(DEMO_TEAM_COLLEAGUE_ID)).toBe(true)
    for (const row of buildDemoTeamInboxRows(new Map())) expect(own.has(row.actorUserId)).toBe(true)
  })

  it('les garde-fous (L4) sont semés APRÈS les collègues (L2) — avant, ils ne trouvaient personne', () => {
    const seed = readFileSync(join(__dirname, 'demo-seed.service.ts'), 'utf8')
    const colleagues = seed.indexOf('await this.seedColleagues(')
    const guardrails = seed.indexOf('await seedTeamGuardrails(')
    expect(colleagues).toBeGreaterThan(-1)
    expect(guardrails).toBeGreaterThan(colleagues)
  })
})
