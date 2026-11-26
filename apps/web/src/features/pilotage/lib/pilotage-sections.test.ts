import { describe, expect, it } from 'vitest'
import {
  PILOTAGE_SECTIONS,
  capProgress,
  decisionStageOf,
  decisionStageCounts,
  orderPilotageSections,
  pipeMonthWindows,
} from './pilotage-sections'

// Théo D pilotage.A0 — une page, quatre sections ancrées.
describe('PILOTAGE_SECTIONS', () => {
  it('garde les quatre sections de Théo dans l’ordre de la page', () => {
    expect(PILOTAGE_SECTIONS.map(section => section.id)).toEqual(['cockpit', 'pipe', 'staffing', 'finance'])
  })
})

// #4270.2 — en forfait / conseil, Staffing passe en dernier ; rien ne disparaît (c76).
describe('orderPilotageSections', () => {
  it('sans profil : l’ordre de la page', () => {
    expect(orderPilotageSections(null).map(section => section.id)).toEqual(['cockpit', 'pipe', 'staffing', 'finance'])
  })
  it('en forfait : Staffing passe en DERNIER, et aucune section ne disparaît', () => {
    const ids = orderPilotageSections('forfait_conseil').map(section => section.id)
    expect(ids.at(-1)).toBe('staffing')
    expect([...ids].sort()).toEqual(['cockpit', 'finance', 'pipe', 'staffing'])
  })
})

// Théo D pilotage.R6 — la correspondance écrite entre nos étapes et celles de Théo.
describe('decisionStageOf', () => {
  it.each([
    ['detected', 'to_qualify'],
    ['potential', 'to_qualify'],
    ['qualified', 'framing'],
    ['confirmed', 'framing'],
    ['profiles_submitted', 'profile_submitted'],
    ['negotiation', 'proposal'],
  ])('%s → %s', (stage, expected) => {
    expect(decisionStageOf(stage)).toBe(expected)
  })

  it('ne range ni une affaire gagnée, ni perdue, ni en sommeil, ni une étape inconnue', () => {
    for (const stage of ['won', 'lost', 'dormant', 'autre']) expect(decisionStageOf(stage)).toBeNull()
  })
})

describe('decisionStageCounts', () => {
  it('compte chaque étape ouverte et garde les étapes vides à 0 (un fait, pas une absence)', () => {
    const counts = decisionStageCounts(['detected', 'potential', 'negotiation', 'won', 'lost'])
    expect(counts).toEqual({ to_qualify: 2, framing: 0, profile_submitted: 0, proposal: 1 })
  })
})

// Théo D pilotage.R2/N2 — l'anneau du cap.
describe('capProgress', () => {
  it('donne le pourcentage signé et le reste à signer', () => {
    expect(capProgress(150_000, 71_000)).toEqual({ percent: 47, remaining: 79_000 })
  })
  it('plafonne l’anneau à 100 % et le reste à 0 quand le cap est dépassé', () => {
    expect(capProgress(100_000, 130_000)).toEqual({ percent: 100, remaining: 0 })
  })
  it('ne devine rien sans cible ou sans réalisé : null, jamais 0', () => {
    expect(capProgress(null, 10)).toBeNull()
    expect(capProgress(0, 10)).toBeNull()
    expect(capProgress(100, null)).toBeNull()
  })
})

// Théo D pilotage.N1 — « Évolution du pipe » : une photo par mois, reconstruite par le waterfall existant.
describe('pipeMonthWindows', () => {
  it('trois mois finissant au mois en cours : le dernier s’arrête à maintenant, les autres à leur dernier jour', () => {
    const windows = pipeMonthWindows(new Date('2026-10-14T10:00:00.000Z'), 3)
    expect(windows).toEqual([
      { month: '2026-08', from: '2026-08-01', to: '2026-08-31' },
      { month: '2026-09', from: '2026-09-01', to: '2026-09-30' },
      { month: '2026-10', from: '2026-10-01', to: '2026-10-14' },
    ])
  })
  it('traverse le changement d’année', () => {
    const windows = pipeMonthWindows(new Date('2026-01-05T10:00:00.000Z'), 3)
    expect(windows.map(window => window.month)).toEqual(['2025-11', '2025-12', '2026-01'])
    expect(windows[1]).toEqual({ month: '2025-12', from: '2025-12-01', to: '2025-12-31' })
  })
})
