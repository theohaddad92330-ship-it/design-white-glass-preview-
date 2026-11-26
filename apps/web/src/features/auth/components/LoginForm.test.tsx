import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LoginForm } from './LoginForm'

const signIn = vi.fn()
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ signIn: (...a: unknown[]) => signIn(...a) }) }))
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  Link: ({ children }: { children: React.ReactNode }) => <a href="/forgot-password">{children}</a>,
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

beforeEach(() => signIn.mockReset())

// #3563.4 — recette prod 02/10 : « Se connecter » était inerte au 1er clic tant que
// l'autoremplissage du navigateur n'avait pas « hydraté » les champs (aucun
// évènement `input` avant un geste → `isValid` restait faux → bouton désactivé).
describe('#3563.4 — LoginForm et l’autoremplissage', () => {
  it('le bouton n’est jamais désactivé par la validité : le clic part toujours', () => {
    render(<LoginForm />)
    expect(screen.getByRole('button', { name: /se connecter/i })).toBeEnabled()
  })

  it('des champs remplis SANS évènement input (autoremplissage) partent au 1er clic', async () => {
    signIn.mockResolvedValue({ status: 'signed_in' })
    render(<LoginForm />)
    const email = screen.getByLabelText(/^email/i) as HTMLInputElement
    const password = screen.getByPlaceholderText('••••••••') as HTMLInputElement
    // Valeur posée dans le DOM sans `input`/`change` : exactement l'autoremplissage.
    email.value = 'marie@acme.fr'
    password.value = 'secret-123'
    fireEvent.click(screen.getByRole('button', { name: /se connecter/i }))
    await waitFor(() => expect(signIn).toHaveBeenCalledWith('marie@acme.fr', 'secret-123'), { timeout: 4000 })
  })

  // Chrome ne livre le mot de passe autorempli qu'À l'instant du premier geste : au `submit`
  // le DOM est encore vide, la valeur arrive juste après.
  it('un champ vide au submit mais rempli un instant après est relu avant de valider', async () => {
    signIn.mockResolvedValue({ status: 'signed_in' })
    render(<LoginForm />)
    const email = screen.getByLabelText(/^email/i) as HTMLInputElement
    const password = screen.getByPlaceholderText('••••••••') as HTMLInputElement
    email.value = 'marie@acme.fr'
    fireEvent.click(screen.getByRole('button', { name: /se connecter/i }))
    setTimeout(() => {
      password.value = 'secret-123'
    }, 20)
    await waitFor(() => expect(signIn).toHaveBeenCalledWith('marie@acme.fr', 'secret-123'), { timeout: 4000 })
  })

  it('formulaire vide : le clic NOMME ce qui manque, il n’appelle pas signIn', async () => {
    render(<LoginForm />)
    fireEvent.click(screen.getByRole('button', { name: /se connecter/i }))
    await waitFor(() => expect(screen.getAllByRole('alert').length).toBeGreaterThan(0))
    expect(signIn).not.toHaveBeenCalled()
  })

  // G02.1 (recette prod 09/10) — un GESTIONNAIRE DE MOTS DE PASSE (extension) peut
  // écrire le mot de passe plusieurs centaines de ms après le clic, largement
  // au-delà de l'autoremplissage NATIF (20 ms, déjà couvert plus haut). Avant ce
  // correctif, un seul délai fixe de 80 ms soumettait un mot de passe encore vide
  // au 1er clic — la personne devait cliquer une seconde fois. Un seul clic doit
  // désormais suffire, même à 300 ms.
  it('un gestionnaire de mots de passe qui remplit 300ms après le clic part au 1er clic', async () => {
    signIn.mockResolvedValue({ status: 'signed_in' })
    render(<LoginForm />)
    const email = screen.getByLabelText(/^email/i) as HTMLInputElement
    const password = screen.getByPlaceholderText('••••••••') as HTMLInputElement
    email.value = 'marie@acme.fr'
    fireEvent.click(screen.getByRole('button', { name: /se connecter/i }))
    setTimeout(() => {
      password.value = 'secret-123'
    }, 300)
    await waitFor(() => expect(signIn).toHaveBeenCalledWith('marie@acme.fr', 'secret-123'), { timeout: 4000 })
  })
})
