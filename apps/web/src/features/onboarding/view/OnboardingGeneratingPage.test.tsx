import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { fireEvent, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { useOnboardingStore } from '@/stores/onboardingStore'
import { OnboardingGeneratingPage } from './OnboardingGeneratingPage'

const ONBOARDING_ID = '0a3c1861-840d-4606-8324-5fbea19bafff'

const { mockNavigate, mockUseGenerateAuditPhases, mockRetryVerify, mockRetryBuild, mockUseProfileContext } = vi.hoisted(
  () => ({
    mockNavigate: vi.fn(),
    mockUseGenerateAuditPhases: vi.fn(),
    mockRetryVerify: vi.fn(),
    mockRetryBuild: vi.fn(),
    mockUseProfileContext: vi.fn(),
  }),
)

vi.mock('@tanstack/react-router', async importOriginal => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  useNavigate: () => mockNavigate,
  useParams: () => ({ id: ONBOARDING_ID }),
}))

vi.mock('@/features/onboarding/hooks/useGenerateAuditPhases', () => ({
  useGenerateAuditPhases: () => mockUseGenerateAuditPhases(),
}))

// #2091.39 — la troisième mention de fin (« Tes premières actions sont
// prêtes ») dépend des VRAIES suggestions du profil de contexte : le même
// hook que `/welcome`, jamais une valeur devinée ici.
vi.mock('@/features/profile-context/hooks/useProfileContext', () => ({
  useProfileContext: () => mockUseProfileContext(),
}))

const ALL_PENDING = {
  verify: 'pending',
  buildProfile: 'pending',
  market: 'pending',
  offer: 'pending',
  plan: 'pending',
  persist: 'pending',
} as const

beforeEach(() => {
  useOnboardingStore.getState().reset()
  mockNavigate.mockClear()
  mockRetryVerify.mockClear()
  mockRetryBuild.mockClear()
  mockUseGenerateAuditPhases.mockReturnValue({
    phases: ALL_PENDING,
    failedPhase: null,
    succeeded: false,
    retryVerify: mockRetryVerify,
    retryBuild: mockRetryBuild,
  })
  mockUseProfileContext.mockReturnValue({ data: undefined })
})

describe('#2089.28 — titre personnalisé', () => {
  it('nomme l’ESN quand la réponse est connue', async () => {
    useOnboardingStore.getState().setAnswer('esn_name', 'Kicklox')
    renderWithRouter(<OnboardingGeneratingPage />)
    expect(await screen.findByText("On prépare l'audit de Kicklox")).toBeInTheDocument()
  })

  it('reste GÉNÉRIQUE plutôt que d’inventer un nom', async () => {
    renderWithRouter(<OnboardingGeneratingPage />)
    expect(await screen.findByText('On prépare ton audit')).toBeInTheDocument()
  })
})

describe('#2089.32/.26 — quitter sans perdre le travail, aucune action externe', () => {
  it('affiche les deux mentions', async () => {
    renderWithRouter(<OnboardingGeneratingPage />)
    expect(await screen.findByText(/Tu peux quitter cette page/)).toBeInTheDocument()
    expect(screen.getByText(/Aucune action externe/)).toBeInTheDocument()
  })

  /**
   * #2537.2 — Ludovic (call bêta 17/09) : « impossible de quitter l'onboarding
   * ou d'accéder au produit » pendant que son audit générait. L'écran
   * DISAIT « tu peux quitter cette page » (#2089.32) mais n'offrait AUCUN
   * moyen de le faire — ni lien ni bouton, seulement une phrase. Même
   * mécanisme que `OnboardingReviewPage.tsx` (#2089.27) : un lien réel vers
   * `/dashboard`, le travail continue côté serveur.
   */
  it('#2537.2 — la phrase est tenue par un lien RÉEL vers le tableau de bord', async () => {
    renderWithRouter(<OnboardingGeneratingPage />)
    const quit = await screen.findByRole('link', { name: 'Quitter' })
    expect(quit).toHaveAttribute('href', '/briefing')
  })
})

describe('#2089.33 — quatre thèmes réels', () => {
  it('affiche Organisation, Offre, Marché, Objectifs — repris du récapitulatif', async () => {
    renderWithRouter(<OnboardingGeneratingPage />)
    for (const label of ['Organisation', 'Offre', 'Marché', 'Objectifs']) {
      expect(await screen.findByText(label)).toBeInTheDocument()
    }
  })
})

describe('#2089.29/.30/.31 — six phases, statut catégoriel, aucun pourcentage', () => {
  it('rend les six phases avec leur statut', async () => {
    mockUseGenerateAuditPhases.mockReturnValue({
      phases: {
        ...ALL_PENDING,
        verify: 'done',
        buildProfile: 'inProgress',
        market: 'inProgress',
        offer: 'inProgress',
        plan: 'inProgress',
        persist: 'inProgress',
      },
      failedPhase: null,
      succeeded: false,
      retryVerify: mockRetryVerify,
      retryBuild: mockRetryBuild,
    })
    renderWithRouter(<OnboardingGeneratingPage />)
    expect(await screen.findByText('Vérification de tes réponses')).toBeInTheDocument()
    expect(screen.getByText('Sauvegarde de ton audit')).toBeInTheDocument()
    expect(screen.getAllByText('Terminé').length).toBe(1)
    expect(screen.getAllByText('En cours').length).toBe(5)
    expect(screen.queryByText(/%/)).not.toBeInTheDocument()
  })
})

describe('#2089.35 — erreur nommée, résultats conservés, relance ciblée', () => {
  it('nomme la phase en échec côté vérification et relance UNIQUEMENT `retryVerify`', async () => {
    mockUseGenerateAuditPhases.mockReturnValue({
      phases: { ...ALL_PENDING, verify: 'error' },
      failedPhase: 'verify',
      succeeded: false,
      retryVerify: mockRetryVerify,
      retryBuild: mockRetryBuild,
    })
    renderWithRouter(<OnboardingGeneratingPage />)
    expect(await screen.findByText('Vérification de tes réponses a échoué')).toBeInTheDocument()
    expect(screen.getByText(/Tes réponses sont conservées/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Relancer cette phase' }))
    expect(mockRetryVerify).toHaveBeenCalledTimes(1)
    expect(mockRetryBuild).not.toHaveBeenCalled()
  })

  it('nomme la phase en échec côté génération et relance UNIQUEMENT `retryBuild`', async () => {
    mockUseGenerateAuditPhases.mockReturnValue({
      phases: {
        ...ALL_PENDING,
        verify: 'done',
        buildProfile: 'error',
        market: 'error',
        offer: 'error',
        plan: 'error',
        persist: 'error',
      },
      failedPhase: 'persist',
      succeeded: false,
      retryVerify: mockRetryVerify,
      retryBuild: mockRetryBuild,
    })
    renderWithRouter(<OnboardingGeneratingPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Relancer cette phase' }))
    expect(mockRetryBuild).toHaveBeenCalledTimes(1)
    expect(mockRetryVerify).not.toHaveBeenCalled()
  })
})

describe('#2089.36 — fin : « Ton audit est prêt » + CTA', () => {
  it('affiche le CTA et navigue vers /welcome au clic', async () => {
    mockUseGenerateAuditPhases.mockReturnValue({
      phases: { verify: 'done', buildProfile: 'done', market: 'done', offer: 'done', plan: 'done', persist: 'done' },
      failedPhase: null,
      succeeded: true,
      retryVerify: mockRetryVerify,
      retryBuild: mockRetryBuild,
    })
    renderWithRouter(<OnboardingGeneratingPage />)
    expect(await screen.findByText('Ton audit est prêt')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Découvrir mon audit' }))
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/welcome', replace: true })
  })
})

// #2091.39 — trois libellés de fin, chacun affiché SEULEMENT s'il est vrai.
// « Ton audit est validé » et « Laura est configurée » découlent du même fait
// mesuré (`succeeded`) : le profil de contexte qui nourrit Laura vient d'être
// écrit. « Tes premières actions sont prêtes » dépend d'un fait DISTINCT et
// non garanti — de vraies suggestions — jamais affiché sans elles (#2069 :
// `firstAnalysisSuggestions` peut rester vide en production).
describe('#2091.39 — les libellés de fin ne s’affichent que s’ils sont vrais', () => {
  function succeed(): void {
    mockUseGenerateAuditPhases.mockReturnValue({
      phases: { verify: 'done', buildProfile: 'done', market: 'done', offer: 'done', plan: 'done', persist: 'done' },
      failedPhase: null,
      succeeded: true,
      retryVerify: mockRetryVerify,
      retryBuild: mockRetryBuild,
    })
  }

  it('sans suggestions réelles : audit validé + Laura configurée, JAMAIS « premières actions prêtes »', async () => {
    succeed()
    mockUseProfileContext.mockReturnValue({
      data: { profile_context: { welcomeSummary: { firstAnalysisSuggestions: [] } } },
    })
    renderWithRouter(<OnboardingGeneratingPage />)
    expect(await screen.findByText('Ton audit est validé')).toBeInTheDocument()
    expect(screen.getByText('Laura est configurée')).toBeInTheDocument()
    expect(screen.queryByText('Tes premières actions sont prêtes')).not.toBeInTheDocument()
  })

  it('avec de vraies suggestions : les trois libellés', async () => {
    succeed()
    mockUseProfileContext.mockReturnValue({
      data: {
        profile_context: {
          welcomeSummary: {
            firstAnalysisSuggestions: [{ companyName: 'Acme', sector: 'Banque', reason: 'Signal récent' }],
          },
        },
      },
    })
    renderWithRouter(<OnboardingGeneratingPage />)
    expect(await screen.findByText('Ton audit est validé')).toBeInTheDocument()
    expect(screen.getByText('Laura est configurée')).toBeInTheDocument()
    expect(screen.getByText('Tes premières actions sont prêtes')).toBeInTheDocument()
  })
})

describe('#2012.12 (épopée #2776) — la couverture réduite du Profileur, enfin visible', () => {
  function succeed(): void {
    mockUseGenerateAuditPhases.mockReturnValue({
      phases: { verify: 'done', buildProfile: 'done', market: 'done', offer: 'done', plan: 'done', persist: 'done' },
      failedPhase: null,
      succeeded: true,
      retryVerify: mockRetryVerify,
      retryBuild: mockRetryBuild,
    })
  }

  it('sait dire NON : sans source en panne, aucune ligne de couverture réduite (GA-18/19)', async () => {
    succeed()
    mockUseProfileContext.mockReturnValue({
      data: { profile_context: {}, sourceHealth: { market_memory: 'ok' } },
    })
    renderWithRouter(<OnboardingGeneratingPage />)
    expect(await screen.findByText('Ton audit est validé')).toBeInTheDocument()
    expect(screen.queryByText(/Couverture réduite/)).not.toBeInTheDocument()
  })

  it('nomme la source en panne quand source_health la porte', async () => {
    succeed()
    mockUseProfileContext.mockReturnValue({
      data: { profile_context: {}, sourceHealth: { market_memory: 'down' } },
    })
    renderWithRouter(<OnboardingGeneratingPage />)
    expect(await screen.findByText(/Couverture réduite : l’observation du marché indisponible/)).toBeInTheDocument()
  })
})

// #2089.34 — jamais de pensée interne, prompt ou chaîne de raisonnement.
const FORBIDDEN_LEAK_PATTERNS = [
  /system.?prompt/i,
  /raw(Response|Output)/i,
  /\bchainOfThought\b/i,
  /\breasoning\b/i,
  /\bthinking\b/i,
]

function containsPromptLeak(source: string): boolean {
  return FORBIDDEN_LEAK_PATTERNS.some(p => p.test(source))
}

describe('#2089.34 — garde anti-fuite de prompt', () => {
  const here = path.dirname(fileURLToPath(import.meta.url))

  it('le code source de l’écran ne contient AUCUN des motifs interdits (lit quelque chose)', () => {
    const source = readFileSync(path.join(here, 'OnboardingGeneratingPage.tsx'), 'utf-8')
    expect(source.length).toBeGreaterThan(0)
    expect(containsPromptLeak(source)).toBe(false)
  })

  it('la garde SAIT dire NON — un extrait qui interpolerait `reasoning` est détecté', () => {
    expect(containsPromptLeak('<Text>{result.reasoning}</Text>')).toBe(true)
    expect(containsPromptLeak('<Text>{payload.systemPrompt}</Text>')).toBe(true)
  })

  it('la garde ne s’alarme PAS d’un texte métier normal (témoin de non-sur-alarme)', () => {
    expect(containsPromptLeak("t('generating.error.retry')")).toBe(false)
    expect(containsPromptLeak('Analyse de ton marché et de ton offre')).toBe(false)
  })
})

describe('refonte Théo (PR12) — la grammaire `onboarding-lancement` de l’écran de génération', () => {
  it('cadre du parcours : la barre du haut porte « Quitter », puis en-tête, note, étapes, marge', async () => {
    const { container } = renderWithRouter(<OnboardingGeneratingPage />)
    await screen.findByText('On prépare ton audit')
    const shell = container.querySelector('[data-parcours-shell]')
    expect(shell).not.toBeNull()
    expect(shell?.querySelector('header')?.textContent).toContain('Quitter')
    const main = shell?.querySelector('main')
    // L'ordre se LIT dans le DOM : repère → titre → note → panneau des étapes → marge « Ce que je regarde ».
    const text = main?.textContent ?? ''
    const order = [
      'Ton audit se prépare',
      'On prépare ton audit',
      'Tu peux quitter',
      'Les étapes de ton audit',
      'Ce que je regarde',
    ]
    const positions = order.map(label => text.indexOf(label))
    expect(positions.every(p => p >= 0)).toBe(true)
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
    expect(main?.querySelector('aside')?.textContent).toContain('Ce que je regarde')
  })

  it('les six phases sont des lignes d’UN panneau titré, dans l’ordre du contrat', async () => {
    renderWithRouter(<OnboardingGeneratingPage />)
    const panel = (await screen.findByRole('heading', { level: 2, name: 'Les étapes de ton audit' })).closest('section')
    const rows = [...(panel?.querySelectorAll('li[data-phase]') ?? [])].map(li => li.getAttribute('data-phase'))
    expect(rows).toEqual(['verify', 'buildProfile', 'market', 'offer', 'plan', 'persist'])
  })

  it('sait dire NON : avant la fin, aucun panneau « Ton audit est prêt »', async () => {
    renderWithRouter(<OnboardingGeneratingPage />)
    await screen.findByText('On prépare ton audit')
    expect(screen.queryByRole('heading', { level: 2, name: 'Ton audit est prêt' })).toBeNull()
  })
})
