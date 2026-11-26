import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NeedStep, OpenNeedRow } from '@bellum/contracts'

/**
 * « Prochaines étapes » COCHABLES — le vrai chemin d'écriture qui manquait.
 *
 * `useNeedSteps` / `useUpdateNeedStep` / `useCreateNeedStep` sont MOQUÉS : ce
 * fichier garde le RENDU et le GESTE (cocher → la bonne mutation, avec le bon
 * statut cible), pas la lecture réseau.
 */

const steps = vi.fn()
const update = vi.fn()
const create = vi.fn()
vi.mock('../hooks/useNeedSteps', () => ({
  useNeedSteps: () => steps(),
  useUpdateNeedStep: () => ({ mutate: update }),
  useCreateNeedStep: () => ({ mutate: create, isPending: false }),
}))

const { NeedStepsCard } = await import('./NeedStepsCard')

function need(over: Partial<OpenNeedRow> = {}): OpenNeedRow {
  return { id: 'n-1', title: 'Ingénieur données', ...over } as unknown as OpenNeedRow
}

function step(over: Partial<NeedStep> = {}): NeedStep {
  return {
    id: 's-1',
    needId: 'n-1',
    label: 'Valider la short list des profils',
    status: 'todo',
    position: 0,
    doneAt: null,
    createdAt: '2026-05-20T09:00:00.000Z',
    updatedAt: '2026-05-20T09:00:00.000Z',
    ...over,
  }
}

beforeEach(() => {
  steps.mockReset()
  update.mockReset()
  create.mockReset()
})

describe('NeedStepsCard', () => {
  it('affiche un badge « À faire » ou « En attente » sur une étape non cochée', () => {
    steps.mockReturnValue({
      items: [
        step({ id: 's-1', status: 'todo' }),
        step({ id: 's-2', label: 'Envoyer la proposition', status: 'pending' }),
      ],
      isLoading: false,
      isError: false,
    })
    render(<NeedStepsCard need={need()} />)
    expect(screen.getByText('À faire')).toBeInTheDocument()
    expect(screen.getByText('En attente')).toBeInTheDocument()
  })

  it('cocher une étape déclenche la mutation avec le statut « done »', async () => {
    steps.mockReturnValue({ items: [step({ id: 's-1', status: 'todo' })], isLoading: false, isError: false })
    render(<NeedStepsCard need={need()} />)
    await userEvent.click(screen.getByRole('checkbox'))
    expect(update).toHaveBeenCalledWith({ stepId: 's-1', status: 'done' })
  })

  it('décocher une étape déjà faite la repasse à « todo »', async () => {
    steps.mockReturnValue({ items: [step({ id: 's-1', status: 'done' })], isLoading: false, isError: false })
    render(<NeedStepsCard need={need()} />)
    await userEvent.click(screen.getByRole('checkbox'))
    expect(update).toHaveBeenCalledWith({ stepId: 's-1', status: 'todo' })
  })

  it('dit qu’aucune étape n’est encore posée, sans inventer de liste', () => {
    steps.mockReturnValue({ items: [], isLoading: false, isError: false })
    render(<NeedStepsCard need={need()} />)
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })
})
