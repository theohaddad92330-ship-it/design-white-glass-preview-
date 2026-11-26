import type { Contact } from '@bellum/contracts'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { EngagementEmptyState } from './EngagementEmptyState'

// AM.63 — la préférence EXISTANTE « approche directe » ; le hook est doublé, le geste est ce qu'on prouve.
const approachMock = vi.hoisted(() => ({
  current: { data: null as 'direct' | null | undefined, isError: false },
  mutate: vi.fn(),
}))
vi.mock('@/features/memory/hooks/useMessageApproach', () => ({
  useMessageApproach: () => approachMock.current,
  useSetMessageApproach: () => ({ mutate: approachMock.mutate, isPending: false }),
}))

const contact = { id: 'c1', full_name: 'Samah Sdiri', decision_role: 'blocker' } as unknown as Contact

const unknownRank = { id: 'c2', full_name: 'Claire Martin', decision_role: null } as unknown as Contact

describe('#3633 / #3694.5 — « Email suggéré » ne pose une question que si la réponse change le message', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('rang connu (dossier complet) : le clic rédige aussitôt, sans aucune question', async () => {
    const onContextPreset = vi.fn()
    const onApproachChosen = vi.fn()
    render(
      <EngagementEmptyState
        channel="email"
        contact={contact}
        onContextPreset={onContextPreset}
        onApproachChosen={onApproachChosen}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Email suggéré' }))

    expect(onContextPreset).not.toHaveBeenCalled()
    expect(screen.queryByRole('group')).toBeNull()
    expect(onApproachChosen).toHaveBeenCalledWith({ angle: '', parameters: { objective: 'demande_information' } })
  })

  it('rang inconnu : la question de l’objectif est posée, « Rédiger » attend sa réponse', async () => {
    const onApproachChosen = vi.fn()
    render(
      <EngagementEmptyState
        channel="email"
        contact={unknownRank}
        onContextPreset={vi.fn()}
        onApproachChosen={onApproachChosen}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Email suggéré' }))
    const submit = screen.getByRole('button', { name: "Rédiger l'e-mail" })
    expect(submit).toBeDisabled()
    expect(onApproachChosen).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Relancer' }))
    expect(submit).toBeEnabled()
    await userEvent.click(submit)
    expect(onApproachChosen).toHaveBeenCalledWith({ angle: '', parameters: { objective: 'relance' } })
  })

  it('l’angle et le ton restent possibles, sans être exigés', async () => {
    const onApproachChosen = vi.fn()
    render(
      <EngagementEmptyState
        channel="email"
        contact={unknownRank}
        onContextPreset={vi.fn()}
        onApproachChosen={onApproachChosen}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Email suggéré' }))
    await userEvent.click(screen.getByRole('button', { name: 'Relancer' }))
    await userEvent.click(screen.getByRole('button', { name: 'Un signal récent du compte' }))
    await userEvent.click(screen.getByRole('button', { name: 'Direct et concis' }))
    await userEvent.click(screen.getByRole('button', { name: "Rédiger l'e-mail" }))
    expect(onApproachChosen).toHaveBeenCalledWith({
      angle: expect.stringContaining('signal récent'),
      parameters: { objective: 'relance', constraints: expect.stringContaining('direct') },
    })
  })

  it('les autres pastilles gardent leur pré-remplissage', async () => {
    const onContextPreset = vi.fn()
    render(
      <EngagementEmptyState
        channel="email"
        contact={contact}
        onContextPreset={onContextPreset}
        onApproachChosen={vi.fn()}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Relance courte' }))
    expect(onContextPreset).toHaveBeenCalledTimes(1)
  })
})

describe('AM.63 — « Garder l’approche directe » écrit la préférence EXISTANTE, depuis le composer', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    approachMock.mutate.mockReset()
    approachMock.current = { data: null, isError: false }
  })

  const renderEmpty = (channel: 'email' | 'linkedin' = 'email') =>
    render(
      <EngagementEmptyState channel={channel} contact={contact} onContextPreset={vi.fn()} onApproachChosen={vi.fn()} />,
    )

  it('le clic pose « direct » dans la préférence existante', async () => {
    renderEmpty()
    await userEvent.click(screen.getByRole('button', { name: 'Garder l’approche directe' }))
    expect(approachMock.mutate).toHaveBeenCalledWith('direct')
  })

  it('déjà gardée : le même geste la retire (null), jamais une seconde préférence', async () => {
    approachMock.current = { data: 'direct', isError: false }
    renderEmpty()
    const toggle = screen.getByRole('button', { name: 'Approche directe gardée — retirer' })
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(toggle)
    expect(approachMock.mutate).toHaveBeenCalledWith(null)
  })

  it('préférence illisible : aucun geste (ce n’est pas « par défaut »)', () => {
    approachMock.current = { data: undefined, isError: true }
    renderEmpty()
    expect(screen.queryByRole('button', { name: /approche directe/i })).toBeNull()
  })

  it('e-mail seulement : aucun geste sur un autre canal', () => {
    renderEmpty('linkedin')
    expect(screen.queryByRole('button', { name: /approche directe/i })).toBeNull()
  })
})
