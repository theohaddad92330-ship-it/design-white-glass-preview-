import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { VivierExportCard } from './VivierExportCard'

const allowed = vi.hoisted(() => ({ value: true }))

// Même discipline que `VivierIoMenus.test.tsx` : les options portent leurs
// propres hooks, ce qu'on vérifie ici c'est que l'export a bien son écran
// de Réglages (#3950), pas chaque dialogue.
vi.mock('@/features/consultants/view/AtsExportButton', () => ({
  AtsExportButton: () => <button type="button">opt-ats</button>,
}))
vi.mock('@/features/consultants/view/BulkExportButton', () => ({
  BulkExportButton: () => <button type="button">opt-bulk</button>,
}))
vi.mock('@/lib/data-exit', () => ({ useDataExit: () => ({ allowed: allowed.value, grant: null }) }))

afterEach(() => {
  cleanup()
  allowed.value = true
})

/**
 * #3950 (retour bêta Louis 08/10/2026) — l'export du vivier QUITTE
 * /consultants (puis, #4532, la page de Réglages dédiée) : cette carte le porte, sans option perdue.
 */
describe('VivierExportCard — Mes données › Exports › Exporter le vivier', () => {
  it('porte le bouton « Exporter » qui ouvre les DEUX options', async () => {
    render(<VivierExportCard />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Exporter' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('opt-ats')).toBeInTheDocument()
    expect(within(dialog).getByText('opt-bulk')).toBeInTheDocument()
  })

  it('REFUS — masquée entièrement quand la sortie de données n’est pas permise à l’espace', () => {
    allowed.value = false
    render(<VivierExportCard />)
    expect(screen.queryByTestId('vivier-export-block')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Exporter' })).not.toBeInTheDocument()
  })

  it('UN bloc (h2) qui porte « Exporter » — les deux options ne se lisent QUE dans la fenêtre (#4605.3, GA-26)', () => {
    render(<VivierExportCard />)
    const block = screen.getByTestId('vivier-export-block')
    expect(within(block).getByRole('heading', { level: 2 })).toBeInTheDocument()
    expect(within(block).queryAllByRole('heading', { level: 3 })).toHaveLength(0)
    expect(
      within(block).queryByText(/Le vivier actif au format ATS|Le vivier entier en tâche de fond/),
    ).not.toBeInTheDocument()
    expect(within(block).getByRole('button', { name: 'Exporter' })).toBeInTheDocument()
  })
})
