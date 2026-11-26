import { describe, expect, it } from 'vitest'
import {
  KNOWN_ACCOUNT_ANALYSIS_AUDIT,
  KNOWN_ACCOUNT_ANALYSIS_POINTS,
  KNOWN_ACCOUNT_ANALYSIS_STATUSES,
} from './known-account-analysis-audit.js'

describe('#2929 — audit des points sans appelant réel (LAU-FINAL-033, #2292)', () => {
  it('audite les neuf points restants, aucun oublié', () => {
    expect(Object.keys(KNOWN_ACCOUNT_ANALYSIS_AUDIT).sort()).toEqual([...KNOWN_ACCOUNT_ANALYSIS_POINTS].sort())
  })

  it('chaque entrée porte un statut valide, une note et un énoncé non vides', () => {
    for (const point of KNOWN_ACCOUNT_ANALYSIS_POINTS) {
      const entry = KNOWN_ACCOUNT_ANALYSIS_AUDIT[point]
      expect(KNOWN_ACCOUNT_ANALYSIS_STATUSES).toContain(entry.status)
      expect(entry.note.length).toBeGreaterThan(0)
      expect(entry.claim.length).toBeGreaterThan(0)
    }
  })

  it('un statut `present` porte TOUJOURS une preuve — jamais affirmé sans fichier', () => {
    for (const point of KNOWN_ACCOUNT_ANALYSIS_POINTS) {
      const entry = KNOWN_ACCOUNT_ANALYSIS_AUDIT[point]
      if (entry.status === 'present') expect(entry.nearestNeighborEvidence).not.toBeNull()
    }
  })
})
