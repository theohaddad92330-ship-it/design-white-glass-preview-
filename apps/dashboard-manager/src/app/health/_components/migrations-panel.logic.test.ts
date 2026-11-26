import { describe, expect, it } from 'vitest'
import type { AdminMigrationsReport } from '@/lib/admin'
import { statutMigrations } from './migrations-panel.logic'

function rapport(overrides: Partial<AdminMigrationsReport> = {}): AdminMigrationsReport {
  return { total: 2, applied: [{ name: 'A', appliedAt: '2026-09-01T00:00:00.000Z' }], pending: ['B'], ...overrides }
}

describe('statutMigrations', () => {
  it('est « à jour » quand rien n’attend', () => {
    const statut = statutMigrations(rapport({ pending: [] }))
    expect(statut.aJour).toBe(true)
    expect(statut.libelle).toBe('à jour')
  })

  it('dit « N en attente » dès qu’une migration connue du build n’a pas tourné', () => {
    const statut = statutMigrations(rapport({ pending: ['B', 'C'] }))
    expect(statut.aJour).toBe(false)
    expect(statut.libelle).toBe('2 en attente')
  })

  it('compte séparément les appliquées et les en-attente, sans jamais les fondre', () => {
    const statut = statutMigrations(
      rapport({ total: 5, applied: [{ name: 'A', appliedAt: null }], pending: ['B', 'C'] }),
    )
    expect(statut.appliedCount).toBe(1)
    expect(statut.pendingCount).toBe(2)
    // Le total du build peut dépasser appliquées + en attente si `_migrations`
    // porte une ligne pour un nom retiré du code depuis (jamais un défaut).
    expect(statut.total).toBe(5)
  })
})
