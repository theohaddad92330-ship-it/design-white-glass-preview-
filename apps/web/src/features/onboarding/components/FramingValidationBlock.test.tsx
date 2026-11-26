import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OnboardingStateResponse } from '@bellum/contracts'
import { TEMPS1_REQUIRED_KEYS } from '@bellum/contracts'
import { useOnboardingStore } from '@/stores/onboardingStore'
import { ApiError } from '@/lib/api-error'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { FramingValidationBlock } from './FramingValidationBlock'

/**
 * #4817 — le cul-de-sac de VERHELIA : « il manque encore des réponses
 * essentielles » sans en nommer une seule, et sans y renvoyer.
 */

const { mockUseOnboardingState, mockUseFraming, completeAsync, validateAsync } = vi.hoisted(() => ({
  mockUseOnboardingState: vi.fn(),
  mockUseFraming: vi.fn(),
  completeAsync: vi.fn(),
  validateAsync: vi.fn(),
}))

vi.mock('@/features/onboarding/hooks/useOnboarding', () => ({
  useOnboardingState: () => mockUseOnboardingState(),
  useCompleteOnboarding: () => ({ mutateAsync: completeAsync, isPending: false }),
}))

vi.mock('@/features/onboarding/hooks/useFraming', () => ({
  useFraming: () => mockUseFraming(),
  useValidateFraming: () => ({ mutateAsync: validateAsync, isPending: false }),
}))

// L'empreinte passe par `crypto.subtle` : simulée, ce lot porte sur la branche d'ERREUR.
vi.mock('@/features/onboarding/lib/framing-readout', () => ({
  framingDigest: () => Promise.resolve('digest-du-cadrage'),
}))

const state = (over: Partial<OnboardingStateResponse> = {}): OnboardingStateResponse =>
  ({
    id: '5f898604-e2bf-4abe-a4bd-2bedd009f4a2',
    status: 'in_progress',
    stages: [],
    answers: {},
    awaiting_company_admin: null,
    ...over,
  }) as unknown as OnboardingStateResponse

/** Le cas de Hicham : cadrage DÉJÀ validé pour cette empreinte. */
const validatedFraming = {
  validated_at: '2026-10-29T09:00:00.000Z',
  validated_digest: 'digest-du-cadrage',
  decisions: {},
}

function fillAllButTwo(): void {
  const store = useOnboardingStore.getState()
  for (const key of TEMPS1_REQUIRED_KEYS) {
    if (key === 'positioning' || key === 'geo_zones') continue
    store.setAnswer(key, 'renseigné')
  }
}

beforeEach(() => {
  useOnboardingStore.getState().reset()
  mockUseOnboardingState.mockReset()
  mockUseFraming.mockReset()
  completeAsync.mockReset()
  validateAsync.mockReset()
  mockUseOnboardingState.mockReturnValue({ data: state() })
  mockUseFraming.mockReturnValue({ data: validatedFraming })
  validateAsync.mockResolvedValue(undefined)
  completeAsync.mockResolvedValue(state({ status: 'completed' }))
})

describe('#4817 — la phrase de blocage nomme chaque réponse manquante et y renvoie', () => {
  it('nomme les réponses manquantes, sans attendre que l’utilisateur reclique', async () => {
    fillAllButTwo()
    render(<FramingValidationBlock onLaunch={vi.fn()} onCorrect={vi.fn()} onGoToQuestion={vi.fn()} />)

    expect(await screen.findByText(/Quel est ton positionnement principal/)).toBeInTheDocument()
    expect(screen.getByText(/Ta zone géographique principale/)).toBeInTheDocument()
    // Jamais le nom de colonne nu.
    expect(screen.queryByText(/geo_zones|positioning/)).toBeNull()
  })

  it('y renvoie d’un clic : chaque réponse nommée ouvre la sous-étape qui la pose', async () => {
    fillAllButTwo()
    const onGoToQuestion = vi.fn()
    render(<FramingValidationBlock onLaunch={vi.fn()} onCorrect={vi.fn()} onGoToQuestion={onGoToQuestion} />)

    fireEvent.click(await screen.findByRole('button', { name: /Quel est ton positionnement principal/ }))
    expect(onGoToQuestion).toHaveBeenCalledWith({ stage: expect.any(String), slug: expect.any(String) })
    expect(onGoToQuestion.mock.calls[0]?.[0]?.slug).toBeTruthy()
  })

  it('rien ne manque ⇒ aucun blocage, aucune ligne (GA-18)', async () => {
    for (const key of TEMPS1_REQUIRED_KEYS) useOnboardingStore.getState().setAnswer(key, 'renseigné')
    render(<FramingValidationBlock onLaunch={vi.fn()} onCorrect={vi.fn()} onGoToQuestion={vi.fn()} />)

    expect(await screen.findByText(/Cadrage validé le/)).toBeInTheDocument()
    expect(screen.queryByText(/il manque/i)).toBeNull()
    expect(screen.queryByTestId('framing-missing-essentials')).toBeNull()
  })

  it('une complétion qui échoue SANS réponse manquante ne prétend pas qu’il en manque', async () => {
    for (const key of TEMPS1_REQUIRED_KEYS) useOnboardingStore.getState().setAnswer(key, 'renseigné')
    completeAsync.mockRejectedValue(new Error('503 — enregistrement impossible'))
    render(<FramingValidationBlock onLaunch={vi.fn()} onCorrect={vi.fn()} onGoToQuestion={vi.fn()} />)

    fireEvent.click(await screen.findByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: /Valider et préparer mon premier travail/ }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent ?? '').not.toMatch(/réponses essentielles/)
    expect(alert.textContent ?? '').toMatch(/n’a pas pu être enregistrée|réessaie/i)
  })

  it('garde #4158.12 — un membre qui attend son administrateur ne voit que ses clés personnelles', async () => {
    mockUseOnboardingState.mockReturnValue({ data: state({ awaiting_company_admin: { admin_name: 'Marie Curie' } }) })
    render(<FramingValidationBlock onLaunch={vi.fn()} onCorrect={vi.fn()} onGoToQuestion={vi.fn()} />)

    await waitFor(() => expect(screen.getByTestId('framing-missing-essentials')).toBeInTheDocument())
    // `esn_name` est une clé ENTREPRISE : l'API l'ignorerait, on ne la lui demande pas.
    expect(screen.queryByText(/Quel est le nom de ton ESN|nom de ton ESN/)).toBeNull()
  })
})

describe('#4817 — un refus du serveur NOMME ses clés manquantes (code + clés en donnée)', () => {
  it('relie les clés que la liste du client ignorait (écart client/serveur, #4875)', async () => {
    for (const key of TEMPS1_REQUIRED_KEYS) useOnboardingStore.getState().setAnswer(key, 'renseigné')
    completeAsync.mockRejectedValue(
      new ApiError('Réponses manquantes : esn_name, geo_zones', 400, 'incomplete', {
        missing: ['esn_name', 'geo_zones'],
      }),
    )
    renderWithRouter(<FramingValidationBlock onLaunch={vi.fn()} onCorrect={vi.fn()} onGoToQuestion={vi.fn()} />)

    fireEvent.click(await screen.findByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: /Valider et préparer mon premier travail/ }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('il manque encore ces réponses essentielles')
    const links = await screen.findAllByRole('link')
    expect(links).toHaveLength(2)
    expect(links[0]?.textContent).not.toContain('esn_name')
    expect(links[0]?.getAttribute('href')).toContain('/onboarding/5f898604-e2bf-4abe-a4bd-2bedd009f4a2/')
    expect(links[0]?.getAttribute('href')).not.toBe(links[1]?.getAttribute('href'))
  })
})

// #4875.3 — le test qui sait dire NON : une relecture qui NOMME un manque ⇒ le cadrage ne peut pas passer complet.
describe('#4875.3 — un manque nommé interdit de déclarer le cadrage complet', () => {
  it('le bouton reste inactif tant qu’une réponse exigée est nommée manquante, case cochée ou non', async () => {
    fillAllButTwo()
    render(<FramingValidationBlock onLaunch={vi.fn()} onCorrect={vi.fn()} onGoToQuestion={vi.fn()} />)

    fireEvent.click(await screen.findByRole('checkbox'))
    const cta = screen.getByRole('button', { name: /Valider et préparer mon premier travail/ })
    expect(cta).toBeDisabled()
    fireEvent.click(cta)
    expect(validateAsync).not.toHaveBeenCalled()
    expect(completeAsync).not.toHaveBeenCalled()
  })

  it('« Je ne sais pas encore » sur une liste exigée est NOMMÉ comme déclaré, et bloque quand même', async () => {
    for (const key of TEMPS1_REQUIRED_KEYS) useOnboardingStore.getState().setAnswer(key, 'renseigné')
    useOnboardingStore.getState().setAnswer('geo_zones', [])
    useOnboardingStore.getState().setStatus('geo_zones', 'not_yet_known')
    render(<FramingValidationBlock onLaunch={vi.fn()} onCorrect={vi.fn()} onGoToQuestion={vi.fn()} />)

    const list = await screen.findByTestId('framing-missing-essentials')
    expect(list.textContent).toContain('Ta zone géographique principale')
    expect(list.textContent).toMatch(/Je ne sais pas encore/)
    fireEvent.click(screen.getByRole('checkbox'))
    expect(screen.getByRole('button', { name: /Valider et préparer mon premier travail/ })).toBeDisabled()
  })

  it('rien ne manque ⇒ le bouton s’active une fois la case cochée', async () => {
    for (const key of TEMPS1_REQUIRED_KEYS) useOnboardingStore.getState().setAnswer(key, 'renseigné')
    render(<FramingValidationBlock onLaunch={vi.fn()} onCorrect={vi.fn()} onGoToQuestion={vi.fn()} />)
    fireEvent.click(await screen.findByRole('checkbox'))
    expect(screen.getByRole('button', { name: /Valider et préparer mon premier travail/ })).toBeEnabled()
  })
})
