import type { ProjectRow } from '@bellum/contracts'
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { ProjectColumnsPicker } from './ProjectColumnsPicker'
import { ProjectsTable } from './ProjectsTable'

// #4337.1 — table Affaires coupée : nom collant, barre toujours visible, colonnes secondaires derrière « Colonnes ».
const row = {
  id: 'p1',
  label: 'Socle data',
  stage: 'qualified',
  company_name: 'Cliente SA',
  amount_cents: 1_000_000,
  stage_entered_at: '2026-08-20T00:00:00.000Z',
  updated_at: '2026-08-20T00:00:00.000Z',
  first_detected_at: '2026-08-01T00:00:00.000Z',
  owner_id: null,
  source: 'manual',
  has_mission: false,
  access_mode: null,
} as unknown as ProjectRow

const renderTable = (columns?: Parameters<typeof ProjectsTable>[0]['columns']) =>
  render(<ProjectsTable projects={[row]} onSelect={() => {}} ownerName={() => null} columns={columns} />)

describe('ProjectsTable — colonnes (#4337.1)', () => {
  beforeEach(async () => {
    cleanup()
    await act(async () => {
      await i18n.changeLanguage('fr')
    })
  })

  it("la colonne du nom de l'affaire est collante à gauche (entête ET cellules)", () => {
    renderTable()
    const head = screen.getByRole('columnheader', { name: 'Projet' })
    const cell = screen.getAllByRole('cell')[0] as HTMLElement
    for (const el of [head, cell]) {
      expect(el.className).toMatch(/\bsticky\b/)
      expect(el.className).toMatch(/\bleft-0\b/)
      // un fond OPAQUE, sinon les colonnes défilent sous le texte
      expect(el.className).toMatch(/\bbg-card\b/)
    }
  })

  it('la zone qui défile affiche toujours sa barre horizontale', () => {
    const { container } = renderTable()
    const viewport = container.querySelector('table')?.parentElement as HTMLElement
    expect(viewport.className).toMatch(/overflow-x-scroll/)
  })

  it('sans choix, les neuf colonnes sont là', () => {
    renderTable()
    expect(screen.getAllByRole('columnheader')).toHaveLength(9)
  })

  it("ne rend que les colonnes choisies ; le nom de l'affaire reste toujours", () => {
    renderTable(['stage', 'amount'])
    expect(screen.getAllByRole('columnheader').map(h => h.textContent)).toEqual(['Projet', 'Étape', 'Montant'])
    expect(screen.getAllByRole('cell')).toHaveLength(3)
  })
})

describe('ProjectColumnsPicker', () => {
  beforeEach(async () => {
    cleanup()
    await act(async () => {
      await i18n.changeLanguage('fr')
    })
  })

  it('propose les huit colonnes choisissables, coche les visibles, et cocher appelle onToggle', async () => {
    const onToggle = vi.fn()
    render(<ProjectColumnsPicker visible={['stage']} onToggle={onToggle} onReset={() => {}} />)
    const trigger = screen.getByRole('button', { name: 'Colonnes' })
    await userEvent.click(trigger)
    const items = await screen.findAllByRole('menuitemcheckbox')
    expect(items).toHaveLength(8)
    expect(screen.getByRole('menuitemcheckbox', { name: 'Étape' })).toHaveAttribute('aria-checked', 'true')
    await userEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Âge' }))
    expect(onToggle).toHaveBeenCalledWith('age', true)
  })
})
