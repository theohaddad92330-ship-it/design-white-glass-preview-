import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { TalentRow } from '@bellum/contracts'
import { TalentCompletenessScore } from './TalentCompletenessScore'

function row(overrides: Partial<TalentRow> = {}): TalentRow {
  return {
    id: 't1',
    kind: 'consultant',
    fullName: 'Camille Roussel',
    title: null,
    seniority: 'inconnu',
    declaredAvailability: 'inconnu',
    staffing: { availability: 'available', loadPercent: 0, freeFrom: null, assignments: 0 },
    tjm: 640,
    financeVisible: false,
    contractType: 'inconnu',
    engagementKind: 'inconnu',
    zones: [],
    lastMission: null,
    submissions: { open: 0, total: 0 },
    source: null,
    lastContactAt: null,
    archivedAt: null,
    reviewStatus: 'qualified',
    topSkills: [],
    skillCount: 3,
    hasCv: true,
    workMode: null,
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

/**
 * La colonne « Complétude » : le score consultant s'écrit EN CLAIR, jamais en
 * points (décision Louis 23/10/2026) — « Fiche complète » ou « À compléter :
 * tarif, CV », les axes manquants NOMMÉS.
 */
describe('TalentCompletenessScore', () => {
  it('dit « Fiche complète » quand les cinq axes sont remplis — aucun nombre', () => {
    render(<TalentCompletenessScore row={row()} />)
    expect(screen.getByText('Fiche complète')).toBeInTheDocument()
    expect(screen.queryByText(/\/\s?100/)).toBeNull()
  })

  it('nomme les axes manquants en clair quand la fiche est incomplète', () => {
    render(<TalentCompletenessScore row={row({ tjm: null, hasCv: false })} />)
    expect(screen.getByText('À compléter : tarif, CV')).toBeInTheDocument()
    expect(screen.queryByText(/\/\s?100/)).toBeNull()
  })

  it('porte le détail axe par axe en survol, sans points', () => {
    render(<TalentCompletenessScore row={row({ skillCount: 0 })} />)
    const wrapper = screen.getByText('À compléter : compétences').closest('[title]')
    expect(wrapper?.getAttribute('title')).toBe('Manque : compétences')
  })

  it('#4500.4 — « À compléter : … » passe à la ligne : ni shrink-0 ni troncature', () => {
    render(<TalentCompletenessScore row={row({ tjm: null, hasCv: false })} />)
    const text = screen.getByText('À compléter : tarif, CV')
    expect(text.className).not.toContain('shrink-0')
    expect(text.className).toContain('min-w-0')
    expect(text.className).toContain('break-words')
  })

  it('le texte ne tronque pas : la fiche complète reste lisible', () => {
    render(<TalentCompletenessScore row={row()} />)
    expect(screen.getByText('Fiche complète').closest('.truncate')).toBeNull()
  })
})

/**
 * #1780 — LA LISTE DIT LA MÊME CHOSE QUE LA FICHE.
 *
 * L'entête de la fiche a cessé d'annoncer « 20/100 » sur un profil qui attend
 * sa relecture ; **la ligne du vivier, elle, l'annonçait encore** — vu en
 * production le 09/09, juste après le déploiement du correctif. Une règle
 * écrite pour un cas et pas pour son jumeau ne tient pas : les deux surfaces
 * lisent le même objet, elles doivent en dire la même chose.
 */
describe('TalentCompletenessScore — une fiche qui attend sa relecture n’a pas de complétude', () => {
  it('n’annonce PAS de score tant que la lecture du CV n’est pas validée', () => {
    render(<TalentCompletenessScore row={row({ reviewStatus: 'needs_review', fullName: null, skillCount: 0 })} />)
    // Ni le score, ni les axes : quatre zéros décomposés restent quatre zéros faux.
    expect(screen.queryByText(/Fiche complète/)).toBeNull()
    expect(screen.queryByText(/À compléter/)).toBeNull()
  })

  it('sait dire OUI — dès que la fiche est relue, le score revient', () => {
    render(<TalentCompletenessScore row={row({ reviewStatus: 'qualified' })} />)
    expect(screen.getByText('Fiche complète')).toBeInTheDocument()
  })
})
