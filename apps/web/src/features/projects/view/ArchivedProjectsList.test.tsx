import type { ProjectReadinessRow } from '@bellum/contracts'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'

const archived = vi.fn()
const unarchive = vi.fn()

vi.mock('../hooks/useArchivedProjects', () => ({ useArchivedProjects: () => archived() }))
vi.mock('../hooks/useArchiveOpportunity', () => ({
  useArchiveOpportunity: () => ({ mutate: unarchive, isPending: false }),
}))
vi.mock('@tanstack/react-router', async importOriginal => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...actual,
    Link: ({ to, children }: { to?: string; children: ReactNode }) => <a href={to ?? '#'}>{children}</a>,
  }
})

const { ArchivedProjectsList } = await import('./ArchivedProjectsList')

function row(over: Partial<ProjectReadinessRow> & { id: string; label: string }): ProjectReadinessRow {
  return {
    company_name: 'Cliente SA',
    stage: 'qualified',
    archived_at: '2026-09-20T10:00:00.000Z',
    ...over,
  } as ProjectReadinessRow
}

describe('ArchivedProjectsList — #4137, les dossiers archivés du pipe', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    archived.mockReset()
    unarchive.mockReset()
  })

  it('liste chaque dossier archivé avec son compte, et un bouton Désarchiver', () => {
    archived.mockReturnValue({
      data: [row({ id: 'p1', label: 'Refonte SI' }), row({ id: 'p2', label: 'Migration cloud' })],
      isLoading: false,
      isError: false,
    })
    render(<ArchivedProjectsList />)
    expect(screen.getByText('Refonte SI')).toBeInTheDocument()
    expect(screen.getByText('Migration cloud')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /Désarchiver/ })).toHaveLength(2)
  })

  it('« Désarchiver » appelle l’API existante avec archived=false', () => {
    archived.mockReturnValue({ data: [row({ id: 'p1', label: 'Refonte SI' })], isLoading: false, isError: false })
    render(<ArchivedProjectsList />)
    fireEvent.click(screen.getByRole('button', { name: 'Désarchiver Refonte SI' }))
    expect(unarchive).toHaveBeenCalledWith({ id: 'p1', archived: false })
  })

  it('une absence ne fait AUCUNE ligne — le vide est dit en une phrase, sans bouton', () => {
    archived.mockReturnValue({ data: [], isLoading: false, isError: false })
    render(<ArchivedProjectsList />)
    expect(screen.getByText('Aucun dossier archivé.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Désarchiver/ })).not.toBeInTheDocument()
  })

  it('un échec de lecture ne se lit pas « aucun archivé »', () => {
    archived.mockReturnValue({ data: undefined, isLoading: false, isError: true })
    render(<ArchivedProjectsList />)
    expect(screen.queryByText('Aucun dossier archivé.')).not.toBeInTheDocument()
    expect(screen.getByText(/n’ont pas pu être chargés/)).toBeInTheDocument()
  })

  it('n’affiche pas de date d’archivage quand elle manque', () => {
    archived.mockReturnValue({
      data: [row({ id: 'p1', label: 'X', archived_at: null })],
      isLoading: false,
      isError: false,
    })
    render(<ArchivedProjectsList />)
    expect(screen.queryByText(/Archivé le/)).not.toBeInTheDocument()
  })
})
