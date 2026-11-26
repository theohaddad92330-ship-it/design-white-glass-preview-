import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createJSONStorage } from 'zustand/middleware'
import { accountKeys } from '@/features/accounts/api'
import { SessionContext, type SessionContextValue } from '@/features/auth/session-context'
import { subscribeToAnalysisRun } from '@/lib/analysis-subscription'
import { useAnalysisStore } from '@/stores/analysisStore'
import { useAnalysis } from './useAnalysis'

// #2704.1 — la seule chose que ce lot AJOUTE au comportement : un toast quand
// le serveur nomme qui a lancé le run qu'on rejoint. `vi.mock` remplace tout
// le module — même double que les autres hooks qui appellent `toast` hors
// rendu (`useResumeAnalysis.ts`, `useEnrichAccount.ts`, etc.). `vi.hoisted` :
// `vi.mock` est hissé au-dessus de toute déclaration `const` du fichier.
const { toastInfo } = vi.hoisted(() => ({ toastInfo: vi.fn() }))
vi.mock('sonner', () => ({ toast: { info: toastInfo, success: vi.fn(), error: vi.fn() } }))

// Control apiFetch so we can inspect the exact /analysis/start body. Must also
// re-export the symbols session-manager reads at module-eval (see test/setup.ts).
const apiFetch = vi.fn()
vi.mock('@/lib/api', async () => ({
  ApiError: (await vi.importActual<typeof import('@/lib/api-error')>('@/lib/api-error')).ApiError,
  apiFetch: (...args: unknown[]) => apiFetch(...(args as Parameters<typeof apiFetch>)),
  setAuthExpiredHandler: vi.fn(),
  refreshTokensOnce: vi.fn().mockResolvedValue(false),
}))

// No real WebSocket subscription in a unit test — return a no-op unsubscribe.
vi.mock('@/lib/analysis-subscription', () => ({
  subscribeToAnalysisRun: vi.fn(() => () => {}),
}))

// #3143 — `qc` est optionnel pour que le test d'invalidation du cache compte
// (voir plus bas) puisse GARDER la main sur le QueryClient après le rendu, au
// lieu d'en recevoir un qu'il ne peut plus inspecter.
function wrapper(
  qc: QueryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } } }),
): (props: { children: ReactNode }) => ReactElement {
  const session: SessionContextValue = {
    user: { id: 'u-1', email: 'u@example.com' } as SessionContextValue['user'],
    loading: false,
  }
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>
      <SessionContext.Provider value={session}>{children}</SessionContext.Provider>
    </QueryClientProvider>
  )
}

beforeAll(() => {
  useAnalysisStore.persist.setOptions({
    storage: createJSONStorage(() => ({ getItem: () => null, setItem: () => {}, removeItem: () => {} })),
  })
})

function bodyOfLastStartCall(): Record<string, unknown> {
  const call = apiFetch.mock.calls.at(-1)?.[0] as { path: string; body: Record<string, unknown> }
  expect(call.path).toBe('/analysis/start')
  return call.body
}

describe('useAnalysis.startAnalysis — mode de contexte (#2451.1)', () => {
  beforeEach(() => {
    useAnalysisStore.setState({ runs: {} })
    apiFetch.mockReset()
    apiFetch.mockResolvedValue({ jobId: 'job-1', accountId: 'acct-1' })
  })

  it('un mode CHOISI part au serveur ; aucun choix = clé omise (défaut de l’espace côté serveur)', async () => {
    const { result } = renderHook(() => useAnalysis(), { wrapper: wrapper() })

    await act(async () => {
      await result.current.startAnalysis(
        'SNCF',
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        'one_off_mission',
      )
    })
    await waitFor(() => expect(apiFetch).toHaveBeenCalled())
    expect(bodyOfLastStartCall().context_mode).toBe('one_off_mission')

    await act(async () => {
      await result.current.startAnalysis('SNCF')
    })
    expect(JSON.parse(JSON.stringify(bodyOfLastStartCall()))).not.toHaveProperty('context_mode')
  })

  // #4464.1 — le refus 402 du serveur au lancement est LE frein doux : jamais le texte brut
  // de l'API (qui peut nommer un solde), et l'écran sait que c'est un frein.
  it('#4464.1 — un 402 au lancement expose `softBraked`, sans reprendre le message brut du serveur', async () => {
    const { ApiError } = await import('@/lib/api-error')
    apiFetch.mockRejectedValueOnce(new ApiError('Solde insuffisant : 3 crédits restants', 402, 'insufficient_credits'))
    const { result } = renderHook(() => useAnalysis(), { wrapper: wrapper() })
    await act(async () => {
      await result.current.startAnalysis('SNCF')
    })
    expect(result.current.status).toBe('error')
    expect(result.current.softBraked).toBe(true)
    expect(result.current.error ?? '').not.toMatch(/crédit|\d/i)
  })

  it('#4464.1 — une autre erreur de lancement n’est PAS un frein doux', async () => {
    apiFetch.mockRejectedValueOnce(new Error('boom'))
    const { result } = renderHook(() => useAnalysis(), { wrapper: wrapper() })
    await act(async () => {
      await result.current.startAnalysis('SNCF')
    })
    expect(result.current.softBraked).toBe(false)
    expect(result.current.error).toBe('boom')
  })

  it('#3623 — les documents joints partent avec le lancement (le serveur les rattache avant la mise en file) ; sans pièce, clé omise', async () => {
    const { result } = renderHook(() => useAnalysis(), { wrapper: wrapper() })
    const DOC = '22222222-2222-4222-8222-222222222222'
    await act(async () => {
      await result.current.startAnalysis(
        'SNCF',
        ...[undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined],
        [DOC],
      )
    })
    await waitFor(() => expect(apiFetch).toHaveBeenCalled())
    expect(bodyOfLastStartCall().attachment_document_ids).toEqual([DOC])

    await act(async () => {
      await result.current.startAnalysis(
        'SNCF',
        ...[undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined],
        [],
      )
    })
    expect(JSON.parse(JSON.stringify(bodyOfLastStartCall()))).not.toHaveProperty('attachment_document_ids')
  })
})

describe('useAnalysis.startAnalysis — suggestion origin (Théo P0 §5)', () => {
  beforeEach(() => {
    useAnalysisStore.setState({ runs: {} })
    apiFetch.mockReset()
    apiFetch.mockResolvedValue({ jobId: 'job-1', accountId: 'acct-1' })
  })

  it('threads suggestion_id + suggestion_reason when launched from a suggestion', async () => {
    const { result } = renderHook(() => useAnalysis(), { wrapper: wrapper() })

    await act(async () => {
      await result.current.startAnalysis('Société Générale', { preset: 'free', notes: '' }, undefined, 'groupe', {
        id: 'societe-generale--banque',
        reason: 'Grand compte bancaire',
      })
    })

    await waitFor(() => expect(apiFetch).toHaveBeenCalled())
    const body = bodyOfLastStartCall()
    expect(body.company_name).toBe('Société Générale')
    expect(body.suggestion_id).toBe('societe-generale--banque')
    expect(body.suggestion_reason).toBe('Grand compte bancaire')
  })

  // #3819 (lot RBB) — les critères Découvrir partent avec l'origine.
  it('threads suggestion_criteria, and drops an empty reason rather than sending ""', async () => {
    const { result } = renderHook(() => useAnalysis(), { wrapper: wrapper() })

    await act(async () => {
      await result.current.startAnalysis('Axa', { preset: 'free', notes: '' }, undefined, 'groupe', {
        id: 'discover:572093920',
        reason: '',
        criteria: { sectors: ['insurance'], zone: 'Paris' },
      })
    })

    await waitFor(() => expect(apiFetch).toHaveBeenCalled())
    const body = bodyOfLastStartCall()
    expect(body.suggestion_criteria).toEqual({ sectors: ['insurance'], zone: 'Paris' })
    expect(body.suggestion_reason).toBeUndefined()
  })

  it('omits suggestion fields for a plain free search (undefined → dropped from JSON)', async () => {
    const { result } = renderHook(() => useAnalysis(), { wrapper: wrapper() })

    await act(async () => {
      await result.current.startAnalysis('BNP Paribas')
    })

    await waitFor(() => expect(apiFetch).toHaveBeenCalled())
    const body = bodyOfLastStartCall()
    expect(body.company_name).toBe('BNP Paribas')
    expect(body.suggestion_id).toBeUndefined()
    expect(body.suggestion_reason).toBeUndefined()
    // `JSON.stringify` drops undefined keys, so nothing bogus is sent server-side.
    expect(JSON.stringify(body)).not.toContain('suggestion')
  })

  // #2520 — le démarrage est dédoublonné par le serveur (`jobId` déterministe,
  // `in_flight` sans débit) : il se déclare idempotent pour être rejoué sur une
  // panne de redéploiement au lieu de finir en erreur.
  it('se déclare idempotent auprès du client HTTP partagé (#2520)', async () => {
    const { result } = renderHook(() => useAnalysis(), { wrapper: wrapper() })

    await act(async () => {
      await result.current.startAnalysis('BNP Paribas')
    })

    await waitFor(() => expect(apiFetch).toHaveBeenCalled())
    const call = apiFetch.mock.calls.at(-1)?.[0] as { method: string; idempotent?: boolean }
    expect(call.method).toBe('POST')
    expect(call.idempotent).toBe(true)
  })
})

/**
 * #2520 — « Réessayer » RELANCE. Il appelait `reset`, qui ANNULAIT le run côté
 * serveur et vidait l'écran : la carte promettait « relance-la, elle repartira
 * de la dernière étape réussie » et le bouton faisait l'inverse.
 */
describe('useAnalysis.retry — rejoue la même demande (#2520)', () => {
  beforeEach(() => {
    useAnalysisStore.setState({ runs: {} })
    apiFetch.mockReset()
  })

  const paths = () => apiFetch.mock.calls.map(call => (call[0] as { path: string }).path)

  it('un démarrage tombé en erreur se rejoue avec la MÊME demande', async () => {
    apiFetch
      .mockRejectedValueOnce(new Error('Service indisponible'))
      .mockResolvedValueOnce({ jobId: 'job-1', accountId: 'acct-1', launched: true })
    const { result } = renderHook(() => useAnalysis(), { wrapper: wrapper() })

    await act(async () => {
      await result.current.startAnalysis('BNP Paribas', undefined, '662042449', 'france')
    })
    expect(result.current.status).toBe('error')
    const firstBody = bodyOfLastStartCall()

    await act(async () => {
      await result.current.retry()
    })

    expect(paths()).toEqual(['/analysis/start', '/analysis/start'])
    expect(bodyOfLastStartCall()).toEqual(firstBody)
    expect(result.current.status).not.toBe('error')
  })

  it('un run échoué REPREND depuis sa dernière étape — jamais une annulation', async () => {
    apiFetch.mockImplementation(async ({ path }: { path: string }) =>
      path === '/analysis/start'
        ? { jobId: 'job-1', accountId: 'acct-1', launched: true }
        : { jobId: 'job-1', accountId: 'acct-1' },
    )
    const { result } = renderHook(() => useAnalysis(), { wrapper: wrapper() })
    await act(async () => {
      await result.current.startAnalysis('BNP Paribas')
    })
    act(() => useAnalysisStore.getState().setError('acct-1', 'interrompue'))
    expect(result.current.status).toBe('error')

    await act(async () => {
      await result.current.retry()
    })

    expect(paths()).toContain('/analysis/acct-1/resume')
    expect(paths()).not.toContain('/analysis/acct-1/cancel')
    expect(result.current.status).not.toBe('error')
    expect(result.current.accountId).toBe('acct-1')
  })

  it('une reprise refusée par le serveur reste une erreur lisible', async () => {
    apiFetch.mockImplementation(async ({ path }: { path: string }) => {
      if (path === '/analysis/start') return { jobId: 'job-1', accountId: 'acct-1', launched: true }
      throw new Error('Crédits épuisés')
    })
    const { result } = renderHook(() => useAnalysis(), { wrapper: wrapper() })
    await act(async () => {
      await result.current.startAnalysis('BNP Paribas')
    })
    act(() => useAnalysisStore.getState().setError('acct-1', 'interrompue'))

    await act(async () => {
      await result.current.retry()
    })

    expect(result.current.status).toBe('error')
    expect(result.current.error).toBe('Crédits épuisés')
  })
})

// Bug prod 19/07 (Théo, TF1) : re-chercher une entreprise déjà analysée < 30 j
// déclenche le result cache serveur — AUCUN job n'est enqueué. Le hook seedait
// quand même un run à 0% « Lancement de l'analyse » et s'abonnait à des events
// Socket.IO qui n'arriveraient jamais → carte figée à 0% pendant 30 min, dont le
// clic renvoyait sur le dossier périmé. `launched: false` doit ouvrir le dossier,
// jamais afficher une progression.
describe('useAnalysis.startAnalysis — court-circuit serveur (launched: false)', () => {
  beforeEach(() => {
    useAnalysisStore.setState({ runs: {} })
    apiFetch.mockReset()
    vi.mocked(subscribeToAnalysisRun).mockClear()
    toastInfo.mockClear()
  })

  it('cache hit : aucun run fantôme, aucun abonnement WS, ouverture directe du dossier', async () => {
    apiFetch.mockResolvedValue({ jobId: 'job-1', accountId: 'acct-cached', launched: false, reason: 'cache_hit' })
    const onComplete = vi.fn()
    const { result } = renderHook(() => useAnalysis({ onComplete }), { wrapper: wrapper() })

    await act(async () => {
      await result.current.startAnalysis('TF1')
    })

    await waitFor(() => expect(onComplete).toHaveBeenCalledWith('acct-cached'))
    // Rien dans le store → pas de carte « Lancement de l'analyse » à 0%.
    expect(useAnalysisStore.getState().runs).toEqual({})
    // Pas d'abonnement : il n'y a aucun event à attendre.
    expect(subscribeToAnalysisRun).not.toHaveBeenCalled()
    expect(result.current.status).toBe('idle')
  })

  it('lancement réel : le run est bien seedé et l’abonnement WS ouvert', async () => {
    apiFetch.mockResolvedValue({ jobId: 'job-1', accountId: 'acct-1', launched: true })
    const { result } = renderHook(() => useAnalysis(), { wrapper: wrapper() })

    await act(async () => {
      await result.current.startAnalysis('BNP Paribas')
    })

    await waitFor(() => expect(useAnalysisStore.getState().runs['acct-1']).toBeDefined())
    // Plus de hooks d'abonnement : la navigation de fin est branchée sur l'ÉTAT
    // du run (voir le test « le run passe à completed … » plus bas), pas sur le
    // flux d'événements — un client qui rate `analysis:done` doit sortir quand même.
    expect(subscribeToAnalysisRun).toHaveBeenCalledWith('acct-1', expect.anything())
    // Un lancement RÉEL part bien de zéro : nous venons de le déclencher, donc
    // 0 % est une affirmation vraie, pas une invention.
    expect(useAnalysisStore.getState().runs['acct-1'].percent).toBe(0)
  })

  // Le cas ALSEDIS. Revenir sur /search pour une analyse DÉJÀ en vol appelait
  // `start()`, qui réinitialisait un run à trois phases d'avance en
  // « Lancement de l'analyse — 0 % ». Le client écrasait une position réelle par
  // une position fabriquée, puis attendait des events déjà émis.
  it('job déjà en vol : le run est ADOPTÉ sans position inventée, jamais remis à 0%', async () => {
    apiFetch.mockResolvedValue({ jobId: 'job-1', accountId: 'acct-1', launched: true, reason: 'in_flight' })
    const { result } = renderHook(() => useAnalysis(), { wrapper: wrapper() })

    await act(async () => {
      await result.current.startAnalysis('BNP Paribas')
    })

    await waitFor(() => expect(useAnalysisStore.getState().runs['acct-1']).toBeDefined())
    expect(subscribeToAnalysisRun).toHaveBeenCalled()
    // Position INCONNUE — pas 0 %. Le réconciliateur la remplira depuis l'état.
    expect(useAnalysisStore.getState().runs['acct-1'].percent).toBeNull()
    // #3666 — l'écran ne reçoit aucun chiffre : l'étape, inconnue tant que rien n'est arrivé.
    expect(result.current).not.toHaveProperty('percent')
    expect(result.current.currentStep).toBeNull()
  })

  // #2704.1 — Bedros/Adel (Apricot Labs, 22/09/2026) : rejoindre le run d'un
  // collègue SANS le dire se lisait comme un plantage. Le serveur nomme
  // désormais l'auteur (`startedBy`) ; le front le dit à l'écran par un toast.
  it('rejoindre le run d’un collègue le dit — toast nommant qui l’a lancé (#2704.1)', async () => {
    apiFetch.mockResolvedValue({
      jobId: 'job-1',
      accountId: 'acct-1',
      launched: true,
      reason: 'in_flight',
      startedBy: { firstName: 'Bedros', avatarUrl: null },
    })
    const { result } = renderHook(() => useAnalysis(), { wrapper: wrapper() })

    await act(async () => {
      await result.current.startAnalysis('BNP Paribas')
    })

    await waitFor(() => expect(useAnalysisStore.getState().runs['acct-1']).toBeDefined())
    expect(toastInfo).toHaveBeenCalledTimes(1)
    expect(toastInfo.mock.calls[0]?.[0]).toContain('Bedros')
  })

  it('un run qu’on a lancé SOI-même (`startedBy` absent) ne déclenche aucun toast', async () => {
    apiFetch.mockResolvedValue({ jobId: 'job-1', accountId: 'acct-1', launched: true, reason: 'in_flight' })
    const { result } = renderHook(() => useAnalysis(), { wrapper: wrapper() })

    await act(async () => {
      await result.current.startAnalysis('BNP Paribas')
    })

    await waitFor(() => expect(useAnalysisStore.getState().runs['acct-1']).toBeDefined())
    expect(toastInfo).not.toHaveBeenCalled()
  })

  it('n’écrase pas un run déjà suivi quand le serveur répond in_flight', async () => {
    // Un run local à 75 % (trois phases faites), comme après un rechargement
    // où le store persisté a survécu.
    useAnalysisStore.getState().start('acct-1', 'job-1', 'BNP Paribas')
    useAnalysisStore.getState().setProgress('acct-1', { percent: 75, phase: 'classify_complete' })

    apiFetch.mockResolvedValue({ jobId: 'job-1', accountId: 'acct-1', launched: true, reason: 'in_flight' })
    const { result } = renderHook(() => useAnalysis(), { wrapper: wrapper() })

    await act(async () => {
      await result.current.startAnalysis('BNP Paribas')
    })

    expect(useAnalysisStore.getState().runs['acct-1'].percent).toBe(75)
  })

  // Le défaut le plus grave : l'écran ne se libérait QUE sur `analysis:done`.
  // Socket mort / onglet rouvert après la fin ⇒ « Analyse en cours » à vie sur
  // un dossier prêt. La fin doit être détectée depuis l'ÉTAT du run.
  it('le run passe à completed sans event WS : l’écran se libère quand même', async () => {
    apiFetch.mockResolvedValue({ jobId: 'job-1', accountId: 'acct-1', launched: true })
    const onComplete = vi.fn()
    const { result } = renderHook(() => useAnalysis({ onComplete }), { wrapper: wrapper() })

    await act(async () => {
      await result.current.startAnalysis('BNP Paribas')
    })
    await waitFor(() => expect(useAnalysisStore.getState().runs['acct-1']).toBeDefined())
    expect(onComplete).not.toHaveBeenCalled()

    // Aucun event Socket.IO — c'est le réconciliateur (lecture d'état) qui a
    // marqué le run terminé.
    await act(async () => {
      useAnalysisStore.getState().setComplete('acct-1')
    })

    await waitFor(() => expect(onComplete).toHaveBeenCalledWith('acct-1'))
    expect(onComplete).toHaveBeenCalledTimes(1)
  })
})

/**
 * #2212.12 — LE RÉSULTAT RÉEL, PAS LE CLIC SUR « LANCER ».
 *
 * Le guide `analyser-un-compte` (`guide-registry.ts`) est le seul auditeur de
 * cet événement : ce test prouve que `startAnalysis` le dispatche vraiment,
 * sur chaque scénario de réponse serveur — pas seulement le lancement neuf.
 */
describe('useAnalysis.startAnalysis — dispatche le résultat réel du guide (#2212.12)', () => {
  beforeEach(() => {
    useAnalysisStore.setState({ runs: {} })
    apiFetch.mockReset()
  })

  it('lancement neuf : dispatche `bellum:guide-analysis-started` avec le compte réel', async () => {
    apiFetch.mockResolvedValue({ jobId: 'job-1', accountId: 'acct-1', launched: true })
    const onResult = vi.fn()
    window.addEventListener('bellum:guide-analysis-started', onResult)
    const { result } = renderHook(() => useAnalysis(), { wrapper: wrapper() })

    await act(async () => {
      await result.current.startAnalysis('BNP Paribas')
    })

    expect(onResult).toHaveBeenCalledTimes(1)
    expect((onResult.mock.calls[0]![0] as CustomEvent).detail).toEqual({ accountId: 'acct-1' })
    window.removeEventListener('bellum:guide-analysis-started', onResult)
  })

  it('dossier déjà en cache (aucun run enqueué) : dispatche quand même — c’est un résultat réel', async () => {
    apiFetch.mockResolvedValue({ jobId: 'job-1', accountId: 'acct-1', launched: false })
    const onResult = vi.fn()
    window.addEventListener('bellum:guide-analysis-started', onResult)
    const { result } = renderHook(() => useAnalysis(), { wrapper: wrapper() })

    await act(async () => {
      await result.current.startAnalysis('BNP Paribas')
    })

    expect(onResult).toHaveBeenCalledTimes(1)
    window.removeEventListener('bellum:guide-analysis-started', onResult)
  })

  it('un échec réseau ne dispatche rien — il n’y a pas de résultat à annoncer', async () => {
    apiFetch.mockRejectedValue(new Error('offline'))
    const onResult = vi.fn()
    window.addEventListener('bellum:guide-analysis-started', onResult)
    const { result } = renderHook(() => useAnalysis(), { wrapper: wrapper() })

    await act(async () => {
      await result.current.startAnalysis('BNP Paribas')
    })

    expect(onResult).not.toHaveBeenCalled()
    window.removeEventListener('bellum:guide-analysis-started', onResult)
  })
})

// #3143 — recette prod 28/09 (compte LA POSTE) : « Actualiser l'analyse »
// lancée depuis /search, puis la fiche du compte (URL directe, reload, clic
// depuis la liste) n'affichait AUCUN signal (ni bloc plein écran, ni ligne
// compacte) pendant que l'analyse tournait réellement (`/analysis/status`
// répondait `active` à 50 % puis 75 %). Cause : `AccountDetail.tsx` décide
// tout sur `account.status === 'analyzing'` (ligne du compte lue via
// `useAccount` / `accountKeys.detail`), et cette requête a un `staleTime` de
// 5 min (`apps/web/src/lib/api/query-client.ts`) — une fiche déjà visitée
// juste avant de cliquer « Actualiser » restait donc `completed` en cache
// jusqu'à 5 minutes, ce qui couvre largement les 3-6 minutes d'un run. Le
// SEUL endroit qui invalidait `accountKeys.detail` était `reset()` (annulation)
// et la reprise après erreur — jamais le lancement heureux lui-même.
describe('useAnalysis.startAnalysis — le compte en cache est invalidé au lancement réel (#3143)', () => {
  beforeEach(() => {
    useAnalysisStore.setState({ runs: {} })
    apiFetch.mockReset()
  })

  it('un lancement NEUF (launched=true, pas in_flight) invalide account.detail(accountId)', async () => {
    // gcTime non nul : sans observateur monté sur `accountKeys.detail`, un
    // `gcTime: 0` purge la donnée entre le `setQueryData` et l'assertion — un
    // faux rouge dû au ramasse-miettes, pas à l'invalidation elle-même.
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 60_000, staleTime: 0 } } })
    // La fiche était déjà en cache AVANT la relance — exactement ce qu'un clic
    // « Actualiser l'analyse » depuis /accounts/:id laisse dans le cache.
    qc.setQueryData(accountKeys.detail('acct-1'), { id: 'acct-1', status: 'completed' })
    apiFetch.mockResolvedValue({ jobId: 'job-1', accountId: 'acct-1', launched: true })

    const { result } = renderHook(() => useAnalysis(), { wrapper: wrapper(qc) })

    await act(async () => {
      await result.current.startAnalysis('LA POSTE')
    })

    expect(qc.getQueryState(accountKeys.detail('acct-1'))?.isInvalidated).toBe(true)
  })

  it('un run REJOINT (`reason: in_flight`) invalide aussi la fiche — l’analyse tourne déjà côté serveur', async () => {
    // gcTime non nul : sans observateur monté sur `accountKeys.detail`, un
    // `gcTime: 0` purge la donnée entre le `setQueryData` et l'assertion — un
    // faux rouge dû au ramasse-miettes, pas à l'invalidation elle-même.
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 60_000, staleTime: 0 } } })
    qc.setQueryData(accountKeys.detail('acct-1'), { id: 'acct-1', status: 'completed' })
    apiFetch.mockResolvedValue({ jobId: 'job-1', accountId: 'acct-1', launched: true, reason: 'in_flight' })

    const { result } = renderHook(() => useAnalysis(), { wrapper: wrapper(qc) })

    await act(async () => {
      await result.current.startAnalysis('LA POSTE')
    })

    expect(qc.getQueryState(accountKeys.detail('acct-1'))?.isInvalidated).toBe(true)
  })

  it('un simple ré-ouvre depuis le cache (`launched=false`, `cache_hit`) n’invalide RIEN — aucun run ne tourne', async () => {
    // gcTime non nul : sans observateur monté sur `accountKeys.detail`, un
    // `gcTime: 0` purge la donnée entre le `setQueryData` et l'assertion — un
    // faux rouge dû au ramasse-miettes, pas à l'invalidation elle-même.
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 60_000, staleTime: 0 } } })
    qc.setQueryData(accountKeys.detail('acct-1'), { id: 'acct-1', status: 'completed' })
    apiFetch.mockResolvedValue({ jobId: 'job-1', accountId: 'acct-1', launched: false, reason: 'cache_hit' })

    const { result } = renderHook(() => useAnalysis(), { wrapper: wrapper(qc) })

    await act(async () => {
      await result.current.startAnalysis('LA POSTE')
    })

    expect(qc.getQueryState(accountKeys.detail('acct-1'))?.isInvalidated).toBe(false)
  })
})

/**
 * #3666.8 — recette prod 08/10 (call bêta, 42:44) : « si tu actualises ta
 * page, tu auras le truc qui apparaîtra à gauche » — un compte neuf
 * n'apparaissait dans `/accounts` qu'après un rechargement manuel. Même cause
 * que #3143 (ci-dessus), un étage plus haut : `accountKeys.detail` était
 * invalidé au lancement, jamais `accountKeys.list` — dont le `staleTime` est
 * de 30 s (`useAccounts.ts`), largement assez pour couvrir tout l'aller-retour
 * recherche → fiche.
 */
describe('useAnalysis.startAnalysis — la liste des comptes est invalidée au lancement (#3666.8)', () => {
  beforeEach(() => {
    useAnalysisStore.setState({ runs: {} })
    apiFetch.mockReset()
  })

  it('un lancement NEUF invalide aussi `accounts.list(userId)`, pas seulement la fiche', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 60_000, staleTime: 0 } } })
    qc.setQueryData([...accountKeys.list('u-1'), {}], { pages: [], pageParams: [] })
    apiFetch.mockResolvedValue({ jobId: 'job-1', accountId: 'acct-1', launched: true })

    const { result } = renderHook(() => useAnalysis(), { wrapper: wrapper(qc) })

    await act(async () => {
      await result.current.startAnalysis('LA POSTE')
    })

    expect(qc.getQueryState([...accountKeys.list('u-1'), {}])?.isInvalidated).toBe(true)
  })

  it('un run REJOINT (`in_flight`) invalide aussi la liste — un collègue peut l’avoir lancé sur un compte neuf', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 60_000, staleTime: 0 } } })
    qc.setQueryData([...accountKeys.list('u-1'), {}], { pages: [], pageParams: [] })
    apiFetch.mockResolvedValue({ jobId: 'job-1', accountId: 'acct-1', launched: true, reason: 'in_flight' })

    const { result } = renderHook(() => useAnalysis(), { wrapper: wrapper(qc) })

    await act(async () => {
      await result.current.startAnalysis('LA POSTE')
    })

    expect(qc.getQueryState([...accountKeys.list('u-1'), {}])?.isInvalidated).toBe(true)
  })

  it('un simple ré-ouvre depuis le cache (`cache_hit`) n’invalide pas la liste — le compte y est déjà', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 60_000, staleTime: 0 } } })
    qc.setQueryData([...accountKeys.list('u-1'), {}], { pages: [], pageParams: [] })
    apiFetch.mockResolvedValue({ jobId: 'job-1', accountId: 'acct-1', launched: false, reason: 'cache_hit' })

    const { result } = renderHook(() => useAnalysis(), { wrapper: wrapper(qc) })

    await act(async () => {
      await result.current.startAnalysis('LA POSTE')
    })

    expect(qc.getQueryState([...accountKeys.list('u-1'), {}])?.isInvalidated).toBe(false)
  })
})
