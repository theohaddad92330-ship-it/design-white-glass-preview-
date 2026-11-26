import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * #4406.4 — la carte Beeper : quatre états NOMMÉS, la saisie de l'URL hors de la grille, le guide
 * d'activation et l'avertissement de Beeper AVANT la saisie, la raison d'un refus sous le champ.
 */
const status = vi.hoisted(() => ({
  current: {
    configured: true,
    state: 'disconnected',
    baseUrl: null,
    tunnelDeclared: false,
    connectedAt: null,
  } as Record<string, unknown>,
}))
const connect = vi.hoisted(() => vi.fn())

vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }))
vi.mock('@/features/beeper/api', () => ({
  BEEPER_STATUS_KEY: ['beeper-status'],
  useBeeperStatus: () => ({ data: status.current, isLoading: false }),
  beeperApi: { connect, disconnect: vi.fn() },
}))

const { BeeperCard } = await import('./BeeperCard')

describe('la carte Beeper (#4406.4)', () => {
  beforeEach(() => {
    status.current = {
      configured: true,
      state: 'disconnected',
      baseUrl: null,
      tunnelDeclared: false,
      connectedAt: null,
    }
    connect.mockReset()
  })

  it('se NOMME (outil de l’utilisateur) et n’affiche aucun champ dans la grille', () => {
    render(<BeeperCard />)
    expect(screen.getByText('Beeper')).toBeInTheDocument()
    expect(document.querySelectorAll('input')).toHaveLength(0)
    expect(screen.getByRole('button', { name: /Connecter Beeper/i })).toBeInTheDocument()
  })

  it('#4406.6 — débranchée, la carte DIT « Non branché » (l’état se lit sans rien ouvrir)', () => {
    render(<BeeperCard />)
    expect(screen.getByTestId('beeper-state')).toHaveTextContent('Non branché.')
  })

  it('la saisie montre le guide (accès distant + tunnel) et l’avertissement de Beeper', async () => {
    render(<BeeperCard />)
    await userEvent.click(screen.getByRole('button', { name: /Connecter Beeper/i }))
    expect(screen.getByTestId('beeper-guide')).toHaveTextContent(/Accès distant/)
    expect(screen.getByTestId('beeper-guide')).toHaveTextContent(/tunnel/)
    expect(screen.getByTestId('beeper-warning')).toHaveTextContent(/envoyer des messages à ta place/)
    expect(screen.getByLabelText(/Adresse distante/)).toHaveAttribute('type', 'url')
  })

  it('un refus du serveur s’affiche sous le champ, la saisie survit', async () => {
    connect.mockRejectedValueOnce(new Error('Cible interne interdite.'))
    render(<BeeperCard />)
    await userEvent.click(screen.getByRole('button', { name: /Connecter Beeper/i }))
    await userEvent.type(screen.getByLabelText(/Adresse distante/), 'https://beeper.example.com')
    await userEvent.click(screen.getByRole('button', { name: /Continuer vers Beeper/i }))
    expect(await screen.findByTestId('beeper-refusal')).toHaveTextContent('Cible interne interdite.')
    expect(screen.getByLabelText(/Adresse distante/)).toHaveValue('https://beeper.example.com')
    expect(connect).toHaveBeenCalledWith({ baseUrl: 'https://beeper.example.com', tunnelDeclared: false })
  })

  it.each([
    ['connected', /Beeper Desktop répond/],
    ['unreachable', /fermé ou ton tunnel est coupé/],
    ['pending', /valide l'accès dans Beeper/],
  ])('état %s : NOMMÉ, jamais « connecté » par défaut', (state, text) => {
    status.current = {
      configured: true,
      state,
      baseUrl: 'https://beeper.example.com',
      tunnelDeclared: false,
      connectedAt: null,
    }
    render(<BeeperCard />)
    expect(screen.getByTestId('beeper-state')).toHaveTextContent(text)
    expect(screen.getByRole('button', { name: /Déconnecter/i })).toBeInTheDocument()
  })

  it('non proposé par le serveur : aucun bouton qui échouerait', () => {
    status.current = {
      configured: false,
      state: 'disconnected',
      baseUrl: null,
      tunnelDeclared: false,
      connectedAt: null,
    }
    render(<BeeperCard />)
    expect(screen.queryByRole('button', { name: /Connecter Beeper/i })).toBeNull()
  })

  // #4406.1 (Louis 23/10) — la carte Beeper faisait 595×648 px pour ~60 px de contenu : étirée à la hauteur de la
  // rangée, le bouton collé en bas. Elle prend la hauteur de son contenu, comme les cartes voisines.
  it('#4406.1 — la carte est à la hauteur de son contenu, jamais étirée à la rangée', () => {
    const { container } = render(<BeeperCard state="available" tools={[]} />)
    const card = container.firstElementChild as HTMLElement
    expect(card.className).toContain('self-start')
    expect(card.className).toContain('h-auto')
    expect(card.className).not.toMatch(/(^|\s)h-full(\s|$)/)
  })
})
