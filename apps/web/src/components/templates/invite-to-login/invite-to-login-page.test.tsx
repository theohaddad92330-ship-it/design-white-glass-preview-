import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { InviteToLoginPage } from './invite-to-login-page'

const navigate = vi.hoisted(() => vi.fn())
vi.mock('@tanstack/react-router', async importOriginal => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  useNavigate: () => navigate,
}))

describe("InviteToLoginPage — l'entrée sans session dans la coque d'accès", () => {
  it('h1 hors de la carte, les deux gestes dans la carte, l’itinéraire à côté', () => {
    render(<InviteToLoginPage />)
    const heading = screen.getByTestId('access-heading')
    expect(within(heading).getByRole('heading', { level: 1 })).toBeTruthy()
    const card = screen.getByTestId('access-card')
    const [signIn, signUp] = within(card).getAllByRole('button')
    expect(within(card).getAllByRole('listitem')).toHaveLength(3)
    fireEvent.click(signIn!)
    expect(navigate).toHaveBeenLastCalledWith({ to: '/login' })
    fireEvent.click(signUp!)
    expect(navigate).toHaveBeenLastCalledWith({ to: '/signup' })
  })
})
