import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useGenerateAuditPhases } from './useGenerateAuditPhases'

// #2089.28-.36 — reprend l'enchaînement pinné par #2030.16
// (`useGenerateAudit.test.tsx`) : compléter puis générer le profil, mais
// vérifie ICI que chaque étape porte son propre statut et son propre retry.
//
// #2012.13 — vérifie AUSSI que rien de coûteux ne repart tout seul sur un
// remontage : `useOnboardingState`/`useProfileContext` simulent l'état
// SERVEUR (ce qui survit à un démontage), distinct des statuts LOCAUX de
// mutation (`completeStatus`/`buildStatus`, qui repartent à `'idle'` à
// chaque nouvelle instance de composant, comme en vrai).

type OnboardingStatus = 'not_started' | 'in_progress' | 'completed' | 'refresh_required'
type ProfileStatus = 'not_generated' | 'generating' | 'succeeded' | 'validated' | 'failed'

const h = vi.hoisted(() => ({
  completeMutate: vi.fn(),
  generateProfileMutate: vi.fn(),
  completeStatus: 'idle' as 'idle' | 'pending' | 'success' | 'error',
  buildStatus: 'idle' as 'idle' | 'pending' | 'success' | 'error',
  onboardingData: { status: 'in_progress' as OnboardingStatus },
  onboardingIsPending: false,
  onboardingIsError: false,
  profileData: { status: 'not_generated' as ProfileStatus },
  profileIsPending: false,
  profileIsError: false,
}))

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }))
vi.mock('@/lib/product-tracker', () => ({ trackActionCompleted: vi.fn(), trackErrorShown: vi.fn() }))

vi.mock('@/features/onboarding/hooks/useOnboarding', () => ({
  useCompleteOnboarding: () => ({ mutate: h.completeMutate, status: h.completeStatus }),
  useOnboardingState: () => ({
    data: h.onboardingData,
    isPending: h.onboardingIsPending,
    isError: h.onboardingIsError,
  }),
}))
vi.mock('@/features/profile-context/hooks/useGenerateProfileContext', () => ({
  useGenerateProfileContext: () => ({ mutate: h.generateProfileMutate, status: h.buildStatus }),
}))
vi.mock('@/features/profile-context/hooks/useProfileContext', () => ({
  useProfileContext: () => ({
    data: h.profileData,
    isPending: h.profileIsPending,
    isError: h.profileIsError,
  }),
}))

describe('#2089.28-.36 — useGenerateAuditPhases', () => {
  beforeEach(() => {
    h.completeMutate.mockReset()
    h.generateProfileMutate.mockReset()
    h.completeStatus = 'idle'
    h.buildStatus = 'idle'
    // État serveur d'un dossier NEUF : rien n'a jamais été fait — c'est le
    // seul cas où l'arrivée sur l'écran doit, à elle seule, lancer le travail.
    h.onboardingData = { status: 'in_progress' }
    h.onboardingIsPending = false
    h.onboardingIsError = false
    h.profileData = { status: 'not_generated' }
    h.profileIsPending = false
    h.profileIsError = false
  })

  it('déclenche la vérification (complete) au montage, une seule fois', () => {
    const { rerender } = renderHook(() => useGenerateAuditPhases())
    rerender()
    rerender()
    expect(h.completeMutate).toHaveBeenCalledTimes(1)
  })

  it('sur succès de la vérification, enchaîne AUTOMATIQUEMENT sur la génération du profil', () => {
    h.completeMutate.mockImplementation((_vars, opts) => opts?.onSuccess?.())
    renderHook(() => useGenerateAuditPhases())
    expect(h.generateProfileMutate).toHaveBeenCalledTimes(1)
  })

  it("sur échec de la vérification, n'appelle JAMAIS la génération du profil", () => {
    h.completeMutate.mockImplementation((_vars, opts) => opts?.onError?.(new Error('boom')))
    renderHook(() => useGenerateAuditPhases())
    expect(h.generateProfileMutate).not.toHaveBeenCalled()
  })

  it('#2089.35 — retryVerify rejoue TOUT le parcours depuis la vérification', () => {
    h.completeStatus = 'error'
    const { result } = renderHook(() => useGenerateAuditPhases())
    h.completeMutate.mockClear()
    result.current.retryVerify()
    expect(h.completeMutate).toHaveBeenCalledTimes(1)
  })

  it('#2089.35 — retryBuild ne relance QUE la génération, jamais la vérification déjà réussie', () => {
    h.completeStatus = 'success'
    h.buildStatus = 'error'
    const { result } = renderHook(() => useGenerateAuditPhases())
    h.completeMutate.mockClear()
    result.current.retryBuild()
    expect(h.completeMutate).not.toHaveBeenCalled()
    expect(h.generateProfileMutate).toHaveBeenCalled()
  })

  it('#2089.30 — expose le statut des six phases, dérivé des deux signaux réels', () => {
    h.completeStatus = 'success'
    h.buildStatus = 'success'
    const { result } = renderHook(() => useGenerateAuditPhases())
    expect(result.current.phases.verify).toBe('done')
    expect(result.current.phases.persist).toBe('done')
    expect(result.current.succeeded).toBe(true)
  })

  it('#2089.35 — nomme la phase en échec', () => {
    h.completeStatus = 'success'
    h.buildStatus = 'error'
    const { result } = renderHook(() => useGenerateAuditPhases())
    expect(result.current.failedPhase).toBe('buildProfile')
  })

  it('#2012.13 — démonter puis remonter AVANT validation ne relance PAS une génération complète', () => {
    // Première visite : dossier neuf, le montage est le geste (clic
    // « Valider » sur Review, qui a navigué ici) — départ normal.
    const first = renderHook(() => useGenerateAuditPhases())
    expect(h.completeMutate).toHaveBeenCalledTimes(1)

    // Le serveur a acté la complétion ET une génération en cours avant que
    // l'utilisateur ne quitte l'écran.
    h.onboardingData = { status: 'completed' }
    h.profileData = { status: 'generating' }
    first.unmount()

    // Retour AVANT validation : nouvelle instance de composant (nouveau
    // `useRef`, comme en vrai après un démontage), même dossier.
    h.completeMutate.mockClear()
    h.generateProfileMutate.mockClear()
    renderHook(() => useGenerateAuditPhases())

    expect(h.completeMutate).not.toHaveBeenCalled()
    expect(h.generateProfileMutate).not.toHaveBeenCalled()
  })

  it('#2012.13 — un travail déjà en cours se REPREND (aucune mutation, phase affichée en cours)', () => {
    h.onboardingData = { status: 'completed' }
    h.profileData = { status: 'generating' }
    const { result } = renderHook(() => useGenerateAuditPhases())
    expect(h.completeMutate).not.toHaveBeenCalled()
    expect(h.generateProfileMutate).not.toHaveBeenCalled()
    expect(result.current.phases.buildProfile).toBe('inProgress')
  })

  it('#2012.13 — un résultat déjà généré ne régénère rien, et se montre terminé', () => {
    h.onboardingData = { status: 'completed' }
    h.profileData = { status: 'succeeded' }
    const { result } = renderHook(() => useGenerateAuditPhases())
    expect(h.completeMutate).not.toHaveBeenCalled()
    expect(h.generateProfileMutate).not.toHaveBeenCalled()
    expect(result.current.succeeded).toBe(true)
  })

  it("#2012.13 — vérification faite mais rien n'a jamais démarré : pas de relance automatique, le geste retryBuild reste possible", () => {
    h.onboardingData = { status: 'completed' }
    h.profileData = { status: 'not_generated' }
    const { result } = renderHook(() => useGenerateAuditPhases())
    expect(h.completeMutate).not.toHaveBeenCalled()
    expect(h.generateProfileMutate).not.toHaveBeenCalled()
    expect(result.current.failedPhase).toBe('buildProfile')
    h.generateProfileMutate.mockClear()
    result.current.retryBuild()
    expect(h.generateProfileMutate).toHaveBeenCalledTimes(1)
  })

  // Prod 19/10/2026 (eXteam) — « Mettre à jour mon audit » : le questionnaire
  // est rouvert (`refresh_required` → `in_progress`) mais l'ANCIEN profil reste
  // `succeeded`. L'écran le prenait pour un travail déjà fait : ni `complete`
  // ni génération, et une vérification `idle` à vie — l'audit « ne sortait pas ».
  it.each(['succeeded', 'validated', 'failed'] as const)(
    'mise à jour : questionnaire rouvert et ancien profil %s → la vérification puis la génération PARTENT',
    profileStatus => {
      h.onboardingData = { status: 'in_progress' }
      h.profileData = { status: profileStatus }
      renderHook(() => useGenerateAuditPhases())
      expect(h.completeMutate).toHaveBeenCalledTimes(1)
    },
  )

  it('mise à jour depuis `refresh_required` : la vérification part aussi', () => {
    h.onboardingData = { status: 'refresh_required' }
    h.profileData = { status: 'succeeded' }
    renderHook(() => useGenerateAuditPhases())
    expect(h.completeMutate).toHaveBeenCalledTimes(1)
  })

  it('questionnaire rouvert mais génération déjà en cours : rien ne repart', () => {
    h.onboardingData = { status: 'in_progress' }
    h.profileData = { status: 'generating' }
    renderHook(() => useGenerateAuditPhases())
    expect(h.completeMutate).not.toHaveBeenCalled()
    expect(h.generateProfileMutate).not.toHaveBeenCalled()
  })

  it("#2012.13 — un timeout/une erreur réseau sur l'état serveur est `unknown` : ça arrête la reprise, jamais un nouveau départ", () => {
    h.profileIsError = true
    const { rerender } = renderHook(() => useGenerateAuditPhases())
    rerender()
    rerender()
    expect(h.completeMutate).not.toHaveBeenCalled()
    expect(h.generateProfileMutate).not.toHaveBeenCalled()
  })

  it('#2012.13 — état serveur encore en chargement : rien ne part avant de savoir', () => {
    h.onboardingIsPending = true
    renderHook(() => useGenerateAuditPhases())
    expect(h.completeMutate).not.toHaveBeenCalled()
  })
})
