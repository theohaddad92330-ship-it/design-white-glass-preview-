import type { OpenNeedRow } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { needsTracker } from './needs-tracker'

// RV4-E-FIX 4295.13 (#4016.8) — le traceur du pipe : CA potentiel JOURNALIER et dernier TJM connu.
const need = (over: Partial<OpenNeedRow>): OpenNeedRow =>
  ({
    id: 'n',
    title: 'Dev Java',
    headcount: 1,
    target_tjm_cents: null,
    status_changed_at: null,
    ...over,
  }) as OpenNeedRow

describe('needsTracker (#4016.8)', () => {
  it('somme TJM × effectif des besoins qui ont un tarif, et compte les autres À PART', () => {
    const tracker = needsTracker([
      need({ id: 'a', target_tjm_cents: 60_000, headcount: 2 }),
      need({ id: 'b', target_tjm_cents: 55_000 }),
      need({ id: 'c' }),
    ])
    expect(tracker.potentialDailyCents).toBe(175_000)
    expect(tracker.withoutRate).toBe(1)
  })

  it('le dernier TJM connu est celui du besoin au mouvement le plus récent, avec sa date', () => {
    const tracker = needsTracker([
      need({ id: 'a', target_tjm_cents: 60_000, status_changed_at: '2026-09-01T00:00:00.000Z', title: 'Ancien' }),
      need({ id: 'b', target_tjm_cents: 70_000, status_changed_at: '2026-10-10T00:00:00.000Z', title: 'Récent' }),
      need({ id: 'c', target_tjm_cents: null, status_changed_at: '2026-10-19T00:00:00.000Z', title: 'Sans tarif' }),
    ])
    expect(tracker.lastTjm).toEqual({ cents: 70_000, title: 'Récent', at: '2026-10-10T00:00:00.000Z' })
  })

  it('sait dire NON : aucun tarif ⇒ ni CA potentiel ni TJM (null), jamais 0', () => {
    const tracker = needsTracker([need({ id: 'a' }), need({ id: 'b' })])
    expect(tracker.potentialDailyCents).toBeNull()
    expect(tracker.lastTjm).toBeNull()
    expect(tracker.withoutRate).toBe(2)
  })

  it('un tarif sans date de mouvement reste lisible, sans date inventée', () => {
    const tracker = needsTracker([need({ id: 'a', target_tjm_cents: 50_000 })])
    expect(tracker.lastTjm).toEqual({ cents: 50_000, title: 'Dev Java', at: null })
  })
})
