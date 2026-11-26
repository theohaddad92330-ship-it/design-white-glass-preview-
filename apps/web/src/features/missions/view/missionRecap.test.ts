import { describe, expect, it } from 'vitest'
import { missionRecapRows } from './missionRecap'

const t = ((key: string) => key) as never
const mission = {
  id: 'm1',
  label: 'Refonte SI',
  accountName: 'Société Générale',
  status: 'active',
  started_on: '2026-09-01',
  ends_on: null,
  assignees: [{ id: 'c1', fullName: 'Hakim Barreau', photoUrl: null, loadPercent: 100 }],
} as never

describe('missionRecapRows — Théo C missions-dossier.N6', () => {
  it('liste ce que le dossier dit : mission, compte, statut, période, consultants', () => {
    const rows = missionRecapRows(mission, t)
    const flat = rows.map(row => row.join('|'))
    expect(flat).toContain('recap.mission|Refonte SI')
    expect(flat).toContain('recap.account|Société Générale')
    expect(flat).toContain('recap.consultants|Hakim Barreau')
  })

  it('une fin inconnue se dit « sans fin connue », jamais une date de remplissage', () => {
    const rows = missionRecapRows(mission, t)
    expect(rows.find(row => row[0] === 'recap.endsOn')?.[1]).toBe('recap.noEndDate')
  })
})
