import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { askLaura } from '@/features/chat/api/laura-turn'
import { usePlanFeature } from '@/features/plan-features/usePlanFeature'
import { resetLauraPageContext } from '@/features/laura/bubble/page-context-store'
import { LauraDock } from './LauraDock'

/**
 * #4066.6 — LA BULLE A LA MÊME FILE QUE /chat : un message tapé pendant la réponse attend son tour
 * (le hook `useSendQueue` est partagé), un échec suspend la file et le nomme.
 */

vi.mock('@/features/chat/api/laura-turn', () => ({ askLaura: vi.fn() }))
vi.mock('@/features/plan-features/usePlanFeature', () => ({
  usePlanFeature: vi.fn(() => ({ known: true, allowed: true })),
}))

const askLauraMock = vi.mocked(askLaura)

interface Turn {
  message: string
  resolve: () => void
  reject: (error: unknown) => void
}

function scriptTurns() {
  const turns: Turn[] = []
  askLauraMock.mockImplementation(
    ({ message }) =>
      new Promise((resolve, reject) => {
        turns.push({ message, resolve: () => resolve({ reply: `réponse à ${message}` }), reject })
      }),
  )
  return turns
}

beforeEach(() => {
  window.sessionStorage.clear()
  vi.mocked(usePlanFeature).mockImplementation(() => ({ known: true, allowed: true }))
})
afterEach(() => {
  askLauraMock.mockReset()
  resetLauraPageContext()
})

async function openDock() {
  fireEvent.click(await screen.findByRole('button', { name: /ouvrir/i }))
  return screen.findByPlaceholderText(/demande-moi/i)
}
function send(textarea: HTMLElement, text: string) {
  fireEvent.change(textarea, { target: { value: text } })
  fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }))
}

describe('#4066.6 — file d’attente dans la bulle Laura', () => {
  it('met en attente pendant la réponse, puis envoie dans l’ordre à la fin', async () => {
    const turns = scriptTurns()
    renderWithRouter(<LauraDock />)
    const textarea = await openDock()
    send(textarea, 'première')
    await waitFor(() => expect(turns).toHaveLength(1))

    send(textarea, 'seconde')
    const block = await screen.findByTestId('send-queue')
    expect(within(block).getByText('En attente · 1')).toBeInTheDocument()
    expect(textarea).toHaveValue('')
    expect(askLauraMock).toHaveBeenCalledTimes(1)

    turns[0]!.resolve()
    await waitFor(() => expect(turns).toHaveLength(2))
    expect(turns[1]!.message).toBe('seconde')
  })

  it('un échec suspend la file, le nomme, et « Reprendre » relance', async () => {
    const turns = scriptTurns()
    renderWithRouter(<LauraDock />)
    const textarea = await openDock()
    send(textarea, 'première')
    await waitFor(() => expect(turns).toHaveLength(1))
    send(textarea, 'seconde')
    await screen.findByTestId('send-queue')

    turns[0]!.reject(new Error('boom'))
    const suspension = await screen.findByTestId('send-queue-suspension')
    expect(suspension).toHaveTextContent(/La réponse en cours a échoué/)
    expect(askLauraMock).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Reprendre' }))
    await waitFor(() => expect(turns).toHaveLength(2))
    expect(turns[1]!.message).toBe('seconde')
  })

  it('un message en attente se retire', async () => {
    const turns = scriptTurns()
    renderWithRouter(<LauraDock />)
    const textarea = await openDock()
    send(textarea, 'première')
    await waitFor(() => expect(turns).toHaveLength(1))
    send(textarea, 'à retirer')
    await screen.findByTestId('send-queue')

    fireEvent.click(screen.getByRole('button', { name: 'Retirer le message en attente 1' }))
    expect(screen.queryByTestId('send-queue')).not.toBeInTheDocument()
    turns[0]!.resolve()
    await waitFor(() => expect(screen.queryByText('Laura réfléchit…')).not.toBeInTheDocument())
    expect(askLauraMock).toHaveBeenCalledTimes(1)
  })
})
