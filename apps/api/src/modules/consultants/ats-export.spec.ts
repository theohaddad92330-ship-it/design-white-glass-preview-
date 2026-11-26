import { splitFullName, toAtsExportRow } from './ats-export'

describe('#2326.8 — une fiche du vivier → une ligne ATS', () => {
  it('sépare prénom/nom sur un nom complet', () => {
    expect(splitFullName('Jean Dupont')).toEqual({ firstName: 'Jean', lastName: 'Dupont' })
    expect(splitFullName('Jean-Baptiste Léon Dupont')).toEqual({ firstName: 'Jean-Baptiste', lastName: 'Léon Dupont' })
  })

  it('un seul mot devient le prénom, jamais un nom de famille inventé', () => {
    expect(splitFullName('Madonna')).toEqual({ firstName: 'Madonna', lastName: null })
  })

  it('`null` reste `null` — jamais une fiche « Nom non renseigné » réécrite comme un nom', () => {
    expect(splitFullName(null)).toEqual({ firstName: null, lastName: null })
    expect(splitFullName('  ')).toEqual({ firstName: null, lastName: null })
  })

  it('rend la disponibilité EFFECTIVE, pas le champ brut périmé', () => {
    const now = new Date('2026-09-27T00:00:00Z')
    const staleCheckedAt = new Date('2026-01-01T00:00:00Z') // > 60 jours
    const row = toAtsExportRow(
      {
        id: 'c1',
        full_name: 'Jean Dupont',
        email: 'jean@acme.fr',
        phone: null,
        title: 'Dev',
        seniority: 'senior',
        availability: 'immediate',
        availability_checked_at: staleCheckedAt,
        available_from: null,
        tjm: 650,
        engagement_kind: 'salarie',
        source: 'manual',
      },
      now,
    )
    expect(row.availability).toBe('a_confirmer')
    expect(row).toMatchObject({ consultantId: 'c1', firstName: 'Jean', lastName: 'Dupont', tjm: 650 })
  })
})
