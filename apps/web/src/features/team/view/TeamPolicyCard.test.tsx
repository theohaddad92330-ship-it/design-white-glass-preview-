import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TeamPolicy } from '@bellum/contracts'

const apiFetch = vi.fn()
vi.mock('@/lib/api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const { TeamPolicyCard } = await import('./TeamPolicyCard')

const EMPTY: TeamPolicy = {
  prospectingWindows: [],
  forbiddenWindows: [],
  maxMeetingsPerDay: null,
  dailyCallTarget: null,
}
const SET: TeamPolicy = {
  prospectingWindows: [{ startMinute: 510, endMinute: 600 }],
  forbiddenWindows: [],
  maxMeetingsPerDay: 4,
  dailyCallTarget: null,
}

function renderCard(policy: TeamPolicy, canManage: boolean) {
  apiFetch.mockImplementation(async (request?: { path?: string; method?: string; body?: Partial<TeamPolicy> }) => {
    if (request?.path !== '/workspaces/team-policy') throw new Error(`unexpected ${String(request?.path)}`)
    return request.method === 'PATCH' ? { ...policy, ...request.body } : policy
  })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <TeamPolicyCard canManage={canManage} />
    </QueryClientProvider>,
  )
}

// Accolades : rendu tel quel, le mock serait pris pour une fonction de nettoyage et rappelé par vitest.
beforeEach(() => {
  apiFetch.mockReset()
})

// #2770.37 — la politique d'équipe, saisie par un gestionnaire (Réglages › Équipe), lue par Laura.
describe('TeamPolicyCard', () => {
  it('rien saisi se DIT, jamais un « 0 »', async () => {
    renderCard(EMPTY, false)
    expect(await screen.findByText(/Aucune politique d’équipe saisie/)).toBeInTheDocument()
    expect(screen.queryByText(/\b0\b/)).not.toBeInTheDocument()
  })

  it('un membre sans team:manage LIT la politique, sans aucun champ', async () => {
    renderCard(SET, false)
    expect(await screen.findByText('08:30–10:00')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Enregistrer la politique' })).not.toBeInTheDocument()
    expect(screen.getByText('Saisie par un gestionnaire de l’espace.')).toBeInTheDocument()
  })

  it('un gestionnaire ajoute un créneau interdit et un objectif d’appels — envoyés tels quels', async () => {
    renderCard(SET, true)
    const add = await screen.findAllByRole('button', { name: 'Ajouter une plage' })
    await userEvent.click(add[1] as HTMLElement)
    fireEvent.change(screen.getByLabelText('Début de la plage 1', { selector: '#team-policy-forbidden-0-start' }), {
      target: { value: '18:00' },
    })
    fireEvent.change(screen.getByLabelText('Fin de la plage 1', { selector: '#team-policy-forbidden-0-end' }), {
      target: { value: '20:00' },
    })
    fireEvent.change(screen.getByLabelText('Objectif d’appels par jour'), { target: { value: '20' } })
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer la politique' }))
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/workspaces/team-policy',
          method: 'PATCH',
          body: {
            prospectingWindows: [{ startMinute: 510, endMinute: 600 }],
            forbiddenWindows: [{ startMinute: 1080, endMinute: 1200 }],
            maxMeetingsPerDay: 4,
            dailyCallTarget: 20,
          },
        }),
      ),
    )
  })

  it('#2770.37 — un jour choisi sur une plage est envoyé en weekdays ; aucun jour = chaque jour, rien envoyé', async () => {
    renderCard(EMPTY, true)
    const add = await screen.findAllByRole('button', { name: 'Ajouter une plage' })
    await userEvent.click(add[1] as HTMLElement)
    const monday = screen.getByRole('button', { name: 'Lundi' })
    expect(monday).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(monday)
    await userEvent.click(screen.getByRole('button', { name: 'Mercredi' }))
    expect(monday).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer la politique' }))
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'PATCH',
          body: expect.objectContaining({ forbiddenWindows: [{ startMinute: 720, endMinute: 840, weekdays: [1, 3] }] }),
        }),
      ),
    )
  })

  // #2770.37 — recette R6 (14/10) : la plage par jour ne se lisait qu'en champs + pastilles de
  // jour pendant la SAISIE ; le libellé « 12:00–14:00 (lun.) » n'existait qu'en lecture seule
  // (sans `team:manage`). Un gestionnaire doit le lire À CÔTÉ des champs, sans les quitter.
  it('#2770.37 — la saisie lit aussi le libellé « 12:00–14:00 (lun.) » à côté des champs', async () => {
    renderCard(EMPTY, true)
    const add = await screen.findAllByRole('button', { name: 'Ajouter une plage' })
    await userEvent.click(add[1] as HTMLElement)
    expect(screen.queryByText('12:00–14:00')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Lundi' }))
    expect(screen.getByText('12:00–14:00 (lun.)')).toBeInTheDocument()
  })

  it('#2770.37 — la lecture seule nomme les jours d’une plage, et rien pour une plage de chaque jour', async () => {
    renderCard(
      {
        ...EMPTY,
        forbiddenWindows: [{ startMinute: 720, endMinute: 840, weekdays: [1, 5] }],
        prospectingWindows: [{ startMinute: 510, endMinute: 600 }],
      },
      false,
    )
    expect(await screen.findByText('12:00–14:00 (lun., ven.)')).toBeInTheDocument()
    expect(screen.getByText('08:30–10:00')).toBeInTheDocument()
  })

  it('#2770 — « Ajouter une plage » ouvre une ligne DÉJÀ valide, prise en compte à l’enregistrement sans autre saisie', async () => {
    renderCard(EMPTY, true)
    const add = await screen.findAllByRole('button', { name: 'Ajouter une plage' })
    await userEvent.click(add[1] as HTMLElement)
    expect(screen.getByLabelText('Début de la plage 1', { selector: '#team-policy-forbidden-0-start' })).toHaveValue(
      '12:00',
    )
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer la politique' }))
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'PATCH',
          body: expect.objectContaining({ forbiddenWindows: [{ startMinute: 720, endMinute: 840 }] }),
        }),
      ),
    )
  })

  it('refuse d’envoyer deux plages qui se chevauchent — le dit au lieu d’échouer en silence', async () => {
    renderCard(SET, true)
    const add = await screen.findAllByRole('button', { name: 'Ajouter une plage' })
    await userEvent.click(add[1] as HTMLElement)
    fireEvent.change(screen.getByLabelText('Début de la plage 1', { selector: '#team-policy-forbidden-0-start' }), {
      target: { value: '09:00' },
    })
    fireEvent.change(screen.getByLabelText('Fin de la plage 1', { selector: '#team-policy-forbidden-0-end' }), {
      target: { value: '11:00' },
    })
    expect(screen.getByText(/deux plages ne se chevauchent pas/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enregistrer la politique' })).toBeDisabled()
  })

  it('une plage se retire par un bouton NOMMÉ', async () => {
    renderCard(SET, true)
    await userEvent.click(await screen.findByRole('button', { name: 'Retirer la plage 08:30–10:00' }))
    expect(screen.queryByRole('button', { name: 'Retirer la plage 08:30–10:00' })).not.toBeInTheDocument()
  })
})
