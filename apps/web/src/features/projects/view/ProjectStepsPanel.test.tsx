import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectStep } from '@bellum/contracts'

/**
 * #2171.22 — Section « Actions et prochaines étapes », COCHABLE — le vrai
 * chemin d'écriture qui manquait sur la fiche opportunité.
 *
 * `useProjectSteps` / `useUpdateProjectStep` / `useCreateProjectStep` sont
 * MOQUÉS : ce fichier garde le RENDU et le GESTE (cocher → la bonne mutation,
 * avec le bon statut cible), pas la lecture réseau.
 */

const steps = vi.fn()
const update = vi.fn()
const create = vi.fn()
vi.mock('../hooks/useProjectSteps', () => ({
  useProjectSteps: () => steps(),
  useUpdateProjectStep: () => ({ mutate: update }),
  useCreateProjectStep: () => ({ mutate: create, isPending: false }),
}))

const { ProjectStepsPanel } = await import('./ProjectStepsPanel')

function step(over: Partial<ProjectStep> = {}): ProjectStep {
  return {
    id: 's-1',
    projectId: 'p-1',
    label: 'Relancer le sponsor',
    status: 'todo',
    position: 0,
    doneAt: null,
    createdAt: '2026-09-25T09:00:00.000Z',
    updatedAt: '2026-09-25T09:00:00.000Z',
    ...over,
  }
}

beforeEach(() => {
  steps.mockReset()
  update.mockReset()
  create.mockReset()
})

describe('ProjectStepsPanel', () => {
  it('affiche un badge « À faire » ou « En attente » sur une étape non cochée', () => {
    steps.mockReturnValue({
      items: [step({ id: 's-1', status: 'todo' }), step({ id: 's-2', label: 'Envoyer le devis', status: 'pending' })],
      isLoading: false,
      isError: false,
    })
    render(<ProjectStepsPanel projectId="p-1" />)
    expect(screen.getByText('À faire')).toBeInTheDocument()
    expect(screen.getByText('En attente')).toBeInTheDocument()
  })

  it('cocher une étape déclenche la mutation avec le statut « done »', async () => {
    steps.mockReturnValue({ items: [step({ id: 's-1', status: 'todo' })], isLoading: false, isError: false })
    render(<ProjectStepsPanel projectId="p-1" />)
    await userEvent.click(screen.getByRole('checkbox'))
    expect(update).toHaveBeenCalledWith({ stepId: 's-1', status: 'done' })
  })

  it('décocher une étape déjà faite la repasse à « todo »', async () => {
    steps.mockReturnValue({ items: [step({ id: 's-1', status: 'done' })], isLoading: false, isError: false })
    render(<ProjectStepsPanel projectId="p-1" />)
    await userEvent.click(screen.getByRole('checkbox'))
    expect(update).toHaveBeenCalledWith({ stepId: 's-1', status: 'todo' })
  })

  it('dit qu’aucune étape n’est encore posée, sans inventer de liste', () => {
    steps.mockReturnValue({ items: [], isLoading: false, isError: false })
    render(<ProjectStepsPanel projectId="p-1" />)
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })
})
