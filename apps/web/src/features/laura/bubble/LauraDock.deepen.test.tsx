import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LauraPageContext } from '@bellum/contracts'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { askLaura } from '@/features/chat/api/laura-turn'
import { LauraDock } from './LauraDock'
import { resetLauraPageContext, useLauraContext } from './page-context-store'

/**
 * #2452.1 / épopée #2907 — « APPROFONDIR » SUR TOUTE RÉPONSE DE LAURA.
 *
 * Le repli « Aller plus loin sur cette réponse » (`DeepenActions`) n'existait
 * que sous les réponses de l'écran `/chat`. La bulle — la MÊME Laura, une autre
 * porte — rendait une analyse de compte sans aucun moyen de l'approfondir.
 * Un seul mécanisme : le même composant, la même règle (`accountIdsInReply`,
 * repli sur le compte du tour), le même devis serveur.
 *
 * `askLaura` est mocké : aucun message de test ne part vers le modèle.
 */
vi.mock('@/features/chat/api/laura-turn', () => ({ askLaura: vi.fn() }))
vi.mock('@/features/plan-features/usePlanFeature', () => ({
  usePlanFeature: vi.fn(() => ({ known: true, allowed: true })),
}))
const askLauraMock = vi.mocked(askLaura)
const demoFlag = { current: false }
vi.mock('@/features/demo/useIsDemo', () => ({ useIsDemo: () => demoFlag.current }))

const ACCOUNT = '11111111-2222-3333-4444-555555555555'
// #5032.14 — le repli « Aller plus loin » est retiré : l'approfondissement s'atteint par Ajuster › Approfondir (avec devis).
const TOGGLE = /ajuster cette réponse/i

afterEach(() => {
  askLauraMock.mockReset()
  resetLauraPageContext()
  demoFlag.current = false
})

function OnAccountScreen() {
  const context: LauraPageContext = {
    kind: 'account',
    label: 'Groupe Vallée — dossier de compte',
    entityId: ACCOUNT,
    facets: [],
    state: 'ready',
  }
  useLauraContext(context)
  return null
}

async function openAndAsk(question: string) {
  fireEvent.click(await screen.findByRole('button', { name: /ouvrir/i }))
  fireEvent.change(await screen.findByPlaceholderText(/demande-moi/i), { target: { value: question } })
  fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }))
}

describe('LauraDock — approfondir une réponse de la bulle (#2452.1)', () => {
  it('propose « Ajuster › Approfondir (avec devis) » sous une réponse qui cite un compte', async () => {
    askLauraMock.mockResolvedValueOnce({ reply: `Commence par [Acme](/accounts/${ACCOUNT}).` })
    renderWithRouter(<LauraDock />)
    await openAndAsk('Par où je commence ?')

    await waitFor(() => expect(screen.getByRole('button', { name: TOGGLE })).toBeInTheDocument())
    // Une seule fois : sous la réponse, jamais sous la question.
    expect(screen.getAllByRole('button', { name: TOGGLE })).toHaveLength(1)
    // #5032.12 — le même moteur : Ajuster › « Approfondir (avec devis) » ouvre le devis (#2452).
    await userEvent.click(screen.getByRole('button', { name: TOGGLE }))
    expect(await screen.findByRole('menuitem', { name: 'Approfondir (avec devis)' })).toBeInTheDocument()
  })

  it('se replie sur le compte de l’écran quand la réponse n’en cite aucun', async () => {
    askLauraMock.mockResolvedValueOnce({ reply: 'Le décideur est la DSI.' })
    renderWithRouter(
      <>
        <OnAccountScreen />
        <LauraDock />
      </>,
    )
    await openAndAsk('Qui décide ?')

    await waitFor(() => expect(screen.getByRole('button', { name: TOGGLE })).toBeInTheDocument())
  })

  it('ne propose RIEN sans compte : ni cité, ni à l’écran', async () => {
    askLauraMock.mockResolvedValueOnce({ reply: 'Bonjour, que puis-je faire ?' })
    const { container } = renderWithRouter(<LauraDock />)
    await openAndAsk('Salut')

    await waitFor(() => expect(container.textContent).toContain('que puis-je faire'))
    expect(screen.queryByRole('button', { name: TOGGLE })).toBeNull()
  })

  it('ne propose RIEN sous un échec, même sur l’écran d’un compte', async () => {
    askLauraMock.mockRejectedValueOnce(new Error('boom'))
    renderWithRouter(
      <>
        <OnAccountScreen />
        <LauraDock />
      </>,
    )
    await openAndAsk('Qui décide ?')

    await waitFor(() => expect(screen.getByText(/erreur de connexion/i)).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: TOGGLE })).toBeNull()
  })

  it('en salle de démonstration aussi (craft rule n°9) : la réponse écrite d’avance s’approfondit', async () => {
    demoFlag.current = true
    renderWithRouter(
      <>
        <OnAccountScreen />
        <LauraDock />
      </>,
    )
    await openAndAsk('Quels signaux justifient de prioriser Thales ?')

    await waitFor(() => expect(screen.getByRole('button', { name: TOGGLE })).toBeInTheDocument())
    expect(askLauraMock).not.toHaveBeenCalled()
  })
})
