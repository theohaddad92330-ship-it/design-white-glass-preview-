import type { ProjectRow } from '@bellum/contracts'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const downloadCSV = vi.fn()
vi.mock('@/lib/export-csv', () => ({
  downloadCSV: (...args: unknown[]) => downloadCSV(...args),
  downloadJSON: vi.fn(),
}))
const dataExit = vi.fn()
vi.mock('@/lib/data-exit', () => ({
  useDataExit: () => dataExit(),
  workspaceRuleRefusalText: () => null,
}))
const openNeeds = vi.fn()
vi.mock('../open-needs/hooks/useOpenNeeds', () => ({ useOpenNeeds: () => openNeeds() }))
const exportSelection = vi.fn(async (_body: unknown) => '"Besoin"\r\n')
vi.mock('../open-needs/api', () => ({ openNeedsApi: { exportSelection: (body: unknown) => exportSelection(body) } }))

const { PipelineMoreMenu } = await import('./PipelineMoreMenu')

const project = {
  id: 'p-1',
  account_id: 'a-1',
  company_name: 'Sopra Steria',
  label: 'Refonte SI',
  stage: 'qualified',
  stage_entered_at: '2026-10-01T08:00:00.000Z',
  updated_at: '2026-10-15T10:00:00.000Z',
  expected_close_on: null,
  owner_id: null,
  source: null,
} as unknown as ProjectRow

const MORE = 'Plus d’actions sur le pipe'

/**
 * #4499 (Louis 23/10) — Exporter · Exporter pour un partenaire quittent l'en-tête pour un menu « … » discret à droite
 * de Kanban | Liste. Les deux passent par la règle d'espace ; sans entrée, pas de menu.
 */
describe('PipelineMoreMenu (#4499)', () => {
  beforeEach(() => {
    downloadCSV.mockClear()
    exportSelection.mockClear()
    dataExit.mockReturnValue({ allowed: true, grant: {} })
    openNeeds.mockReturnValue({ data: { data: [{ id: 'n-1' }, { id: 'n-2' }] } })
  })

  it('« Exporter » télécharge la VUE en CSV, avec la preuve de la règle d’espace', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    render(<PipelineMoreMenu projects={[project]} columns={['account']} ownerName={() => null} />)
    await user.click(screen.getByRole('button', { name: MORE }))
    await user.click(await screen.findByRole('menuitem', { name: 'Exporter' }))
    expect(downloadCSV).toHaveBeenCalledTimes(1)
    const [csv, filename, grant] = downloadCSV.mock.calls[0] as [string, string, unknown]
    expect(csv).toContain('Refonte SI')
    expect(filename).toMatch(/^affaires-\d{4}-\d{2}-\d{2}\.csv$/)
    expect(grant).toBeTruthy()
  })

  it('« Exporter pour un partenaire » exporte les besoins ouverts, sans tarif ni porteur', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    render(<PipelineMoreMenu projects={[project]} columns={[]} ownerName={() => null} />)
    await user.click(screen.getByRole('button', { name: MORE }))
    await user.click(await screen.findByRole('menuitem', { name: 'Exporter pour un partenaire' }))
    await waitFor(() =>
      // Forme EXACTE : #4295.14 a ajouté la langue des en-têtes ; aucun tarif ni porteur ne doit s'y glisser.
      expect(exportSelection).toHaveBeenCalledWith({
        needIds: ['n-1', 'n-2'],
        format: 'csv',
        audience: 'partner',
        lang: expect.any(String),
      }),
    )
  })

  it('« Exporter les besoins » n’est PAS ici : il vit dans l’onglet Besoins', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    render(<PipelineMoreMenu projects={[project]} columns={[]} ownerName={() => null} />)
    await user.click(screen.getByRole('button', { name: MORE }))
    await screen.findByRole('menuitem', { name: 'Exporter' })
    expect(screen.queryByRole('menuitem', { name: 'Exporter les besoins' })).toBeNull()
  })

  it('NON : la règle d’espace refuse la sortie de données → aucun menu', () => {
    dataExit.mockReturnValue({ allowed: false, grant: null })
    render(<PipelineMoreMenu projects={[project]} columns={[]} ownerName={() => null} />)
    expect(screen.queryByRole('button', { name: MORE })).toBeNull()
  })

  it('NON : hors pipe et sans besoin ouvert, rien à exporter → aucun menu', () => {
    openNeeds.mockReturnValue({ data: { data: [] } })
    render(<PipelineMoreMenu projects={null} columns={[]} ownerName={() => null} />)
    expect(screen.queryByRole('button', { name: MORE })).toBeNull()
  })
})
