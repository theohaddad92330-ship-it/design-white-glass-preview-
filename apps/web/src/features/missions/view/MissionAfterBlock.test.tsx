import { cleanup, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@tanstack/react-router', async importOriginal => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  Link: ({
    children,
    to,
    params,
    ...rest
  }: {
    children: React.ReactNode
    to: string
    params?: { id: string }
    'aria-label'?: string
  }) => (
    <a href={params?.id ? to.replace('$id', params.id) : to} aria-label={rest['aria-label']}>
      {children}
    </a>
  ),
}))

const { MissionAfterBlock } = await import('./MissionAfterBlock')

beforeEach(() => cleanup())

describe('MissionAfterBlock — Théo C missions-dossier.N3', () => {
  it('renvoie vers les besoins et vers la fiche du consultant, en disant que planning ≠ disponibilité', () => {
    render(<MissionAfterBlock consultants={[{ consultantId: 'c1', consultantName: 'Hakim Barreau' }]} />)
    expect(screen.getByRole('heading', { name: 'Après la mission' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Explorer les besoins/ })).toHaveAttribute('href', '/projects/needs')
    expect(screen.getByRole('link', { name: /Confirmer une disponibilité · Hakim Barreau/ })).toHaveAttribute(
      'href',
      '/consultants/c1',
    )
    expect(
      screen.getByText('La date du planning et la disponibilité du consultant sont deux informations distinctes.'),
    ).toBeInTheDocument()
  })

  it('sans consultant affecté : pas de lien de disponibilité inventé', () => {
    render(<MissionAfterBlock consultants={[]} />)
    expect(screen.queryByRole('link', { name: /Confirmer une disponibilité/ })).toBeNull()
    expect(screen.getByRole('link', { name: /Explorer les besoins/ })).toBeInTheDocument()
  })
})
