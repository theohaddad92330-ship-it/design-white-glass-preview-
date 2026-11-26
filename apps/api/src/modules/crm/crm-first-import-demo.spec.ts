import { demoCrmFirstImport } from './crm-first-import-demo'

describe('demoCrmFirstImport — SYNC-B B.6', () => {
  it('en démo : une reprise terminée, chiffrée, sans ligne pour ce qui n’est pas semé', () => {
    const state = demoCrmFirstImport(new Date('2026-10-19T10:00:00Z'))
    expect(state).toMatchObject({ state: 'done', demo: true, reconnectNeeded: false })
    expect(state.objects.map(o => o.object)).toEqual(['accounts', 'contacts', 'deals'])
    expect(state.objects.every(o => o.status === 'done' && (o.count ?? 0) > 0)).toBe(true)
  })

  // #4290.19 — la démo montre aussi la part RECONNUE : le contact à l'écart (modifié des deux côtés) était déjà là.
  it('#4290.19 entreprises et contacts disent créées / reconnues, et leur somme fait le total ; le miroir ne le dit pas', () => {
    const state = demoCrmFirstImport(new Date('2026-10-19T10:00:00Z'))
    const byObject = Object.fromEntries(state.objects.map(o => [o.object, o]))
    for (const object of ['accounts', 'contacts']) {
      const entry = byObject[object]
      expect((entry?.created ?? 0) + (entry?.recognized ?? 0)).toBe(entry?.count)
    }
    expect(byObject['contacts']?.recognized).toBeGreaterThan(0)
    expect(byObject['deals']?.created ?? null).toBeNull()
  })
})
