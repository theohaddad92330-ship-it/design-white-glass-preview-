import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api-error'

const registerLead = vi.fn()
const redeem = vi.fn()
vi.mock('@/features/demo/api', () => ({
  demoApi: { registerLead: (...a: unknown[]) => registerLead(...a), redeem: (...a: unknown[]) => redeem(...a) },
}))
const rememberTabIdentity = vi.fn()
const forgetTabIdentity = vi.fn()
let currentIdentity: string | null = null
vi.mock('@/features/auth/tab-identity', () => ({
  rememberTabIdentity: (...a: unknown[]) => rememberTabIdentity(...a),
  forgetTabIdentity: () => forgetTabIdentity(),
  readTabIdentity: () => currentIdentity,
}))
const markTabAsDemo = vi.fn()
const forgetTabDemoFlag = vi.fn()
vi.mock('@/features/auth/demo-tab', () => ({
  markTabAsDemo: () => markTabAsDemo(),
  isTabDemo: () => false,
  forgetTabDemoFlag: () => forgetTabDemoFlag(),
}))
const clearPersistedQueryCache = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/cache/idb/tanstack-persister', () => ({
  clearPersistedQueryCache: (...a: unknown[]) => clearPersistedQueryCache(...a),
}))
const clearVolatileUserState = vi.fn()
vi.mock('@/features/auth/clear-client-user-state', () => ({
  clearVolatileUserState: () => clearVolatileUserState(),
}))

const VALID = {
  firstName: 'Marie',
  lastName: 'Dupont',
  email: 'marie.dupont@acme.fr',
  jobTitle: 'sales_director' as const,
  company: 'Acme',
}

const replace = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { replace, href: 'http://localhost/demo/acces' },
  })
})

// #2705.2/#2705.9 — le formulaire obligatoire : bouton désactivé tant qu'un
// champ obligatoire manque, soumission = enregistrement PUIS entrée en démo.
describe('useDemoAccessForm', () => {
  it('le formulaire est invalide tant que les champs obligatoires sont vides', async () => {
    const { useDemoAccessForm } = await import('./useDemoAccessForm')
    const { result } = renderHook(() => useDemoAccessForm(undefined))

    expect(result.current.form.formState.isValid).toBe(false)
  })

  it('enregistre le lead PUIS redeem le token, dans cet ordre', async () => {
    registerLead.mockResolvedValue({ firstName: 'Marie' })
    redeem.mockResolvedValue({ user: { id: 'u1' } })
    const { useDemoAccessForm } = await import('./useDemoAccessForm')
    const { result } = renderHook(() => useDemoAccessForm('tok'))

    act(() => {
      result.current.form.reset(VALID)
    })
    await act(async () => {
      await result.current.onSubmit()
    })

    expect(registerLead).toHaveBeenCalledWith(expect.objectContaining(VALID))
    expect(redeem).toHaveBeenCalledWith('tok', { onPreparing: expect.any(Function) })
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/'), { timeout: 2000 })
  })

  it('#4291 J — le choix « forfait / conseil » porté par la page (?profil=) va jusqu’à la salle', async () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { replace, href: 'http://localhost/demo/acces?profil=forfait_conseil', search: '?profil=forfait_conseil' },
    })
    registerLead.mockResolvedValue({ firstName: 'Marie' })
    redeem.mockResolvedValue({ user: { id: 'u1' } })
    const { useDemoAccessForm } = await import('./useDemoAccessForm')
    const { result } = renderHook(() => useDemoAccessForm('tok'))

    act(() => {
      result.current.form.reset(VALID)
    })
    await act(async () => {
      await result.current.onSubmit()
    })

    expect(redeem).toHaveBeenCalledWith('tok', { onPreparing: expect.any(Function), profile: 'forfait_conseil' })
  })

  // 29/09/2026 — le semis dure jusqu'à une minute : l'onglet est marqué démo
  // PENDANT l'attente (une 401 revient sur /demo/acces, pas /login), et le
  // marqueur est retiré si l'entrée échoue.
  // #3578 — la salle se re-sème en arrière-plan : l'écran DIT « la démo se prépare » au lieu
  // de tourner à vide, et ce n'est jamais l'erreur générique.
  it('#3578 — « en préparation » est exposé pendant l’attente, retiré à l’arrivée, jamais une erreur', async () => {
    registerLead.mockResolvedValue({ firstName: 'Marie' })
    let release: (v: unknown) => void = () => undefined
    redeem.mockImplementation((_token: unknown, opts?: { onPreparing?: () => void }) => {
      opts?.onPreparing?.()
      return new Promise(resolve => (release = resolve))
    })
    const { useDemoAccessForm } = await import('./useDemoAccessForm')
    const { result } = renderHook(() => useDemoAccessForm('tok'))
    act(() => {
      result.current.form.reset(VALID)
    })

    let submitted: Promise<void> = Promise.resolve()
    await act(async () => {
      submitted = result.current.onSubmit() as Promise<void>
    })
    await waitFor(() => expect(result.current.preparing).toBe(true))
    expect(result.current.rootError).toBeNull()

    await act(async () => {
      release({ user: { id: 'u1' } })
      await submitted
    })
    expect(result.current.preparing).toBe(false)
    expect(result.current.rootError).toBeNull()
  })

  it('#3578 — SAIT DIRE NON : sans état « en préparation », le drapeau reste faux', async () => {
    registerLead.mockResolvedValue({ firstName: 'Marie' })
    redeem.mockResolvedValue({ user: { id: 'u1' } })
    const { useDemoAccessForm } = await import('./useDemoAccessForm')
    const { result } = renderHook(() => useDemoAccessForm('tok'))
    expect(result.current.preparing).toBe(false)
  })

  it('marque l’onglet démo AVANT la réponse de redeem, et le retire si redeem échoue', async () => {
    registerLead.mockResolvedValue({ firstName: 'Marie' })
    let markedWhileWaiting = false
    redeem.mockImplementation(async () => {
      markedWhileWaiting = markTabAsDemo.mock.calls.length > 0
      throw new Error('boom')
    })
    const { useDemoAccessForm } = await import('./useDemoAccessForm')
    const { result } = renderHook(() => useDemoAccessForm(undefined))
    act(() => {
      result.current.form.reset(VALID)
    })
    await act(async () => {
      await result.current.onSubmit()
    })
    expect(markedWhileWaiting).toBe(true)
    expect(forgetTabDemoFlag).toHaveBeenCalled()
  })

  // #3068 / SG — même risque que `DemoEntryPage` : une salle REPRISE ou
  // RECYCLÉE peut redonner la MÊME identité qu'une visite précédente de ce
  // navigateur ; sans ce vidage, le rechargement complet restaurerait
  // l'ancien instantané IndexedDB avant que le réseau ne rattrape.
  it('vide l’instantané IndexedDB de cette identité AVANT le rechargement complet', async () => {
    registerLead.mockResolvedValue({ firstName: 'Marie' })
    redeem.mockResolvedValue({ user: { id: 'u1' } })
    const { useDemoAccessForm } = await import('./useDemoAccessForm')
    const { result } = renderHook(() => useDemoAccessForm('tok'))

    act(() => {
      result.current.form.reset(VALID)
    })
    await act(async () => {
      await result.current.onSubmit()
    })

    expect(clearPersistedQueryCache).toHaveBeenCalledWith('u1')
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/'), { timeout: 2000 })
  })

  // #3788.6 — recette prod 08/10 : voir `DemoEntryPage.test.tsx`. Un navigateur
  // qui portait déjà une session RÉELLE (ce formulaire est accessible alors
  // qu'une session réelle tourne en arrière-plan dans le même onglet) gardait
  // le scroll infini des comptes/contacts réels, hors de portée du vidage
  // IndexedDB ci-dessus.
  it('vide aussi le scroll infini des comptes et des contacts AVANT le rechargement', async () => {
    registerLead.mockResolvedValue({ firstName: 'Marie' })
    redeem.mockResolvedValue({ user: { id: 'u1' } })
    const { useDemoAccessForm } = await import('./useDemoAccessForm')
    const { result } = renderHook(() => useDemoAccessForm('tok'))

    act(() => {
      result.current.form.reset(VALID)
    })
    await act(async () => {
      await result.current.onSubmit()
    })

    expect(clearVolatileUserState).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/'), { timeout: 2000 })
  })

  // #2705.9 — un message de remerciement se lit AVANT la redirection : la
  // redirection ne part pas dans le même tick que la réussite, et le prénom
  // saisi est celui qui se lit dans le message (pas un texte générique).
  it('affiche le message de remerciement PUIS redirige, jamais dans le même tick', async () => {
    registerLead.mockResolvedValue({ firstName: 'Marie' })
    redeem.mockResolvedValue({ user: { id: 'u1' } })
    const { useDemoAccessForm, DEMO_ACCESS_SUCCESS_DELAY_MS } = await import('./useDemoAccessForm')
    const { result } = renderHook(() => useDemoAccessForm('tok'))

    act(() => {
      result.current.form.reset(VALID)
    })
    await act(async () => {
      await result.current.onSubmit()
    })

    expect(result.current.successFirstName).toBe('Marie')
    expect(replace).not.toHaveBeenCalled()

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/'), { timeout: DEMO_ACCESS_SUCCESS_DELAY_MS + 1000 })
  })

  it('une adresse personnelle refusée par le serveur s’affiche SOUS le champ e-mail', async () => {
    registerLead.mockRejectedValue(
      new ApiError('Validation failed', 400, undefined, {
        errors: [
          {
            message: 'Merci d’utiliser votre adresse e-mail professionnelle, par exemple prenom@entreprise.com.',
            path: ['email'],
          },
        ],
      }),
    )
    const { useDemoAccessForm } = await import('./useDemoAccessForm')
    const { result } = renderHook(() => useDemoAccessForm(undefined))

    act(() => {
      result.current.form.reset({ ...VALID, email: 'marie@gmail.com' })
    })
    await act(async () => {
      await result.current.onSubmit()
    })

    await waitFor(() =>
      expect(result.current.form.formState.errors.email?.message).toBe(
        'Merci d’utiliser votre adresse e-mail professionnelle, par exemple prenom@entreprise.com.',
      ),
    )
    expect(redeem).not.toHaveBeenCalled()
  })

  // #3563.2 — une session réelle active ne doit pas voyager avec la demande de démo.
  it('lâche l’identité de la session réelle AVANT les appels, et la rend si l’entrée échoue', async () => {
    currentIdentity = '11111111-1111-4111-8111-111111111111'
    let droppedBeforeCalls = false
    registerLead.mockImplementation(async () => {
      droppedBeforeCalls = forgetTabIdentity.mock.calls.length > 0
      return { firstName: 'Marie' }
    })
    redeem.mockRejectedValue(new Error('boom'))
    const { useDemoAccessForm } = await import('./useDemoAccessForm')
    const { result } = renderHook(() => useDemoAccessForm(undefined))
    act(() => {
      result.current.form.reset(VALID)
    })
    await act(async () => {
      await result.current.onSubmit()
    })
    expect(droppedBeforeCalls).toBe(true)
    expect(rememberTabIdentity).toHaveBeenLastCalledWith(currentIdentity)
    currentIdentity = null
  })
})
