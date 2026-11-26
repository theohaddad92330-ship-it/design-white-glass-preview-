import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const universal = vi.fn()
vi.mock('./UniversalImportDialog', () => ({
  UniversalImportDialog: (props: { fixedType?: string; startWithSample?: boolean }) => {
    universal(props)
    return <div data-testid="universal">{`${props.fixedType}:${props.startWithSample ? 'sample' : 'file'}`}</div>
  },
}))
vi.mock('@/features/target-lists/view/ImportTargetListDialog', () => ({
  ImportTargetListDialog: ({ open }: { open: boolean }) => (open ? <div data-testid="target-list" /> : null),
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...rest }: { children: React.ReactNode; to: string }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}))

const { ImportPortfolioDialog } = await import('./ImportPortfolioDialog')

// Théo A comptes-import.R1 / N3 / A3 — UNE modale, trois portes, et le choix « ce fichier contient ».
describe('ImportPortfolioDialog', () => {
  it('annonce que les doublons sont repérés et que rien n’est écrasé', () => {
    render(<ImportPortfolioDialog onClose={vi.fn()} />)

    expect(screen.getByRole('dialog', { name: 'Importer dans le portefeuille' })).toBeInTheDocument()
    expect(screen.getByText(/doublons sont repérés avant l’ajout, rien n’est écrasé/)).toBeInTheDocument()
  })

  it('importe des comptes par défaut depuis un document local', () => {
    render(<ImportPortfolioDialog onClose={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Sélectionner mon document local' }))

    expect(screen.getByTestId('universal')).toHaveTextContent('account:file')
  })

  it('importe des contacts quand le fichier en contient', () => {
    render(<ImportPortfolioDialog onClose={vi.fn()} />)

    fireEvent.click(screen.getByRole('radio', { name: 'Des contacts' }))
    fireEvent.click(screen.getByRole('button', { name: 'Sélectionner mon document local' }))

    expect(screen.getByTestId('universal')).toHaveTextContent('contact:file')
  })

  it('ouvre l’import de liste de cibles dans la même modale', () => {
    render(<ImportPortfolioDialog onClose={vi.fn()} />)

    fireEvent.click(screen.getByRole('radio', { name: 'Une liste de cibles' }))
    fireEvent.click(screen.getByRole('button', { name: 'Sélectionner mon document local' }))

    expect(screen.getByTestId('target-list')).toBeInTheDocument()
    expect(screen.queryByTestId('universal')).toBeNull()
  })

  it('le fichier d’exemple lance l’import sur l’exemple, sans le mot « fictif »', () => {
    render(<ImportPortfolioDialog onClose={vi.fn()} />)

    const sample = screen.getByRole('button', { name: /fichier d’exemple/ })
    expect(sample.textContent ?? '').not.toMatch(/fictif/i)
    fireEvent.click(sample)

    expect(screen.getByTestId('universal')).toHaveTextContent('account:sample')
  })

  it('« Connecter mon CRM » mène à l’import par CRM', () => {
    render(<ImportPortfolioDialog onClose={vi.fn()} />)

    expect(screen.getByRole('link', { name: 'Connecter mon CRM' })).toHaveAttribute('href', '/settings/mes-donnees')
  })
})
