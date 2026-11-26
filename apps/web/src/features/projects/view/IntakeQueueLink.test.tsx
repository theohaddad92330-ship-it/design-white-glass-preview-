import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, search }: { children: ReactNode; to: string; search?: Record<string, unknown> }) => (
    <a href={search ? `${to}?${new URLSearchParams(Object.entries(search).map(([k, v]) => [k, String(v)]))}` : to}>
      {children}
    </a>
  ),
}))
const pipeline = vi.fn()
vi.mock('../hooks/usePipeline', () => ({ usePipeline: () => pipeline() }))
vi.mock('@/features/crm-counters/usePistesToReview', () => ({ usePistesToReview: () => 7 }))

const { IntakeQueueLine, IntakeQueueLink } = await import('./IntakeQueueLink')

/**
 * #4499 — « Affaires à qualifier → Ouvrir la file de qualification » quitte le Pipeline et reste atteignable depuis
 * l'onglet Besoins : la file vit dans Signaux › Pistes.
 */
describe('IntakeQueueLink (#4499)', () => {
  it('nomme le nombre, garde les pistes en phrase entière, et mène à la file (le panneau des pistes du Pipe, #4545)', () => {
    render(<IntakeQueueLine intake={4} pistesToReview={2} />)
    expect(screen.getByText('Affaires à qualifier')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
    expect(screen.getByText('2 pistes à revoir')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Ouvrir la file de qualification/ })).toHaveAttribute(
      'href',
      '/projects?pistes=1',
    )
  })

  it('NON : rien à qualifier → aucune ligne (une flèche vers une file vide ne mène nulle part)', () => {
    const { container } = render(<IntakeQueueLine intake={0} pistesToReview={5} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('NON : un résumé non lu ou mal formé ne devient jamais « 0 à qualifier »', () => {
    pipeline.mockReturnValue({ data: undefined })
    const first = render(<IntakeQueueLink />)
    expect(first.container).toBeEmptyDOMElement()
    first.unmount()
    pipeline.mockReturnValue({ data: { intake: undefined } })
    const second = render(<IntakeQueueLink />)
    expect(second.container).toBeEmptyDOMElement()
  })

  it('branchée : lit le MÊME résumé du pipe et le MÊME compteur de pistes', () => {
    pipeline.mockReturnValue({ data: { intake: 3 } })
    render(<IntakeQueueLink />)
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('7 pistes à revoir')).toBeInTheDocument()
  })
})
