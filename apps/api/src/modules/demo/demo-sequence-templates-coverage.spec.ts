import { DEMO_INTENTIONALLY_EMPTY, DEMO_SEEDED_TABLES } from './demo-coverage'
import { demoCompletenessProbes } from './demo-reset.service'
import { DEMO_SEQUENCE_TEMPLATES } from './demo-sequence-templates'
import { DemoSeedService } from './demo-seed.service'

// #3756.5 — parité démo : la bibliothèque de modèles est semée (2 campagnes, 3 étapes).
describe('bibliothèque de modèles de séquence en démo (#3756)', () => {
  it('deux campagnes de trois étapes, délais croissants', () => {
    expect(DEMO_SEQUENCE_TEMPLATES).toHaveLength(2)
    for (const t of DEMO_SEQUENCE_TEMPLATES) {
      expect(t.steps).toHaveLength(3)
      const delays = t.steps.map(s => s.delay_days)
      expect(delays).toEqual([...delays].sort((a, b) => a - b))
    }
  })

  it('les deux tables sont déclarées SEEDÉES et sondées par la complétude', () => {
    for (const table of ['sequence_templates', 'sequence_template_steps']) {
      expect(DEMO_SEEDED_TABLES as readonly string[]).toContain(table)
      expect(Object.keys(DEMO_INTENTIONALLY_EMPTY)).not.toContain(table)
      expect(demoCompletenessProbes().some(p => p.table === table)).toBe(true)
    }
  })

  it('le semis insère chaque modèle puis ses étapes, rejouable', async () => {
    const query = jest.fn((sql: string) => Promise.resolve(sql.startsWith('SELECT') ? [] : [{ id: 'tpl-x' }]))
    const service = Object.create(DemoSeedService.prototype) as {
      accounts: unknown
      seedSequenceTemplates: (w: string) => Promise<void>
    }
    service.accounts = { manager: { query } }
    await service.seedSequenceTemplates('ws-demo')
    const sqls = query.mock.calls.map(call => call[0])
    expect(sqls.filter(s => /INSERT INTO sequence_templates/.test(s))).toHaveLength(2)
    // 6 étapes de mail + 3 scripts d'appel (#4426.7).
    expect(sqls.filter(s => /INSERT INTO sequence_template_steps/.test(s))).toHaveLength(9)
  })
})
