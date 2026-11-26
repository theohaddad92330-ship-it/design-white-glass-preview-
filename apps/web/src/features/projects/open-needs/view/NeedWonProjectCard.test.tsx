import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { OpenNeedRow } from '@bellum/contracts'
import { NeedWonProjectCard } from './NeedWonProjectCard'

// #4270.4 — en espace forfait, un besoin GAGNÉ devient un projet SUIVI : libellés « projet », aucun staffing proposé.
const need = (over: Partial<OpenNeedRow> = {}): OpenNeedRow =>
  ({ status: 'won', missions_assigned: 1, project_missions_unlinked: 0, ...over }) as OpenNeedRow

describe('#4270.4 — NeedWonProjectCard', () => {
  it('dit « projet », jamais « mission », et ne propose aucun staffing', () => {
    const { container } = render(<NeedWonProjectCard need={need()} />)

    expect(screen.getByRole('heading', { name: 'Projet gagné' })).toBeInTheDocument()
    expect(screen.getByText(/1 projet suivi/)).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/mission/i)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByText(/ne se staffe pas/i)).toBeInTheDocument()
  })

  it('le compte inconnu se NOMME, jamais « 0 projet »', () => {
    const { container } = render(
      <NeedWonProjectCard need={need({ missions_assigned: undefined, project_missions_unlinked: undefined })} />,
    )

    expect(screen.getByText(/pas encore lu/i)).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/\b0 projet/)
  })
})
