import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SendTiming } from '@bellum/contracts'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { SendTimingLine } from './SendTimingLine'

const { sendTiming } = vi.hoisted(() => ({ sendTiming: vi.fn() }))
vi.mock('@/features/actions/planItems.api', () => ({
  planItemsApi: { list: vi.fn(), mine: vi.fn(), update: vi.fn(), sendTiming },
}))
// Un identifiant par test : le cache de requêtes est partagé, une clé identique
// servirait la réponse du test précédent au lieu d'appeler le pont.
const session = vi.hoisted(() => ({ id: 'u0' }))
vi.mock('@/lib/hooks/use-session', () => ({ useSession: () => ({ user: { id: session.id } }) }))

function timing(channels: SendTiming['channels']): SendTiming {
  return { seniority: null, channels }
}

describe('SendTimingLine — #3289 (#3264.31/.32/.33)', () => {
  let run = 0
  beforeEach(() => {
    sendTiming.mockReset()
    session.id = `u${++run}`
  })

  it('dit le créneau appris avec ses COMPTES, jamais un pourcentage', async () => {
    sendTiming.mockResolvedValue(
      timing([
        {
          channel: 'email',
          attempts: 10,
          answered: 5,
          ignored: 0,
          best: { weekday: 'tuesday', band: 'morning', answered: 4, attempts: 4 },
          reason: null,
        },
      ]),
    )
    const { container } = renderWithRouter(<SendTimingLine />)
    expect(await screen.findByText(/E-mail : mardi matin/)).toBeInTheDocument()
    expect(container.textContent).toMatch(/4 sur 4/)
    expect(container.textContent).not.toMatch(/%/)
  })

  it('ne rend RIEN sans créneau mesuré — une absence ne fait aucune ligne', async () => {
    sendTiming.mockResolvedValue(
      timing([{ channel: 'phone', attempts: 2, answered: 1, ignored: 0, best: null, reason: 'not_enough_attempts' }]),
    )
    const { container } = renderWithRouter(<SendTimingLine />)
    await vi.waitFor(() => expect(sendTiming).toHaveBeenCalled())
    expect(container.querySelector('[data-slot="send-timing-line"]')).toBeNull()
  })

  it('ne rend RIEN si la lecture échoue — jamais un « aucun créneau » inventé', async () => {
    sendTiming.mockRejectedValue(new Error('boom'))
    const { container } = renderWithRouter(<SendTimingLine />)
    await vi.waitFor(() => expect(sendTiming).toHaveBeenCalled())
    expect(container.querySelector('[data-slot="send-timing-line"]')).toBeNull()
  })
})
