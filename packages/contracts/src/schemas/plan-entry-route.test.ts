import { describe, expect, it } from 'vitest'
import { readPlanEntryRoute } from './plan-entry-route.js'

describe('readPlanEntryRoute (#3423.8)', () => {
  it("lit la voie d'entrée de l'angle recommandé, pas du premier", () => {
    const raw = {
      angles: [
        { title: 'A', strategy: 's', entry_contact_persona: 'DSI' },
        { title: 'B', strategy: 's', is_recommended: true, entry_contact_persona: 'Directeur Data', entry_point: 'x' },
      ],
    }
    expect(readPlanEntryRoute(raw)).toBe('Directeur Data')
  })

  it('un angle saisi passe avant un angle généré, et `entry_point` sert de repli', () => {
    const raw = {
      user_attack_angles: [{ title: 'Mien', entry_point: 'Achats IT' }],
      angles: [{ title: 'G', strategy: 's', entry_contact_persona: 'DSI' }],
    }
    expect(readPlanEntryRoute(raw)).toBe('Achats IT')
  })

  it('sans angle ou sans voie : null, jamais une voie devinée', () => {
    expect(readPlanEntryRoute(null)).toBeNull()
    expect(readPlanEntryRoute({})).toBeNull()
    expect(readPlanEntryRoute({ angles: [{ title: 'A', strategy: 's' }] })).toBeNull()
    expect(readPlanEntryRoute({ angles: [{ entry_point: 'orphelin' }] })).toBeNull()
  })
})
