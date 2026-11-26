import { describe, expect, it } from 'vitest'
import { pipelineSummary, projectNature, type ProjectNatureInput } from './project.js'

const base: ProjectNatureInput = {
  kind: 'implication',
  stage: 'detected',
  source: null,
  owner_id: null,
  amount_cents: null,
  expected_close_on: null,
  btmmp: null,
  next_action: null,
  has_next_action: null,
  has_mission: false,
  objective: null,
  risks: null,
  scope_label: null,
}

describe('projectNature (#3714)', () => {
  it('une déduction générique sans travail ni source est « generic »', () => {
    expect(projectNature(base)).toBe('generic')
  })

  it.each([
    ['propriétaire', { owner_id: 'u1' }],
    ['montant', { amount_cents: 120000 }],
    ['échéance', { expected_close_on: '2026-12-01' }],
    ['qualification', { btmmp: { budget: '300 k€' } }],
    ['prochaine action', { next_action: { title: 'Appeler', due_on: '2026-10-10' } }],
    ['action (booléen)', { has_next_action: true }],
    ['mission', { has_mission: true }],
    ['objectif (note)', { objective: 'Cadrer le besoin' }],
    ['risques (note)', { risks: 'Budget gelé' }],
    ['périmètre saisi', { scope_label: 'Site de Toulouse' }],
    ['étape avancée par l’équipe', { stage: 'qualified' }],
  ] as const)('une ligne mal intitulée portant %s reste « worked » (jamais reclassée sur son titre)', (_n, patch) => {
    expect(projectNature({ ...base, ...patch })).toBe('worked')
  })

  it('un fait documenté (source nommée) n’est pas une généralité', () => {
    expect(projectNature({ ...base, source: 'Rapport annuel 2025' })).toBe('documented')
  })

  it('un programme nommé n’est pas éliminé par son seul titre', () => {
    expect(projectNature({ ...base, kind: 'program' })).toBe('documented')
  })

  it('les autres natures (signal, pain, challenge, imported, manual) ne sont jamais génériques', () => {
    for (const kind of ['signal', 'pain', 'challenge', 'imported', 'manual']) {
      expect(projectNature({ ...base, kind })).toBe('documented')
    }
  })
})

describe('pipelineSummary — généralités hors des compteurs (#3714)', () => {
  it('une déduction générique sort de `intake`, une affaire travaillée mal intitulée y reste', () => {
    const summary = pipelineSummary(
      [
        { stage: 'detected', kind: 'implication', source: null },
        { stage: 'detected', kind: 'implication', source: null, owner_id: 'u1', amount_cents: 50000 },
        { stage: 'detected', kind: 'program', source: null },
        { stage: 'detected', kind: 'signal', source: null },
      ],
      {},
      'fr',
    )
    expect(summary.generic_deductions).toBe(1)
    expect(summary.intake).toBe(2)
    expect(summary.signals).toBe(1)
    expect(summary.total_amount_cents).toBe(0)
  })
})
