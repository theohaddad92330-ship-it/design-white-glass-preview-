import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectSynthesis } from '@bellum/contracts'

/**
 * #2171.27 — la synthèse en 7 questions, générée À LA DEMANDE. `projectsApi`
 * est MOQUÉ : ce fichier garde le RENDU et le GESTE (clic → appel → affichage
 * des sept champs, faits et hypothèses distingués), pas la génération réelle.
 */

const generateSynthesis = vi.fn()
vi.mock('../api', () => ({
  projectsApi: { generateSynthesis: (...args: unknown[]) => generateSynthesis(...args) },
}))

const { ProjectSynthesisPanel } = await import('./ProjectSynthesisPanel')

function synthesis(over: Partial<ProjectSynthesis> = {}): ProjectSynthesis {
  return {
    projectId: 'p-1',
    problem: 'Le client cherche à absorber la charge sans recruter.',
    confirmed: ['Le budget est validé pour le T1.'],
    hypotheses: ['Le déclencheur serait un audit interne récent.'],
    decisionMaker: 'DSI',
    blockingConditions: ['Validation du comité achats en attente.'],
    nextToObtain: 'La date du comité achats.',
    whatNotToDo: 'Ne pas relancer avant le comité.',
    generatedAt: '2026-09-27T09:00:00.000Z',
    ...over,
  }
}

function wrap(node: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>)
}

beforeEach(() => {
  generateSynthesis.mockReset()
})

describe('ProjectSynthesisPanel', () => {
  it('dit qu’aucune synthèse n’est encore générée, sans inventer de contenu', () => {
    wrap(<ProjectSynthesisPanel projectId="p-1" />)
    expect(screen.getByText('Aucune synthèse générée pour l’instant.')).toBeInTheDocument()
  })

  it('le clic génère et affiche les sept champs, faits et hypothèses distingués', async () => {
    generateSynthesis.mockResolvedValue(synthesis())
    wrap(<ProjectSynthesisPanel projectId="p-1" />)

    await userEvent.click(screen.getByRole('button', { name: 'Générer la synthèse' }))

    await waitFor(() => expect(generateSynthesis).toHaveBeenCalledWith('p-1'))
    expect(await screen.findByText('Le budget est validé pour le T1.')).toBeInTheDocument()
    expect(screen.getByText('Le déclencheur serait un audit interne récent.')).toBeInTheDocument()
    expect(screen.getByText('DSI')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Régénérer' })).toBeInTheDocument()
  })

  it('un décideur non identifié se NOMME, il ne se tait pas', async () => {
    generateSynthesis.mockResolvedValue(synthesis({ decisionMaker: null }))
    wrap(<ProjectSynthesisPanel projectId="p-1" />)

    await userEvent.click(screen.getByRole('button', { name: 'Générer la synthèse' }))

    expect(await screen.findByText('Pas encore identifié')).toBeInTheDocument()
  })

  it('aucune hypothèse : la section « Hypothèses » ne rend aucune ligne', async () => {
    generateSynthesis.mockResolvedValue(synthesis({ hypotheses: [] }))
    wrap(<ProjectSynthesisPanel projectId="p-1" />)

    await userEvent.click(screen.getByRole('button', { name: 'Générer la synthèse' }))

    await screen.findByText('Le budget est validé pour le T1.')
    expect(screen.queryByText('Hypothèses')).not.toBeInTheDocument()
  })

  it('un échec de génération affiche une erreur claire, jamais une synthèse inventée', async () => {
    generateSynthesis.mockRejectedValue(new Error('boom'))
    wrap(<ProjectSynthesisPanel projectId="p-1" />)

    await userEvent.click(screen.getByRole('button', { name: 'Générer la synthèse' }))

    expect(await screen.findByText('La synthèse n’a pas pu être générée.')).toBeInTheDocument()
  })
})
