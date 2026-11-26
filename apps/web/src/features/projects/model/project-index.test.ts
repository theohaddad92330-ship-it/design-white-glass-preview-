import { describe, expect, it } from 'vitest'
import type { ProjectRow } from '@bellum/contracts'
import { asStage, buildProjectIndex, normalizeProjectLabel, projectKey } from './project-index'

function row(overrides: Partial<ProjectRow>): ProjectRow {
  return {
    id: 'op-1',
    account_id: 'acc-1',
    company_name: 'ACME',
    sector: null,
    logo_url: null,
    website: null,
    kind: 'pain',
    label: 'Migration Cloud',
    detail: null,
    offer: null,
    source: 'pain',
    confidence: 'high',
    urgency: null,
    stage: 'detected',
    stage_entered_at: '2026-07-01T00:00:00.000Z',
    owner_id: null,
    expected_close_on: null,
    closed_at: null,
    outcome: null,
    loss_reason: null,
    first_detected_at: '2026-07-21T10:00:00.000Z',
    updated_at: '2026-07-21T10:00:00.000Z',
    ...overrides,
  }
}

describe('project-index', () => {
  it('normalizes labels (case + whitespace) so a need joins its opportunity', () => {
    expect(normalizeProjectLabel('  Migration   CLOUD ')).toBe('migration cloud')
    expect(projectKey('acc-1', 'pain', 'Migration Cloud')).toBe('acc-1|pain|migration cloud')
  })

  it('indexes rows by their join key', () => {
    const index = buildProjectIndex([row({}), row({ id: 'op-2', kind: 'challenge', label: 'ERP' })])
    expect(index.get(projectKey('acc-1', 'pain', 'migration cloud'))?.id).toBe('op-1')
    expect(index.get(projectKey('acc-1', 'challenge', 'erp'))?.id).toBe('op-2')
    expect(index.get(projectKey('acc-1', 'program', 'x'))).toBeUndefined()
  })

  it('restreint une chaîne du wire à une étape connue, `null` sinon', () => {
    expect(asStage('qualified')).toBe('qualified')
    expect(asStage('dormant')).toBe('dormant')
    // L'ancien cycle FR n'existe plus. Une ligne qui le porterait encore
    // n'affiche PAS de pastille plutôt que d'en inventer une.
    expect(asStage('confirme')).toBeNull()
    expect(asStage('bogus')).toBeNull()
    expect(asStage(null)).toBeNull()
  })
})
