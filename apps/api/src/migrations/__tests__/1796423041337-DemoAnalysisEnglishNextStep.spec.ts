import { DemoAnalysisEnglishNextStep1796423041337 } from '../1796423041337-DemoAnalysisEnglishNextStep'

// #3550.2 — la migration ne touche que les salles de démonstration et que le gabarit anglais exact.
describe('DemoAnalysisEnglishNextStep (#3550.2)', () => {
  it('passe le motif et son remplacement français, restreints à workspaces.is_demo', async () => {
    const query = jest.fn().mockResolvedValue(undefined)
    await new DemoAnalysisEnglishNextStep1796423041337().up({ query } as never)
    const [sql, params] = query.mock.calls[0] as [string, string[]]
    expect(sql).toContain('w.is_demo = true')
    const english = 'Target DSI with a régie proposition; qualify the domain-specific panel/gatekeeper before outreach.'
    const pattern = new RegExp(params[0] ?? '')
    expect(pattern.test(english)).toBe(true)
    expect(pattern.test('Target DSI: une phrase française quelconque.')).toBe(false)
    const out = english.replace(pattern, (params[1] ?? '').replace('\\1', '$1').replace('\\2', '$2'))
    expect(out).toBe(
      'Viser DSI avec une proposition « régie » ; qualifier d’abord le panel du domaine et son gardien avant toute approche.',
    )
    expect(out).not.toMatch(/qualify|Target/)
  })
})
