import type { ProjectRow } from '@bellum/contracts'
import { act, cleanup, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { i18n } from '@/i18n'
import { ProjectsTable } from './ProjectsTable'

/**
 * #4191 R22 (S2/F4) — la colonne « Porteur » restait « — » en démo alors que les affaires ont un porteur :
 * le nom ne se résolvait que par la liste des membres de l'espace. La ligne projet porte maintenant
 * `owner_name` (profil du porteur) ; la liste des membres n'est qu'un repli.
 */
function row(over: Partial<ProjectRow>): ProjectRow {
  return {
    id: 'p1',
    label: 'Socle data',
    stage: 'qualified',
    company_name: 'Cliente SA',
    amount_cents: 1_000_000,
    stage_entered_at: '2026-08-20T00:00:00.000Z',
    updated_at: '2026-08-20T00:00:00.000Z',
    first_detected_at: '2026-08-01T00:00:00.000Z',
    owner_id: '11111111-1111-4111-8111-111111111111',
    source: null,
    has_mission: false,
    access_mode: null,
    ...over,
  } as unknown as ProjectRow
}

describe('ProjectsTable — colonne Porteur', () => {
  beforeEach(async () => {
    cleanup()
    await act(async () => {
      await i18n.changeLanguage('fr')
    })
  })

  it('lit le nom du porteur sur la ligne même quand la liste des membres ne le résout pas', () => {
    render(
      <ProjectsTable projects={[row({ owner_name: 'Maëlle Lorquin' })]} onSelect={() => {}} ownerName={() => null} />,
    )
    expect(screen.getByText('Maëlle Lorquin')).toBeInTheDocument()
  })

  it('sait dire NON : sans porteur, « — » (jamais un identifiant brut)', () => {
    render(
      <ProjectsTable
        projects={[row({ owner_id: null, owner_name: null })]}
        onSelect={() => {}}
        ownerName={() => null}
      />,
    )
    expect(screen.queryByText('Maëlle Lorquin')).toBeNull()
    expect(screen.queryByText(/11111111/)).toBeNull()
  })
})
