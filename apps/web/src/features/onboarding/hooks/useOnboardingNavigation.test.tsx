import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import type { OnboardingStateResponse } from '@bellum/contracts'
import { useOnboardingNavigation } from './useOnboardingNavigation'
import type { FlatSubStep } from '@/features/onboarding/lib/questions'
import { ApiError } from '@/lib/api-error'

// The last-sub-step completion path is what P0-01 (Théo restitution p.6/8) is
// about: after the questionnaire the seller must land on the validated welcome
// screen (`/welcome`), not be dropped straight into the product shell. This
// regressed once already (a "time-to-value" change diverted nav to `/search`
// while the /welcome route doc still claimed to be the target), so we pin it.
//
// ⚠️ Ce que ce fichier pinne est le PREMIER maillon d'une chaîne à TROIS
// sauts, pas la chaîne entière. Depuis #2030, la dernière sous-étape ne
// complète plus elle-même : elle mène à l'écran de relecture
// (`/onboarding/$id/review`). Depuis #2089.28, le CTA « Générer mon audit »
// de cet écran n'y complète plus rien directement : il ouvre l'écran de
// génération dédié (`/onboarding/$id/generating`), qui déclenche VRAIMENT
// complete+génération et n'atterrit sur `/welcome` qu'au clic manuel sur
// « Découvrir mon audit ». Les trois maillons sont donc pinnés dans TROIS
// fichiers séparés — casser n'importe lequel rend SON fichier rouge, ce qui
// est exactement la garantie que P0-01 protège (« le parcours aboutit à
// /welcome ») :
//  1. ICI — dernière sous-étape → `/onboarding/$id/review`.
//  2. `OnboardingReviewPage.test.tsx` — CTA → `/onboarding/$id/generating`.
//  3. `OnboardingGeneratingPage.test.tsx` — succès → CTA manuel → `/welcome`.

const h = vi.hoisted(() => ({
  navigate: vi.fn(),
  completeMutate: vi.fn().mockResolvedValue(undefined),
  generateProfileMutate: vi.fn().mockResolvedValue(undefined),
  saveMutate: vi.fn().mockResolvedValue(undefined),
  advanceMutate: vi.fn().mockResolvedValue(undefined),
  // Two sub-steps: index 0 is a mid-course step (the `goTo` branch), index 1
  // (last) is the LAST step → the completion branch.
  firstSub: { index: 0, stageCode: 'temps1', slug: 'premiere', questions: [] } as unknown as FlatSubStep,
  lastSub: { index: 1, stageCode: 'temps1', slug: 'final', questions: [] } as unknown as FlatSubStep,
}))

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => h.navigate }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

vi.mock('@/features/onboarding/hooks/useOnboarding', () => ({
  useSaveAnswers: () => ({ mutateAsync: h.saveMutate, isPending: false }),
  useAdvanceStage: () => ({ mutateAsync: h.advanceMutate, isPending: false }),
  useCompleteOnboarding: () => ({ mutateAsync: h.completeMutate, isPending: false }),
}))
vi.mock('@/features/profile-context/hooks/useGenerateProfileContext', () => ({
  useGenerateProfileContext: () => ({ mutateAsync: h.generateProfileMutate, isPending: false }),
}))
vi.mock('@/features/onboarding/lib/validation', () => ({ presentedValue: (_q: unknown, v: unknown) => v }))
vi.mock('@/features/onboarding/lib/questions', () => ({ TEMPS1_SUBSTEPS: [h.firstSub, h.lastSub] }))
vi.mock('@/stores/onboardingStore', () => ({
  useOnboardingStore: (selector: (s: { answers: Record<string, unknown> }) => unknown) => selector({ answers: {} }),
}))

const state = { id: 'ob-1', status: 'completed' } as unknown as OnboardingStateResponse

describe('useOnboardingNavigation — the questionnaire still ends on /welcome (P0-01)', () => {
  beforeEach(() => {
    h.navigate.mockClear()
    h.completeMutate.mockClear()
    h.generateProfileMutate.mockClear()
    h.saveMutate.mockClear()
  })

  it('routes the last sub-step to the review screen, never straight to /welcome or /search', async () => {
    const { result } = renderHook(() => useOnboardingNavigation(state, h.lastSub))

    await act(async () => {
      await result.current.onContinue()
    })

    // Les réponses de la dernière sous-étape sont enregistrées AVANT de sortir :
    // l'écran de relecture les relit depuis le store hydraté.
    expect(h.saveMutate).toHaveBeenCalledTimes(1)
    expect(h.navigate).toHaveBeenCalledWith({
      to: '/onboarding/$id/review',
      params: { id: 'ob-1' },
    })
    expect(h.navigate).not.toHaveBeenCalledWith({ to: '/welcome', replace: true })
    expect(h.navigate).not.toHaveBeenCalledWith({ to: '/search', replace: true })
    // La complétion appartient désormais au CTA de la relecture : la poser ici
    // AUSSI la ferait jouer deux fois, et rendrait l'écran de relecture
    // cosmétique (le questionnaire serait déjà clos en l'atteignant).
    expect(h.completeMutate).not.toHaveBeenCalled()
    expect(h.generateProfileMutate).not.toHaveBeenCalled()
  })
})

// #2026.7 — perte de réseau : le brouillon local (#2026.1, `onboardingStore`
// persist) survit déjà. Ce qui manquait : le message affiché sur un échec
// d'enregistrement montrait `err.message` — un texte technique brut
// (« Failed to fetch »), jamais rassurant sur le sort de la réponse — alors
// que le commentaire voisin (#2085.18) documentait déjà l'intention inverse
// (« un CODE fermé, jamais err.message », pour ne pas fuiter un fragment de
// réponse serveur). Le message fixe explique maintenant la synchronisation :
// la réponse reste sur cet appareil, on réessaiera.
//
// #2537.4 — Ludovic (call bêta 17/09) : le message doit dire CE QUI a échoué
// (réseau, enregistrement, session), jamais un texte unique et flou. Le
// message générique d'avant devient le cas RÉSEAU (un `TypeError`, comme
// `fetch` le lève sur une connexion coupée) ; deux nouveaux cas — session
// morte, échec serveur — restent des CODES fermés (`ApiError.status` via
// `sessionIsDead`), jamais `err.message`.
describe("#2026.7 / #2537.4 — le message d'erreur dit CE QUI a échoué, jamais un texte technique ni générique", () => {
  beforeEach(() => {
    vi.mocked(toast.error).mockClear()
  })

  it('réseau coupé (TypeError) → message RÉSEAU, jamais err.message', async () => {
    h.saveMutate.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const { result } = renderHook(() => useOnboardingNavigation(state, h.lastSub))

    await act(async () => {
      await result.current.onContinue()
    })

    expect(toast.error).toHaveBeenCalledWith('toast.saveErrorNetwork')
    expect(toast.error).not.toHaveBeenCalledWith('Failed to fetch')
    h.saveMutate.mockResolvedValue(undefined)
  })

  it('session morte (401) → message SESSION, distinct du message réseau', async () => {
    h.saveMutate.mockRejectedValueOnce(new ApiError('jeton invalide', 401))
    const { result } = renderHook(() => useOnboardingNavigation(state, h.lastSub))

    await act(async () => {
      await result.current.onContinue()
    })

    expect(toast.error).toHaveBeenCalledWith('toast.saveErrorSession')
    expect(toast.error).not.toHaveBeenCalledWith('jeton invalide')
    h.saveMutate.mockResolvedValue(undefined)
  })

  // #2084.13 — un 403 pendant l'onboarding n'est PAS une session morte : la
  // seule vraie source de 403 dans ce parcours est `WorkspaceContextService`
  // (`resolveActiveWorkspace`/`assertMember`, `apps/api/.../workspace-context.
  // service.ts`), qui protège l'appartenance à l'ESPACE, pas le jeton. Une
  // révocation d'APPAREIL (R15-7) est, elle, une VRAIE 401
  // (`jwt.strategy.ts:159`, `UnauthorizedException`) — jamais un 403. Absorber
  // le 403 dans `sessionIsDead` (comme avant ce correctif) faisait dire
  // « reconnecte-toi » à quelqu'un dont la session était valide et dont c'est
  // l'ESPACE qui lui était fermé.
  it('espace inaccessible (403) → message ESPACE, distinct du message SESSION', async () => {
    h.saveMutate.mockRejectedValueOnce(new ApiError("Vous n'êtes pas membre de cet espace de travail", 403))
    const { result } = renderHook(() => useOnboardingNavigation(state, h.lastSub))

    await act(async () => {
      await result.current.onContinue()
    })

    expect(toast.error).toHaveBeenCalledWith('toast.saveErrorWorkspace')
    expect(toast.error).not.toHaveBeenCalledWith('toast.saveErrorSession')
    h.saveMutate.mockResolvedValue(undefined)
  })

  it("échec serveur (503) → message d'ENREGISTREMENT par défaut, jamais err.message", async () => {
    h.saveMutate.mockRejectedValueOnce(new ApiError('service indisponible', 503))
    const { result } = renderHook(() => useOnboardingNavigation(state, h.lastSub))

    await act(async () => {
      await result.current.onContinue()
    })

    expect(toast.error).toHaveBeenCalledWith('toast.saveError')
    expect(toast.error).not.toHaveBeenCalledWith('service indisponible')
    h.saveMutate.mockResolvedValue(undefined)
  })
})

// #2541 — Ludovic (call bêta 17/09) : passer à la salve suivante laissait la
// position de défilement inchangée, le nouveau formulaire s'ouvrait au milieu.
// `goTo` est le seul point de passage commun à `onContinue` et `onBack` :
// c'est là que la vue doit remonter en haut.
//
// ⚠️ Mesuré en production le 18/09 : ce n'est PAS `window` qui défile ici.
// `window.scrollY` vaut toujours 0 dans ce layout — c'est un conteneur
// interne (`div.flex-1.overflow-y-auto` dans `OnboardingWizard.tsx`) qui
// porte le défilement. Un premier correctif appelait `window.scrollTo` : le
// test d'alors vérifiait fidèlement CET appel, restait vert, et l'écran
// restait cassé. Ce test-ci vérifie la chose qui défile RÉELLEMENT (le
// conteneur, injecté par référence) et échoue explicitement si `window`
// est sollicité à sa place — il ne peut plus passer par coïncidence.
describe('#2541 — changer de sous-étape remet en haut le CONTENEUR qui défile réellement (pas `window`)', () => {
  beforeEach(() => {
    h.navigate.mockClear()
    h.saveMutate.mockClear()
    h.advanceMutate.mockClear()
  })

  it('onContinue vers la sous-étape suivante remet le conteneur à zéro, jamais `window`', async () => {
    const windowScrollTo = vi.fn()
    vi.stubGlobal('scrollTo', windowScrollTo)
    const containerScrollTo = vi.fn()
    const scrollContainerRef = { current: { scrollTo: containerScrollTo } as unknown as HTMLDivElement }
    const { result } = renderHook(() => useOnboardingNavigation(state, h.firstSub, scrollContainerRef))

    await act(async () => {
      await result.current.onContinue()
    })

    expect(h.navigate).toHaveBeenCalledWith({
      to: '/onboarding/$id/$stage/$slug',
      params: { id: 'ob-1', stage: 'temps1', slug: 'final' },
    })
    expect(containerScrollTo).toHaveBeenCalledWith({ top: 0, left: 0 })
    expect(windowScrollTo).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('onBack vers la sous-étape précédente remet aussi le conteneur à zéro, jamais `window`', async () => {
    const windowScrollTo = vi.fn()
    vi.stubGlobal('scrollTo', windowScrollTo)
    const containerScrollTo = vi.fn()
    const scrollContainerRef = { current: { scrollTo: containerScrollTo } as unknown as HTMLDivElement }
    const { result } = renderHook(() => useOnboardingNavigation(state, h.lastSub, scrollContainerRef))

    await act(async () => {
      await result.current.onBack()
    })

    expect(h.navigate).toHaveBeenCalledWith({
      to: '/onboarding/$id/$stage/$slug',
      params: { id: 'ob-1', stage: 'temps1', slug: 'premiere' },
    })
    expect(containerScrollTo).toHaveBeenCalledWith({ top: 0, left: 0 })
    expect(windowScrollTo).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})

/**
 * #3553 — le rail devient une navigation : sauter à une sous-étape ENREGISTRE
 * d'abord la page quittée (aucune saisie perdue), déplace le pointeur d'étape
 * du serveur quand le stage change, puis route.
 */
describe('useOnboardingNavigation — onJump (#3553)', () => {
  const other = { index: 1, stageCode: 'autre', slug: 'cible', questions: [] } as unknown as FlatSubStep

  beforeEach(() => {
    h.navigate.mockClear()
    h.saveMutate.mockReset().mockResolvedValue(undefined)
    h.advanceMutate.mockReset().mockResolvedValue(undefined)
  })

  it('enregistre la page quittée, avance le stage, puis route vers la cible', async () => {
    const { result } = renderHook(() => useOnboardingNavigation(state, h.firstSub))
    await act(async () => {
      await result.current.onJump(other)
    })
    expect(h.saveMutate).toHaveBeenCalledTimes(1)
    expect(h.advanceMutate).toHaveBeenCalledWith('autre')
    expect(h.navigate).toHaveBeenCalledWith({
      to: '/onboarding/$id/$stage/$slug',
      params: { id: 'ob-1', stage: 'autre', slug: 'cible' },
    })
  })

  it('reste dans le même stage : pas d’avance serveur', async () => {
    const { result } = renderHook(() => useOnboardingNavigation(state, h.firstSub))
    await act(async () => {
      await result.current.onJump(h.lastSub)
    })
    expect(h.advanceMutate).not.toHaveBeenCalled()
    expect(h.navigate).toHaveBeenCalledTimes(1)
  })

  it('un enregistrement qui échoue NE navigue PAS : la saisie reste à l’écran', async () => {
    h.saveMutate.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const { result } = renderHook(() => useOnboardingNavigation(state, h.firstSub))
    await act(async () => {
      await result.current.onJump(other)
    })
    expect(h.navigate).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalled()
  })

  it('la sous-étape courante est un no-op', async () => {
    const { result } = renderHook(() => useOnboardingNavigation(state, h.firstSub))
    await act(async () => {
      await result.current.onJump(h.firstSub)
    })
    expect(h.saveMutate).not.toHaveBeenCalled()
    expect(h.navigate).not.toHaveBeenCalled()
  })
})

/**
 * #2537.1 — Ludovic (call bêta 17/09) : « les réponses sont visiblement
 * enregistrées, et la reprise repart exactement là où on s'est arrêté ».
 * Mesuré avant ce lot : aucun test ne couvrait « coupure réseau au milieu
 * d'une étape, puis rechargement » — le critère de recette exact de l'issue.
 *
 * Le mécanisme est déjà en place, en trois morceaux DÉJÀ testés séparément
 * (le brouillon local survit à la fermeture de l'onglet, #2026.1 ; l'heure
 * d'enregistrement s'affiche, #2026.2 ; le message d'échec dit CE QUI a
 * raté, #2537.4 ci-dessus) — ce qui manquait, et que ce test pin : la PIÈCE
 * QUI LES RELIE. `onContinue` ne navigue QUE sur un succès ; sur un échec,
 * quel qu'il soit, la sous-étape ne change pas — c'est exactement ce
 * qui fait qu'un rechargement (qui ne fait que relire l'URL courante et
 * réhydrater le brouillon local, #2026.1) retrouve la MÊME sous-étape avec
 * les MÊMES réponses, jamais une avance devinée.
 */
describe('#2537.1 — un échec d’enregistrement ne fait JAMAIS changer de sous-étape', () => {
  beforeEach(() => {
    h.navigate.mockClear()
    h.saveMutate.mockClear()
    h.advanceMutate.mockClear()
  })

  it('réseau coupé : `navigate` n’est PAS appelé — la reprise retrouve la même URL', async () => {
    h.saveMutate.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const { result } = renderHook(() => useOnboardingNavigation(state, h.firstSub))

    await act(async () => {
      await result.current.onContinue()
    })

    expect(h.navigate).not.toHaveBeenCalled()
    h.saveMutate.mockResolvedValue(undefined)
  })

  it('session morte : `navigate` n’est PAS appelé non plus — même garantie, cause différente', async () => {
    h.saveMutate.mockRejectedValueOnce(new ApiError('jeton invalide', 401))
    const { result } = renderHook(() => useOnboardingNavigation(state, h.firstSub))

    await act(async () => {
      await result.current.onContinue()
    })

    expect(h.navigate).not.toHaveBeenCalled()
    h.saveMutate.mockResolvedValue(undefined)
  })

  it('un succès APRÈS l’échec avance enfin — une seule fois, avec les MÊMES réponses rejouées', async () => {
    h.saveMutate.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const { result } = renderHook(() => useOnboardingNavigation(state, h.firstSub))

    // Premier clic : coupure réseau, on reste sur place.
    await act(async () => {
      await result.current.onContinue()
    })
    expect(h.navigate).not.toHaveBeenCalled()

    // Reprise MANUELLE (le seul rejeu que la doctrine autorise — jamais
    // automatique, CLAUDE.md « un timeout n'est pas un échec, `unknown`
    // arrête la reprise »).
    await act(async () => {
      await result.current.onContinue()
    })

    expect(h.saveMutate).toHaveBeenCalledTimes(2)
    // #2537.3 — le rejeu n'avance QU'UNE fois : pas de double navigation.
    expect(h.navigate).toHaveBeenCalledTimes(1)
    expect(h.navigate).toHaveBeenCalledWith({
      to: '/onboarding/$id/$stage/$slug',
      params: { id: 'ob-1', stage: 'temps1', slug: 'final' },
    })
  })
})
