import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ProjectReadRow } from '@bellum/contracts'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to?: string }) => <a href={to ?? '#'}>{children}</a>,
}))

const { WonProjectsInPlanning } = await import('./WonProjectsInPlanning')

// #4291.8 (revient sur #4291.8, décision Louis 02/11) — le suivi d'un projet gagné vit dans /planning ; /projects ne
// parle plus de mission : une ligne courte qui y renvoie.
const row = (over: Partial<ProjectReadRow>): ProjectReadRow =>
  ({ id: 'w1', account_id: 'a1', company_name: 'AIRBUS', label: 'Refonte SI', stage: 'won', ...over }) as ProjectReadRow

describe('WonProjectsInPlanning (#4291.8)', () => {
  it('compte les projets gagnés et renvoie vers le Planning (/missions/planification)', () => {
    render(<WonProjectsInPlanning projects={[row({}), row({ id: 'w2' }), row({ id: 'q', stage: 'qualified' })]} />)
    expect(screen.getByText(/2 projets gagnés — suivis dans Planning/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Ouvrir le Planning/ })).toHaveAttribute('href', '/missions/planification')
  })

  it('NON : ne parle plus de mission sur /projects', () => {
    const { container } = render(<WonProjectsInPlanning projects={[row({})]} />)
    expect(container.textContent).not.toMatch(/mission/i)
  })

  it('NON : rien quand aucun projet n’est gagné (jamais « 0 »)', () => {
    const { container } = render(<WonProjectsInPlanning projects={[row({ stage: 'qualified' })]} />)
    expect(container).toBeEmptyDOMElement()
  })
})
