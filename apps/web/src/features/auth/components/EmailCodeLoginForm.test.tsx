import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, vi } from 'vitest'
import { EmailCodeLoginForm } from './EmailCodeLoginForm'

/**
 * ⚠️ Le champ à six cases arme TROIS minuteurs, et le dernier survit au test.
 *
 * `input-otp` planifie sa synchronisation de sélection à **0, 10 et 50 ms**
 * (`dist/index.js`, `setTimeout(e,0)` / `(e,10)` / `(e,50)`). Le fichier de test
 * se termine bien avant les 50 ms : le minuteur se déclenche **après** le
 * démontage de jsdom, `window` n'existe plus, et vitest sort en **1** avec
 * « ReferenceError: window is not defined » — alors que **les 1 106 tests du
 * shard sont VERTS**. Un rouge qui n'accuse aucun test est le pire à lire, et
 * ce dépôt l'a déjà payé une fois (« vitest sort en 1 sans test rouge »).
 *
 * On démonte donc explicitement, puis on laisse passer le plus long des trois
 * minuteurs **pendant que le DOM existe encore**. Aucune assertion n'est
 * touchée ; c'est le démontage qui devient déterministe.
 */
const OTP_MIRROR_TIMERS_MS = 60

afterEach(async () => {
  cleanup()
  await new Promise(resolve => setTimeout(resolve, OTP_MIRROR_TIMERS_MS))
})

const requestOtp = vi.fn().mockResolvedValue(undefined)
const verifyOtp = vi.fn()

vi.mock('@/features/auth/session-manager', () => ({
  sessionManager: {
    requestOtp: (email: string) => requestOtp(email),
    verifyOtp: (email: string, code: string) => verifyOtp(email, code),
  },
}))

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

describe('EmailCodeLoginForm', () => {
  beforeEach(() => {
    requestOtp.mockClear()
    verifyOtp.mockClear()
  })

  it('renders the email step first', () => {
    render(<EmailCodeLoginForm onMfaRequired={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByRole('heading', { name: 'Se connecter avec un code' })).toBeInTheDocument()
  })

  it('requests a code and advances to the 6-digit step', async () => {
    render(<EmailCodeLoginForm onMfaRequired={vi.fn()} onCancel={vi.fn()} />)

    fireEvent.change(screen.getByPlaceholderText('tu@entreprise.com'), { target: { value: 'sales@esn.fr' } })
    fireEvent.click(screen.getByRole('button', { name: /Envoyer le code/i }))

    expect(requestOtp).toHaveBeenCalledWith('sales@esn.fr')
    expect(await screen.findByRole('heading', { name: 'Entre ton code' })).toBeInTheDocument()
  })

  it('does not request a code for an invalid email', () => {
    render(<EmailCodeLoginForm onMfaRequired={vi.fn()} onCancel={vi.fn()} />)

    fireEvent.change(screen.getByPlaceholderText('tu@entreprise.com'), { target: { value: 'not-an-email' } })
    fireEvent.click(screen.getByRole('button', { name: /Envoyer le code/i }))

    expect(requestOtp).not.toHaveBeenCalled()
  })

  it('returns to password login via the cancel action', () => {
    const onCancel = vi.fn()
    render(<EmailCodeLoginForm onMfaRequired={vi.fn()} onCancel={onCancel} />)

    fireEvent.click(screen.getByRole('button', { name: /Utiliser un mot de passe/i }))
    expect(onCancel).toHaveBeenCalled()
  })
})
