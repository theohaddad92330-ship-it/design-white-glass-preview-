import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const data = { items: [] as unknown[], windowDays: 90 }
vi.mock('../hooks', () => ({ useMissingExpertise: () => ({ isPending: false, data }) }))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, ...rest }: { children: React.ReactNode }) => <a {...rest}>{children}</a>,
}))

const { MissingExpertiseLink } = await import('./MissingExpertiseLink')

afterEach(cleanup)

// #4349 V.2 — décision Louis 19/10 : le Vivier ne porte plus le bloc, seulement un lien vers Pilotage › Staffing.
describe('MissingExpertiseLink', () => {
  it('sans compétence concernée, ne rend rien — une absence ne fait aucune ligne', () => {
    data.items = []
    const { container } = render(<MissingExpertiseLink />)
    expect(container).toBeEmptyDOMElement()
  })

  it('avec des compétences concernées, mène à Pilotage › Staffing', () => {
    data.items = [{ skill: 'Kubernetes' }, { skill: 'Rust' }]
    render(<MissingExpertiseLink />)
    expect(screen.getByText(/2 compétences/)).toBeInTheDocument()
    expect(screen.getByText(/Staffing/).closest('a')).toHaveAttribute('to', '/pilotage/staffing')
  })
})
