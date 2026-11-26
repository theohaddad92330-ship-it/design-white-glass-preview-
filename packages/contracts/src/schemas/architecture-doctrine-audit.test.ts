import { describe, expect, it } from 'vitest'
import {
  ARCHITECTURE_DOCTRINE_AUDIT,
  ARCHITECTURE_DOCTRINE_POINTS,
  ARCHITECTURE_DOCTRINE_STATUSES,
  PAGE_OPEN_REASONS,
} from './architecture-doctrine-audit.js'

describe('#2924 — audit de doctrine d’architecture', () => {
  it('audite les neuf points, aucun oublié', () => {
    expect(Object.keys(ARCHITECTURE_DOCTRINE_AUDIT).sort()).toEqual([...ARCHITECTURE_DOCTRINE_POINTS].sort())
  })

  it('chaque entrée porte un statut valide et une note non vide', () => {
    for (const point of ARCHITECTURE_DOCTRINE_POINTS) {
      const entry = ARCHITECTURE_DOCTRINE_AUDIT[point]
      expect(ARCHITECTURE_DOCTRINE_STATUSES).toContain(entry.status)
      expect(entry.note.length).toBeGreaterThan(0)
      expect(entry.claim.length).toBeGreaterThan(0)
    }
  })

  it('un statut `present` porte TOUJOURS une preuve — jamais affirmé sans fichier', () => {
    for (const point of ARCHITECTURE_DOCTRINE_POINTS) {
      const entry = ARCHITECTURE_DOCTRINE_AUDIT[point]
      if (entry.status === 'present') expect(entry.evidence).not.toBeNull()
    }
  })

  it('nomme les sept raisons d’ouverture d’une page spécialisée (#2143.6)', () => {
    expect(PAGE_OPEN_REASONS).toEqual(['see', 'compare', 'correct', 'filter', 'validate', 'execute', 'track'])
  })
})
