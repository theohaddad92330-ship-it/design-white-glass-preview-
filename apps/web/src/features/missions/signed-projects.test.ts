import { describe, expect, it } from 'vitest'
import type { ProjectReadRow } from '@bellum/contracts'
import { signedProjectsForPlanning } from './signed-projects'

const row = (over: Record<string, unknown>) =>
  ({
    id: 'p',
    label: 'Projet',
    company_name: 'ACME',
    stage: 'won',
    closed_at: null,
    ...over,
  }) as unknown as ProjectReadRow

describe('#4291.8 — les projets signés suivis en planification', () => {
  it('ne garde que les projets signés — « Signés · 4 » sur /projects = 4 lignes ici', () => {
    const out = signedProjectsForPlanning([
      row({ id: 'a' }),
      row({ id: 'b' }),
      row({ id: 'c', stage: 'negotiation' }),
      row({ id: 'd', stage: 'lost' }),
    ])
    expect(out.map(entry => entry.id)).toEqual(['a', 'b'])
  })

  it('la date de signature absente reste absente — jamais inventée', () => {
    const [entry] = signedProjectsForPlanning([row({ closed_at: null })])
    expect(entry?.signedOn).toBeNull()
  })

  it('le plus récemment signé d’abord, un projet sans date en dernier', () => {
    const out = signedProjectsForPlanning([
      row({ id: 'old', closed_at: '2026-01-10T00:00:00.000Z' }),
      row({ id: 'none' }),
      row({ id: 'new', closed_at: '2026-09-10T00:00:00.000Z' }),
    ])
    expect(out.map(entry => entry.id)).toEqual(['new', 'old', 'none'])
  })
})
