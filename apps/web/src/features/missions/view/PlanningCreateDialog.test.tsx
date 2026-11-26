import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

const odoo = vi.hoisted(() => ({ data: undefined as { status: string } | undefined }))
vi.mock('../odoo-sales-api', () => ({ useOdooSales: () => ({ data: odoo.data }) }))
vi.mock('./MissionCreateForm', () => ({
  MissionCreateForm: ({ onCancel }: { onCancel: () => void }) => (
    <div data-testid="manual-form">
      <button type="button" onClick={onCancel}>
        Annuler la saisie
      </button>
    </div>
  ),
}))
vi.mock('./OdooSalesSection', () => ({ OdooSalesSection: () => <div data-testid="odoo-section" /> }))
vi.mock('./CreateMissionFromDocumentDialog', () => ({
  CreateMissionFromDocumentDialog: ({ accountName }: { accountName: string }) => (
    <div data-testid="document-dialog">{accountName}</div>
  ),
}))
vi.mock('@/features/accounts/hooks/useAccounts', () => ({
  useAccounts: () => ({
    data: { pages: [{ data: [{ id: 'a1', company_name: 'Orange' }] }] },
  }),
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
  useNavigate: () => vi.fn(),
}))

const { PlanningCreateDialog } = await import('./PlanningCreateDialog')

afterEach(() => {
  cleanup()
  odoo.data = undefined
})

// Théo missions-planning.R8 — une fenêtre, trois portes.
describe('PlanningCreateDialog', () => {
  it('propose trois portes : saisir, un document, une affaire gagnée — et pas la quatrième sans outil branché', () => {
    render(<PlanningCreateDialog open onOpenChange={() => undefined} />)
    expect(screen.getByRole('dialog', { name: 'Créer une mission' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /saisir la mission/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /à partir d’un document/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /depuis une affaire gagnée/i })).toHaveAttribute('href', '/projects')
    expect(screen.queryByText(/reprendre depuis ton outil de gestion/i)).not.toBeInTheDocument()
  })

  it('« Saisir la mission » ouvre le formulaire dans la fenêtre, et « Annuler » revient aux portes', async () => {
    render(<PlanningCreateDialog open onOpenChange={() => undefined} />)
    await userEvent.click(screen.getByRole('button', { name: /saisir la mission/i }))
    expect(screen.getByTestId('manual-form')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Annuler la saisie' }))
    expect(screen.queryByTestId('manual-form')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /à partir d’un document/i })).toBeInTheDocument()
  })

  it('« À partir d’un document » demande d’abord le compte, puis lit le document POUR ce compte', async () => {
    render(<PlanningCreateDialog open onOpenChange={() => undefined} />)
    await userEvent.click(screen.getByRole('button', { name: /à partir d’un document/i }))
    expect(screen.queryByTestId('document-dialog')).not.toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Compte'), 'ora')
    await userEvent.click(screen.getByRole('button', { name: 'Orange' }))
    expect(screen.getByTestId('document-dialog')).toHaveTextContent('Orange')
  })

  it('la quatrième porte — reprendre depuis l’outil de gestion — n’apparaît que si l’outil est branché', async () => {
    odoo.data = { status: 'connected' }
    render(<PlanningCreateDialog open onOpenChange={() => undefined} />)
    await userEvent.click(screen.getByRole('button', { name: /reprendre depuis ton outil de gestion/i }))
    expect(screen.getByTestId('odoo-section')).toBeInTheDocument()
  })

  it('un outil non branché ne montre pas la porte', () => {
    odoo.data = { status: 'not_connected' }
    render(<PlanningCreateDialog open onOpenChange={() => undefined} />)
    expect(screen.queryByRole('button', { name: /reprendre depuis ton outil de gestion/i })).not.toBeInTheDocument()
  })
})
