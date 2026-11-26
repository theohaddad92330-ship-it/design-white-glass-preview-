import { render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import type { Account } from '@bellum/contracts'
import { AccountReferenceNotice } from './AccountReferenceNotice'

const mutate = vi.fn()
vi.mock('@/features/accounts/hooks/useCreateWorkingCopy', () => ({
  useCreateWorkingCopy: () => ({ mutate, isPending: false }),
}))
vi.mock('@tanstack/react-router', async importOriginal => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  Link: ({ children, params }: { children: React.ReactNode; params?: { id?: string } }) => (
    <a href={`/accounts/${params?.id}`}>{children}</a>
  ),
}))

const ARCHIVE = {
  label: 'Archive du dépôt fourni',
  period_from: '2026-09-30',
  period_to: '2026-10-01',
  scope_note: 'périmètre France',
  verified_online: false,
}

function account(raw: Record<string, unknown>): Account {
  return { id: 'acc-1', company_name: 'Groupe BPCE', raw_analysis: raw } as unknown as Account
}

describe('AccountReferenceNotice — Théo A comptes-fiche-reference.A2', () => {
  it('un compte ordinaire ne porte aucun bandeau', () => {
    const { container } = render(<AccountReferenceNotice account={account({})} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('une archive porte son bandeau', () => {
    render(<AccountReferenceNotice account={account({ reference_archive: ARCHIVE })} />)
    expect(screen.getByTestId('reference-archive-banner')).toBeInTheDocument()
  })

  it('une copie de travail renvoie vers son archive d’origine', () => {
    render(<AccountReferenceNotice account={account({ working_copy_of: 'acc-archive' })} />)
    expect(screen.getByText(/copie de travail de l’archive/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ouvrir l’archive' })).toHaveAttribute('href', '/accounts/acc-archive')
  })
})
