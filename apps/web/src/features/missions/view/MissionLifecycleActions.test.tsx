import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MissionView } from '../api'
import { MissionLifecycleActions } from './MissionLifecycleActions'

/**
 * #4196 (L5) — « Prolonger » / « Terminer » dans le panneau d'une mission.
 * Les boutons ne portent aucune requête : seul le dialogue ouvert appelle l'API
 * (ce qui laisse les écrans qui montent le panneau sans fournisseur de requêtes).
 */
const extend = vi.fn()
const end = vi.fn()
vi.mock('../api', () => ({
  useExtendMission: () => ({ mutate: extend, isPending: false }),
  useEndMission: () => ({ mutate: end, isPending: false }),
}))

const mission = (over: Partial<MissionView> = {}) =>
  ({ id: 'm-1', status: 'active', ends_on: '2026-12-31', daily_rate: 600, ...over }) as MissionView

describe('MissionLifecycleActions', () => {
  beforeEach(() => {
    extend.mockReset()
    end.mockReset()
  })

  it('propose Prolonger et Terminer sur une mission en cours', () => {
    render(<MissionLifecycleActions mission={mission()} />)
    expect(screen.getByRole('button', { name: 'Prolonger' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Terminer' })).toBeInTheDocument()
  })

  it.each(['completed', 'cancelled', 'draft'])('ne propose rien sur une mission « %s »', status => {
    render(<MissionLifecycleActions mission={mission({ status } as Partial<MissionView>)} />)
    expect(screen.queryByRole('button', { name: 'Prolonger' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Terminer' })).toBeNull()
  })

  it('Prolonger envoie la nouvelle échéance ET la preuve ; sans preuve, rien ne part', async () => {
    const user = userEvent.setup()
    render(<MissionLifecycleActions mission={mission()} />)
    await user.click(screen.getByRole('button', { name: 'Prolonger' }))
    await user.type(screen.getByLabelText('Nouvelle date de fin'), '2027-03-31')
    const submit = screen.getByRole('button', { name: 'Prolonger la mission' })
    expect(submit).toBeDisabled()
    await user.type(screen.getByLabelText(/Preuve/), 'Avenant n°2 signé')
    await user.click(submit)
    expect(extend.mock.calls[0]?.[0]).toEqual({ newEndsOn: '2027-03-31', proof: 'Avenant n°2 signé' })
  })

  it('Prolonger refuse une échéance qui ne dépasse pas l’actuelle', async () => {
    const user = userEvent.setup()
    render(<MissionLifecycleActions mission={mission()} />)
    await user.click(screen.getByRole('button', { name: 'Prolonger' }))
    await user.type(screen.getByLabelText('Nouvelle date de fin'), '2026-12-01')
    await user.type(screen.getByLabelText(/Preuve/), 'x')
    expect(screen.getByRole('button', { name: 'Prolonger la mission' })).toBeDisabled()
  })

  it('Terminer envoie la date de fin réelle et le motif', async () => {
    const user = userEvent.setup()
    render(<MissionLifecycleActions mission={mission()} />)
    await user.click(screen.getByRole('button', { name: 'Terminer' }))
    await user.type(screen.getByLabelText('Date de fin réelle'), '2026-11-30')
    await user.click(screen.getByRole('button', { name: 'Terminer la mission' }))
    expect(end.mock.calls[0]?.[0]).toEqual({ endedOn: '2026-11-30', reason: 'date_prevue' })
  })
})
