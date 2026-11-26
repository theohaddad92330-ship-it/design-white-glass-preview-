import type { Contact, LinkedInSendStatusView } from '@bellum/contracts'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { LinkedinDelegationCard } from './LinkedinDelegationCard'

/**
 * #4737 K2 — l'écran de l'envoi LinkedIn délégué. Il dit la vérité du serveur : mandat, bornes, reste du jour,
 * et « voie d'envoi non ouverte » tant que la voie ne l'est pas — jamais un bouton qui promet un envoi impossible.
 */
const BODY = 'CORPS-ECRIT-DANS-LE-TEST-7c1'
const hooks = vi.hoisted(() => ({
  status: { data: undefined, isLoading: false, isError: false, refetch: vi.fn() } as {
    data: LinkedInSendStatusView | undefined
    isLoading: boolean
    isError: boolean
    refetch: () => void
  },
  grant: vi.fn(),
  revoke: vi.fn(),
  send: vi.fn(),
  sendResult: { current: undefined as unknown },
}))
vi.mock('@/features/linkedin/send', () => ({
  useLinkedinSendStatus: () => hooks.status,
  useGrantLinkedinMandate: () => ({ mutate: hooks.grant, isPending: false }),
  useRevokeLinkedinMandate: () => ({ mutate: hooks.revoke, isPending: false }),
  useSendLinkedinMessage: () => ({ mutate: hooks.send, isPending: false, data: hooks.sendResult.current }),
}))

const contact = { id: 'c1', full_name: 'Jean Dupont', linkedin_url: 'https://www.linkedin.com/in/jd' } as Contact
const mandate = {
  id: 'm1',
  grantedAt: '2026-10-29T08:00:00.000Z',
  validFrom: '2026-10-29T08:00:00.000Z',
  validUntil: '2026-11-28T08:00:00.000Z',
  dailyLimit: 25,
  revokedAt: null,
  active: true,
}
const status = (over: Partial<LinkedInSendStatusView> = {}): LinkedInSendStatusView => ({
  mandate: null,
  dailyLimit: 25,
  sentToday: 0,
  remainingToday: 0,
  routeOpen: true,
  ...over,
})
const show = () => render(<LinkedinDelegationCard contact={contact} text={BODY} />)

describe('LinkedinDelegationCard — les états', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    Object.assign(hooks.status, { data: undefined, isLoading: false, isError: false })
    hooks.sendResult.current = undefined
    vi.clearAllMocks()
  })

  it('chargement : un état dit, pas un blanc', () => {
    hooks.status.isLoading = true
    show()
    expect(screen.getByText('Chargement du mandat d’envoi…')).toBeInTheDocument()
  })

  it('erreur : message clair et « Réessayer »', async () => {
    hooks.status.isError = true
    show()
    await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }))
    expect(hooks.status.refetch).toHaveBeenCalled()
  })

  it('voie non ouverte : le dit, et ne propose AUCUN bouton d’envoi ni de mandat', () => {
    hooks.status.data = status({ routeOpen: false })
    show()
    expect(screen.getByText('Voie d’envoi non ouverte')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Envoyer/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Donner un mandat/ })).toBeNull()
  })

  it('voie non ouverte AVEC un mandat existant : le mandat reste lisible, toujours sans bouton d’envoi', () => {
    hooks.status.data = status({ routeOpen: false, mandate, remainingToday: 25 })
    show()
    expect(screen.getByText('Voie d’envoi non ouverte')).toBeInTheDocument()
    expect(screen.getByText(/25 par jour/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Envoyer/ })).toBeNull()
  })

  it('voie ouverte, aucun mandat : l’état vide propose le mandat, rien d’autre', async () => {
    hooks.status.data = status()
    show()
    expect(screen.getByText(/Aucun mandat/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Envoyer/ })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: /Donner un mandat/ }))
    expect(hooks.grant).toHaveBeenCalledTimes(1)
    expect(hooks.grant.mock.calls[0]?.[0]).toEqual({ validUntil: expect.any(String) })
  })

  it('mandat actif : période, borne, reste du jour — et l’envoi envoie le corps, une fois', async () => {
    hooks.status.data = status({ mandate, sentToday: 3, remainingToday: 22 })
    show()
    expect(screen.getByText(/25 par jour/)).toBeInTheDocument()
    expect(screen.getByText('Reste aujourd’hui : 22 sur 25')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Envoyer ce message/ }))
    expect(hooks.send).toHaveBeenCalledWith({ contactId: 'c1', body: BODY })
    await userEvent.click(screen.getByRole('button', { name: /Révoquer/ }))
    expect(hooks.revoke).toHaveBeenCalledWith('m1')
  })

  it('quota du jour atteint : l’envoi est désactivé et la raison dite', () => {
    hooks.status.data = status({ mandate, sentToday: 25, remainingToday: 0 })
    show()
    expect(screen.getByRole('button', { name: /Envoyer ce message/ })).toBeDisabled()
    expect(screen.getByText('Reste aujourd’hui : 0 sur 25')).toBeInTheDocument()
  })

  it('mandat révoqué : dit la révocation, ne propose pas d’envoyer', () => {
    hooks.status.data = status({ mandate: { ...mandate, active: false, revokedAt: '2026-10-29T09:00:00.000Z' } })
    show()
    expect(screen.getByText(/Mandat révoqué/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Envoyer ce message/ })).toBeNull()
  })

  it('un envoi réussi dit la preuve ; un envoi incertain dit de ne pas renvoyer ; un refus se nomme', () => {
    hooks.status.data = status({ mandate, remainingToday: 5 })
    const cases: [unknown, RegExp][] = [
      [{ id: 's', status: 'sent', reason: null, proofVerified: true, createdAt: '2026-10-29T10:00:00.000Z' }, /preuve/],
      [
        { id: 's', status: 'unknown', reason: null, proofVerified: false, createdAt: '2026-10-29T10:00:00.000Z' },
        /ne le renvoie pas/i,
      ],
      [
        {
          id: 's',
          status: 'refused',
          reason: 'recipient_replied',
          proofVerified: false,
          createdAt: '2026-10-29T10:00:00.000Z',
        },
        /a répondu/,
      ],
      [
        { id: 's', status: 'refused', reason: 'demo', proofVerified: false, createdAt: '2026-10-29T10:00:00.000Z' },
        /démonstration/,
      ],
      [
        { id: 's', status: 'failed', reason: null, proofVerified: false, createdAt: '2026-10-29T10:00:00.000Z' },
        /refusé/,
      ],
    ]
    for (const [result, expected] of cases) {
      hooks.sendResult.current = result
      const { unmount } = show()
      expect(screen.getByRole('status').textContent).toMatch(expected)
      unmount()
    }
  })

  it('le corps du message n’est jamais affiché par la carte', () => {
    hooks.status.data = status({ mandate, remainingToday: 5 })
    hooks.sendResult.current = {
      id: 's',
      status: 'sent',
      reason: null,
      proofVerified: true,
      createdAt: '2026-10-29T10:00:00.000Z',
    }
    const { container } = show()
    expect(container.textContent).not.toContain(BODY)
  })

  it('anglais : la même carte, les mêmes états', async () => {
    await i18n.changeLanguage('en')
    hooks.status.data = status({ routeOpen: false })
    show()
    expect(screen.getByText('Sending route not open')).toBeInTheDocument()
  })
})
