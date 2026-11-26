import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'

// #4163.2 — Parcours est une SECTION de Pilotage › Pipe, ouverte à tous les rôles.
vi.mock('@/components/page/CustomerPage', () => ({
  CustomerPage: ({ children, pageTitle }: { children: ReactNode; pageTitle?: string }) => (
    <main aria-label={pageTitle}>{children}</main>
  ),
}))
vi.mock('../view/CrmPipelinePanel', () => ({ CrmPipelinePanel: () => null }))
vi.mock('./PipeWaterfall', () => ({ PipeWaterfall: () => null }))
vi.mock('./PipeInspection', () => ({ PipeInspection: () => null }))
vi.mock('./PipeByOwner', () => ({ PipeByOwner: () => <section data-testid="pipe-by-owner" /> }))
vi.mock('./PipeNeedsTracker', () => ({ PipeNeedsTracker: () => <section data-testid="pipe-needs" /> }))
vi.mock('@/features/laura/bubble/page-context-store', () => ({ useLauraContext: () => undefined }))
vi.mock('@/features/chains/view/ChainsPage', () => ({
  ChainsPage: () => <section data-testid="parcours-section" />,
}))
vi.mock('@/features/projects/probability/ProbableQuarterPanel', () => ({
  ProbableQuarterPanel: () => <section data-testid="probable-quarter-panel" />,
}))

import { PipeScreen } from './PipeScreen'

afterEach(cleanup)

describe('Pipe › section Parcours (#4163.2)', () => {
  it('un gestionnaire voit le pipe ET la section Parcours, embarquée', async () => {
    await i18n.changeLanguage('fr')
    render(<PipeScreen />)
    expect(screen.getByTestId('probable-quarter-panel')).toBeInTheDocument()
    expect(screen.getByTestId('parcours-section')).toBeInTheDocument()
  })

  it('SAIT DIRE NON — un non-gestionnaire ne voit AUCUN chiffre du pipe, seulement Parcours', async () => {
    await i18n.changeLanguage('fr')
    render(<PipeScreen manager={false} />)
    expect(screen.queryByTestId('probable-quarter-panel')).toBeNull()
    expect(screen.getByTestId('parcours-section')).toBeInTheDocument()
  })

  it('un palier sans cockpit voit Parcours et la porte de l’offre, jamais le pipe', async () => {
    await i18n.changeLanguage('fr')
    render(<PipeScreen manager={false} locked={<p data-testid="locked" />} />)
    expect(screen.getByTestId('locked')).toBeInTheDocument()
    expect(screen.queryByTestId('probable-quarter-panel')).toBeNull()
    expect(screen.getByTestId('parcours-section')).toBeInTheDocument()
  })

  // Théo D (23/10) — Pipe et Parcours sont de vrais onglets : un seul visible à la fois.
  it('Pipe s’ouvre d’abord ; un clic sur Parcours montre Parcours et masque le pipe', async () => {
    await i18n.changeLanguage('fr')
    render(<PipeScreen />)
    const pipePanel = screen.getByTestId('probable-quarter-panel').closest('[role="tabpanel"]') as HTMLElement
    const parcoursPanel = screen.getByTestId('parcours-section').closest('[role="tabpanel"]') as HTMLElement
    expect(pipePanel.hidden).toBe(false)
    expect(parcoursPanel.hidden).toBe(true)

    await userEvent.click(screen.getByRole('button', { name: 'Parcours' }))

    expect(pipePanel.hidden).toBe(true)
    expect(parcoursPanel.hidden).toBe(false)
  })

  it('un non-gestionnaire n’a pas de barre d’onglets : Parcours est tout ce qu’il voit', async () => {
    await i18n.changeLanguage('fr')
    render(<PipeScreen manager={false} />)
    expect(screen.queryByRole('button', { name: 'Parcours' })).toBeNull()
    expect((screen.getByTestId('parcours-section').closest('[role="tabpanel"]') as HTMLElement).hidden).toBe(false)
  })
})

describe('Théo D pilotage › Pipe — deux rangées de deux', () => {
  it('le CA probable à côté des besoins ouverts ; « Par commercial » à côté du pipeline du CRM', async () => {
    await i18n.changeLanguage('fr')
    render(<PipeScreen />)
    const probable = screen.getByTestId('pipe-row-probable')
    expect(probable.className).toContain('lg:grid-cols-2')
    expect(probable.contains(screen.getByTestId('probable-quarter-panel'))).toBe(true)
    expect(probable.contains(screen.getByTestId('pipe-needs'))).toBe(true)
    const owners = screen.getByTestId('pipe-row-owners')
    expect(owners.contains(screen.getByTestId('pipe-by-owner'))).toBe(true)
    expect(owners.contains(screen.getByTestId('pipe-needs'))).toBe(false)
  })
})
