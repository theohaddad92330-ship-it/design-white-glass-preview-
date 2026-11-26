import { describe, expect, it } from 'vitest'
import { settleAccessEvidence } from './settleAccessEvidence'

describe('settleAccessEvidence — stored barrier phrases read right (#3544)', () => {
  it('agrees « an(s) » with the number', () => {
    expect(settleAccessEvidence('créée il y a 126 an(s) — le temps')).toBe('créée il y a 126 ans — le temps')
    expect(settleAccessEvidence('créée il y a 1 an(s) — trop récente')).toBe('créée il y a 1 an — trop récente')
  })
  it('groups thousands before « établissements »', () => {
    expect(settleAccessEvidence('2320 établissements — référencements')).toBe('2 320 établissements — référencements')
  })
  it('leaves an already settled phrase and small counts alone', () => {
    expect(settleAccessEvidence('2 320 établissements — x')).toBe('2 320 établissements — x')
    expect(settleAccessEvidence('12 établissements — x')).toBe('12 établissements — x')
    expect(settleAccessEvidence('3 établissement(s) — x')).toBe('3 établissements — x')
  })
})
