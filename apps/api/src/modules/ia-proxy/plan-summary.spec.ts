import { readPlanEntryRoute } from '@bellum/contracts'
import { PLAN_ENTRY_ROUTE_PREFIX, planSummaryOf } from './plan-summary'

// #3423.8 — la voie d'entrée que Laura reçoit est celle de l'onglet Plan.
describe('planSummaryOf', () => {
  const raw = {
    strategy: { objectif: 'Entrer chez X' },
    angles: [
      { title: 'A', strategy: 's', entry_contact_persona: 'DSI' },
      { title: 'B', strategy: 's', is_recommended: true, entry_contact_persona: 'Directeur Data' },
    ],
  }

  it('ajoute la voie d’entrée de l’angle recommandé, la même que l’écran', () => {
    const summary = planSummaryOf(raw) ?? ''
    expect(summary).toContain('Entrer chez X')
    expect(summary).toContain(`${PLAN_ENTRY_ROUTE_PREFIX}${readPlanEntryRoute(raw)}`)
    expect(summary).toContain('Directeur Data')
    expect(summary).not.toContain(`${PLAN_ENTRY_ROUTE_PREFIX}DSI`)
  })

  it('sans voie renseignée, rien n’est ajouté ; sans plan, null', () => {
    expect(planSummaryOf({ strategy: 'S' })).toBe('"S"')
    expect(planSummaryOf(null)).toBeNull()
    expect(planSummaryOf({ angles: [{ title: 'A', strategy: 's' }] })).toBeNull()
  })

  // LOT (15/10) DATA-B.7 — le digest tronqué reste du JSON valide, coupé par section.
  describe('plafond de 2 000 caractères', () => {
    const big = (n: number) => 'x'.repeat(n)

    it('sous le plafond, le digest est identique à avant', () => {
      expect(planSummaryOf({ strategy: { a: 1, b: 'deux' } })).toBe('{"a":1,"b":"deux"}')
    })

    it('un plan trop long est tronqué par SECTION : JSON valide, sections omises nommées', () => {
      const summary =
        planSummaryOf({ strategy: { objectif: 'Entrer', etapes: big(1200), risques: big(1200), fin: 'ok' } }) ?? ''
      expect(summary.length).toBeLessThanOrEqual(2000)
      const parsed = JSON.parse(summary) as Record<string, unknown>
      expect(parsed['objectif']).toBe('Entrer')
      expect(parsed['etapes']).toBe(big(1200))
      expect(parsed['risques']).toBeUndefined()
      expect(parsed['_sections_omises']).toEqual(expect.arrayContaining(['risques']))
    })

    it('une liste trop longue garde des éléments ENTIERS', () => {
      const items = Array.from({ length: 40 }, (_, i) => ({ step: i, text: big(100) }))
      const parsed = JSON.parse(planSummaryOf({ plan: items }) ?? '') as { step: number }[]
      expect(parsed.length).toBeGreaterThan(5)
      expect(parsed.length).toBeLessThan(40)
      expect(parsed[0]).toEqual({ step: 0, text: big(100) })
    })

    it('un texte trop long est coupé à un mot, en JSON valide, avec points de suspension', () => {
      const text = Array.from({ length: 600 }, () => 'mot').join(' ')
      const parsed = JSON.parse(planSummaryOf({ strategy: text }) ?? '') as string
      expect(parsed.endsWith('…')).toBe(true)
      expect(parsed.length).toBeLessThanOrEqual(2000)
    })

    it('la voie d’entrée est ajoutée après le digest tronqué', () => {
      const summary =
        planSummaryOf({
          strategy: { a: big(2500) },
          angles: [{ title: 'B', strategy: 's', is_recommended: true, entry_contact_persona: 'DSI' }],
        }) ?? ''
      expect(summary).toContain(PLAN_ENTRY_ROUTE_PREFIX)
    })
  })
})
