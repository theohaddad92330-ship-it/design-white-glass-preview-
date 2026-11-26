import { screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { ManagerPipelineValue } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { TeamPotential } from './TeamPotential'

const PIPELINE: ManagerPipelineValue = {
  currency: 'EUR',
  total_amount: 417_000,
  valued_count: 6,
  without_amount: 1,
  by_stage: [
    { stage: 'qualified', amount: 97_000, valued_count: 2, total_count: 2 },
    { stage: 'negotiation', amount: 0, valued_count: 0, total_count: 1 },
  ],
}

beforeEach(async () => {
  await i18n.changeLanguage('fr')
})

describe('Théo D team-vue — « Le potentiel à convertir »', () => {
  it('le pipe ouvert étape par étape, non pondéré, et un lien vers les affaires', async () => {
    renderWithRouter(<TeamPotential pipeline={PIPELINE} />)
    const region = await screen.findByRole('region', { name: 'Le potentiel à convertir' })
    expect(within(region).getByText(/417\s000\s€/)).toBeInTheDocument()
    expect(within(region).getByText(/3 affaires ouvertes · montants non pondérés/)).toBeInTheDocument()
    expect(within(region).getByRole('link', { name: 'Ouvrir les affaires' })).toHaveAttribute('href', '/projects')
  })

  it('une étape sans montant saisi écrit « — », jamais « 0 € »', async () => {
    renderWithRouter(<TeamPotential pipeline={PIPELINE} />)
    const region = await screen.findByRole('region', { name: 'Le potentiel à convertir' })
    expect(within(region).getByText('—')).toBeInTheDocument()
    expect(within(region).getAllByText(/97\s000\s€/).length).toBeGreaterThan(0)
  })

  it('aucune affaire ouverte, ou une API plus ancienne : aucune carte', () => {
    const { unmount } = renderWithRouter(<TeamPotential pipeline={undefined} />)
    expect(screen.queryByRole('region')).not.toBeInTheDocument()
    unmount()
    renderWithRouter(<TeamPotential pipeline={{ ...PIPELINE, by_stage: [] }} />)
    expect(screen.queryByRole('region')).not.toBeInTheDocument()
  })
})
