/**
 * #2116.43 et .53 — CE QUE LE BOUTON DIT APRÈS LE CLIC.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER TIENT
 * ─────────────────────────────────────────────────────────────────────────────
 *  · #2116.43 — aucune exécution ANNONCÉE avant confirmation. Le succès d'une
 *    écriture ne s'affiche qu'après la résolution de la mutation : on fait
 *    ÉCHOUER chaque geste et on vérifie qu'aucun succès n'a été annoncé. La
 *    couche des boutons (`DossierCta.tsx`) n'annonce rien du tout — elle n'a
 *    aucun `toast`, et une garde d'architecture le tient
 *    (`dossier-cta-interdits.test.ts`).
 *  · #2116.53 — succès, échec, reprise et idempotence, ENTRÉE PAR ENTRÉE du
 *    registre. Le tableau des scénarios est confronté au registre : une entrée
 *    qui déclare un succès ET un échec sans scénario fait échouer la suite,
 *    donc rien ne se teste « en général » pendant qu'un bouton passe à côté.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI L'IDEMPOTENCE SE TESTE SUR LA PRIMITIVE, ET NON ENTRÉE PAR ENTRÉE
 * ─────────────────────────────────────────────────────────────────────────────
 * Tout élément cliquable de la barre passe par `DossierCtaButton` /
 * `DossierCtaMenuItem` / `DossierCtaSubTrigger` — `dossier-cta-contract.test.ts`
 * l'impose (un `<Button>` nu n'accepte pas de `cta`, il ne compile pas). Le
 * verrou de double clic vit donc à UN endroit, et le prouver une fois le prouve
 * pour les seize. Le doubler seize fois aurait donné seize tests qui mesurent la
 * même ligne.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { DOSSIER_CTA_CONTRACTS } from '@bellum/contracts'
import type { Account } from '@bellum/contracts'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/** La phrase que l'API renvoie. Piège Nest : elle vit dans `message`, jamais
 *  dans `error` — une erreur qui perd sa phrase affiche « Bad Request ». */
const API_MESSAGE = 'Ce compte n’appartient pas à ton espace.'

const apiFetchMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api', () => ({ apiFetch: (...args: unknown[]) => apiFetchMock(...args) }))

const refreshDimensionMock = vi.hoisted(() => vi.fn())
const archiveMock = vi.hoisted(() => vi.fn())
const detachMock = vi.hoisted(() => vi.fn())
const deleteMock = vi.hoisted(() => vi.fn())
const setBestReferenceMock = vi.hoisted(() => vi.fn())
const setBetProfileMock = vi.hoisted(() => vi.fn())
vi.mock('@/features/accounts/api', async () => {
  const actual = await vi.importActual<typeof import('@/features/accounts/api')>('@/features/accounts/api')
  return {
    ...actual,
    accountsApi: {
      ...actual.accountsApi,
      refreshDimension: (...a: unknown[]) => refreshDimensionMock(...a),
      archive: (...a: unknown[]) => archiveMock(...a),
      detachAccount: (...a: unknown[]) => detachMock(...a),
      delete: (...a: unknown[]) => deleteMock(...a),
      setBestReference: (...a: unknown[]) => setBestReferenceMock(...a),
      setBetProfile: (...a: unknown[]) => setBetProfileMock(...a),
    },
  }
})
const createTargetListMock = vi.hoisted(() => vi.fn())
const addTargetItemMock = vi.hoisted(() => vi.fn())
vi.mock('@/features/target-lists/api', () => ({
  targetListsApi: {
    create: (...a: unknown[]) => createTargetListMock(...a),
    addItem: (...a: unknown[]) => addTargetItemMock(...a),
  },
}))
vi.mock('@/lib/hooks/use-session', () => ({ useSession: () => ({ user: { id: 'user-1' } }) }))

const exportAccountPdfMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/account-pdf/export', () => ({
  exportAccountPdf: (...a: unknown[]) => exportAccountPdfMock(...a),
  renderAccountPdfBlob: vi.fn(),
}))
vi.mock('@/features/plan-features/useFeatureLock', () => ({
  useFeatureLock: () => ({
    locked: false,
    dimClassName: '',
    guard: (handler: (...args: unknown[]) => void) => handler,
    dialog: null,
  }),
}))
vi.mock('@/features/brand/brand-context', () => ({ useBrand: () => ({}) }))

const toastSuccess = vi.hoisted(() => vi.fn())
const toastError = vi.hoisted(() => vi.fn())
const toastWarning = vi.hoisted(() => vi.fn())
const toastInfo = vi.hoisted(() => vi.fn())
vi.mock('sonner', () => ({
  toast: {
    success: (...a: unknown[]) => toastSuccess(...a),
    error: (...a: unknown[]) => toastError(...a),
    warning: (...a: unknown[]) => toastWarning(...a),
    info: (...a: unknown[]) => toastInfo(...a),
  },
}))

import { useDecideAccountGate } from '@/features/accounts/gate/useAccountGate'
import {
  useArchiveAccountFromDossier,
  useDeleteAccountFromDossier,
  useDetachAccountFromDossier,
} from '@/features/accounts/hooks/useAccountAdminActions'
import { useSetBestReference } from '@/features/accounts/hooks/useBestReference'
import { useSetBetProfile } from '@/features/accounts/hooks/useBetProfile'
import { useCreateTargetFromAccount } from '@/features/target-lists/useCreateTargetFromAccount'
import { useCreateTargetFromCrmPresence } from '@/features/target-lists/useCreateTargetFromCrmPresence'
import { useRefreshDimension } from '@/features/accounts/hooks/useRefreshDimension'
import { useAccountPdfExport } from '@/features/accounts/hooks/useAccountPdfExport'
import { DossierCtaButton } from './DossierCta'

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

const ACCOUNT = { id: 'acc-1', company_name: 'ACME Industries' } as unknown as Account

type Outcome = 'success' | 'failure'

/** Un geste du registre, joué en vrai jusqu'à son annonce. */
type Scenario = {
  /** Joue le geste et rend la main quand une annonce est tombée. */
  fire: (outcome: Outcome) => Promise<void>
  /** Ce que le succès doit contenir — l'OBJET, jamais un « c'est fait » nu. */
  successContains: string
}

async function fireGate(gate: 'prioritised' | 'pending' | 'parked', outcome: Outcome) {
  if (outcome === 'success') {
    apiFetchMock.mockResolvedValue({ id: 'acc-1', priority_gate: gate, gate_reason: null, gate_decided_at: null })
  } else {
    apiFetchMock.mockRejectedValue(new Error(API_MESSAGE))
  }
  const { result } = renderHook(() => useDecideAccountGate('acc-1', 'ACME Industries'), { wrapper })
  await act(async () => {
    result.current.mutate({ gate, reason: gate === 'parked' ? 'Pas de budget' : null })
  })
  await waitFor(() => expect(toastSuccess.mock.calls.length + toastError.mock.calls.length).toBeGreaterThan(0))
}

/**
 * Les trois gestes administratifs du menu « … » (#2117.36-38). Ils passent par
 * `useAccountAdminActions`, qui porte sa PROPRE couche d'annonce : le succès
 * NOMME le compte, et l'échec garde la phrase de l'API en description — sans
 * elle, un refus d'autorisation s'afficherait « Erreur lors de l'archivage »,
 * qui ne dit pas ce qui s'est passé.
 */
async function fireAdminAction(
  useHook: () => { mutate: (input: { accountId: string; companyName: string | null }) => void },
  apiMock: { mockResolvedValue: (v: unknown) => void; mockRejectedValue: (e: unknown) => void },
  resolved: unknown,
  outcome: Outcome,
) {
  if (outcome === 'success') apiMock.mockResolvedValue(resolved)
  else apiMock.mockRejectedValue(new Error(API_MESSAGE))
  const { result } = renderHook(() => useHook(), { wrapper })
  await act(async () => {
    result.current.mutate({ accountId: 'acc-1', companyName: 'ACME Industries' })
  })
  await waitFor(() => expect(toastSuccess.mock.calls.length + toastError.mock.calls.length).toBeGreaterThan(0))
}

/** #2165.13 — le marqueur de meilleure référence. Contrairement aux trois
 *  gestes administratifs, l'annonce ne nomme pas le compte (elle nomme le
 *  RÉGLAGE, « référence ») : `successContains` le reflète. */
async function fireBestReference(outcome: Outcome) {
  if (outcome === 'success') setBestReferenceMock.mockResolvedValue({ id: 'acc-1', is_best_reference: true })
  else setBestReferenceMock.mockRejectedValue(new Error(API_MESSAGE))
  const { result } = renderHook(() => useSetBestReference(), { wrapper })
  await act(async () => {
    result.current.mutate({ id: 'acc-1', value: true })
  })
  await waitFor(() => expect(toastSuccess.mock.calls.length + toastError.mock.calls.length).toBeGreaterThan(0))
}

/** #3245 — déclarer le profil de pari : une écriture, un toast de succès. */
async function fireBetProfile(outcome: Outcome) {
  if (outcome === 'success') setBetProfileMock.mockResolvedValue({ id: 'acc-1', horizon: 'long' })
  else setBetProfileMock.mockRejectedValue(new Error(API_MESSAGE))
  const { result } = renderHook(() => useSetBetProfile(), { wrapper })
  await act(async () => {
    result.current.mutate({ id: 'acc-1', profile: { horizon: 'long' }, companyName: 'ACME Industries' })
  })
  await waitFor(() => expect(toastSuccess.mock.calls.length + toastError.mock.calls.length).toBeGreaterThan(0))
}

/** #2164.44 — « Créer une cible » : DEUX écritures (liste, puis élément).
 *  Le succès nomme le compte ; l'échec garde la phrase de l'API. */
async function fireCreateTarget(outcome: Outcome) {
  if (outcome === 'success') {
    createTargetListMock.mockResolvedValue({ id: 'tl-1', name: 'ACME Industries' })
    addTargetItemMock.mockResolvedValue({ id: 'ti-1' })
  } else {
    createTargetListMock.mockRejectedValue(new Error(API_MESSAGE))
  }
  const { result } = renderHook(() => useCreateTargetFromAccount(), { wrapper })
  await act(async () => {
    result.current.mutate({ accountId: 'acc-1', companyName: 'ACME Industries' })
  })
  await waitFor(() => expect(toastSuccess.mock.calls.length + toastError.mock.calls.length).toBeGreaterThan(0))
}

/** Épopée #2853 (#2157.7) — même patron que `fireCreateTarget`, `source`/
 *  `provenance: 'crm'` au lieu de `'analysis'`. */
async function fireCreateTargetFromCrm(outcome: Outcome) {
  if (outcome === 'success') {
    createTargetListMock.mockResolvedValue({ id: 'tl-2', name: 'ACME Industries' })
    addTargetItemMock.mockResolvedValue({ id: 'ti-2' })
  } else {
    createTargetListMock.mockRejectedValue(new Error(API_MESSAGE))
  }
  const { result } = renderHook(() => useCreateTargetFromCrmPresence(), { wrapper })
  await act(async () => {
    result.current.mutate({ accountId: 'acc-1', companyName: 'ACME Industries' })
  })
  await waitFor(() => expect(toastSuccess.mock.calls.length + toastError.mock.calls.length).toBeGreaterThan(0))
}

const SCENARIOS: Record<string, Scenario> = {
  'dossier.moreActions.createTarget': {
    fire: fireCreateTarget,
    successContains: 'ACME Industries',
  },
  'dossier.moreActions.createTargetFromCrm': {
    fire: fireCreateTargetFromCrm,
    successContains: 'ACME Industries',
  },
  'dossier.moreActions.bestReference': {
    fire: fireBestReference,
    successContains: 'référence',
  },
  'dossier.moreActions.betProfile': {
    fire: fireBetProfile,
    successContains: 'ACME Industries',
  },
  'dossier.moreActions.archive': {
    fire: outcome => fireAdminAction(useArchiveAccountFromDossier, archiveMock, { archived: true }, outcome),
    successContains: 'ACME Industries',
  },
  'dossier.moreActions.detach': {
    fire: outcome =>
      fireAdminAction(useDetachAccountFromDossier, detachMock, { detachedName: 'ACME Industries' }, outcome),
    successContains: 'ACME Industries',
  },
  'dossier.moreActions.delete': {
    fire: outcome => fireAdminAction(useDeleteAccountFromDossier, deleteMock, { deleted: true }, outcome),
    successContains: 'ACME Industries',
  },
  'dossier.gate.prioritise': {
    fire: outcome => fireGate('prioritised', outcome),
    successContains: 'ACME Industries',
  },
  'dossier.gate.reopen': {
    fire: outcome => fireGate('pending', outcome),
    successContains: 'ACME Industries',
  },
  'dossier.gate.park.confirm': {
    fire: outcome => fireGate('parked', outcome),
    successContains: 'ACME Industries',
  },
  'dossier.refresh.dimension': {
    fire: async outcome => {
      if (outcome === 'success') refreshDimensionMock.mockResolvedValue({ dimension: 'signals', remaining: 7 })
      else refreshDimensionMock.mockRejectedValue(new Error(API_MESSAGE))
      const { result } = renderHook(() => useRefreshDimension('acc-1'), { wrapper })
      await act(async () => {
        result.current.mutate('signals')
      })
      await waitFor(() => expect(toastSuccess.mock.calls.length + toastError.mock.calls.length).toBeGreaterThan(0))
    },
    successContains: 'Signaux',
  },
  'dossier.pdf.export': {
    fire: async outcome => {
      if (outcome === 'success') exportAccountPdfMock.mockResolvedValue(undefined)
      else exportAccountPdfMock.mockRejectedValue(new Error(API_MESSAGE))
      const { result } = renderHook(() => useAccountPdfExport(ACCOUNT, []), { wrapper })
      await act(async () => {
        await result.current.exportPdf()
      })
      await waitFor(() => expect(toastSuccess.mock.calls.length + toastError.mock.calls.length).toBeGreaterThan(0))
    },
    successContains: 'PDF',
  },
}

/** Les entrées qui DÉCLARENT un succès et un échec : celles dont l'issue
 *  s'observe. Le registre décide de la liste, pas ce fichier. */
const OBSERVABLE = DOSSIER_CTA_CONTRACTS.filter(cta => cta.successStateKey !== null && cta.failureStateKey !== null)

beforeEach(() => {
  apiFetchMock.mockReset()
  refreshDimensionMock.mockReset()
  exportAccountPdfMock.mockReset()
  archiveMock.mockReset()
  detachMock.mockReset()
  deleteMock.mockReset()
  setBestReferenceMock.mockReset()
  setBetProfileMock.mockReset()
  toastSuccess.mockReset()
  toastError.mockReset()
  toastWarning.mockReset()
  toastInfo.mockReset()
})

describe('#2116.53 — le tableau des scénarios est confronté au registre', () => {
  it('LIT le registre, et couvre CHAQUE entrée dont l’issue s’observe', () => {
    expect(OBSERVABLE.length).toBeGreaterThanOrEqual(5)
    const sansScenario = OBSERVABLE.filter(cta => !SCENARIOS[cta.id]).map(cta => cta.id)
    expect(sansScenario, `entrée sans scénario d’issue : ${sansScenario.join(', ')}`).toEqual([])
    // Et l'inverse : un scénario qui ne correspond à aucune entrée mesurerait
    // un bouton qui n'existe plus.
    const orphelins = Object.keys(SCENARIOS).filter(id => !OBSERVABLE.some(cta => cta.id === id))
    expect(orphelins, `scénario sans entrée : ${orphelins.join(', ')}`).toEqual([])
  })

  it('les entrées SANS issue observable n’en ont vraiment aucune à observer', () => {
    // `dossier.gate.park.reason` remplit un champ, `dossier.gate.park.cancel`
    // ferme une fenêtre : rien n'est écrit, donc il n'y a ni succès ni échec à
    // annoncer. C'est la contrepartie de la règle — sans elle, on pourrait
    // vider un `successStateKey` pour échapper au tableau.
    const muettes = DOSSIER_CTA_CONTRACTS.filter(cta => !OBSERVABLE.includes(cta))
    expect(muettes.length).toBeGreaterThan(0)
    const fautives = muettes.filter(cta => cta.effect === 'mutate').map(cta => cta.id)
    expect(fautives, `écriture serveur sans issue déclarée : ${fautives.join(', ')}`).toEqual([])
  })
})

describe.each(OBSERVABLE.map(cta => [cta.id] as const))('#2116.43, .53 — %s', id => {
  const scenario = SCENARIOS[id]

  it('succès : l’annonce tombe APRÈS la résolution, et elle nomme l’objet', async () => {
    await scenario.fire('success')
    expect(toastSuccess).toHaveBeenCalledTimes(1)
    expect(String(toastSuccess.mock.calls[0][0])).toContain(scenario.successContains)
    expect(toastError).not.toHaveBeenCalled()
  })

  it('échec : la phrase de l’API est rendue, et AUCUN succès n’est annoncé — #2116.43', async () => {
    await scenario.fire('failure')
    expect(toastSuccess, 'un succès a été annoncé sur un geste qui a échoué').not.toHaveBeenCalled()
    expect(toastError).toHaveBeenCalled()
    const rendu = toastError.mock.calls[0].map(part => JSON.stringify(part)).join(' ')
    // La phrase vient de `message`, pas de `error` : une `BadRequestException`
    // Nest range sa raison dans `message`, et l'écran qui lit `error` affiche
    // « Bad Request » à la place du texte écrit pour l'humain.
    expect(rendu, `l’échec ne porte pas la phrase de l’API : ${rendu}`).toContain(API_MESSAGE)
  })

  it('reprise : après un échec, un second geste repart — rien ne reste verrouillé', async () => {
    await scenario.fire('failure')
    expect(toastError).toHaveBeenCalledTimes(1)
    toastError.mockReset()
    toastSuccess.mockReset()
    await scenario.fire('success')
    expect(toastSuccess).toHaveBeenCalledTimes(1)
  })
})

describe('#2116.53 — idempotence : un double clic ne déclenche qu’UNE fois', () => {
  it('deux clics avant que le premier ait rendu la main : une seule exécution', async () => {
    let resolve: (() => void) | undefined
    const handler = vi.fn(() => new Promise<void>(done => (resolve = done)))
    render(
      <DossierCtaButton cta="dossier.gate.prioritise" onClick={handler}>
        Prioriser
      </DossierCtaButton>,
    )
    const bouton = screen.getByRole('button', { name: /Prioriser/ })
    fireEvent.click(bouton)
    fireEvent.click(bouton)
    fireEvent.click(bouton)
    expect(handler).toHaveBeenCalledTimes(1)

    // Une fois la main rendue, le bouton REPART : le verrou protège du double
    // clic, il ne condamne pas le bouton.
    await act(async () => {
      resolve?.()
    })
    fireEvent.click(bouton)
    expect(handler).toHaveBeenCalledTimes(2)
  })

  it('un geste EN COURS (`busy`) n’accepte aucun clic', () => {
    const handler = vi.fn()
    render(
      <DossierCtaButton cta="dossier.gate.prioritise" busy onClick={handler}>
        Prioriser
      </DossierCtaButton>,
    )
    fireEvent.click(screen.getByRole('button', { name: /Prioriser/ }))
    expect(handler).not.toHaveBeenCalled()
  })

  it('après un ÉCHEC, le second clic relance — le verrou tombe aussi sur le rejet', async () => {
    let reject: ((error: Error) => void) | undefined
    const handler = vi.fn(() => new Promise<void>((_, ko) => (reject = ko)))
    render(
      <DossierCtaButton cta="dossier.gate.prioritise" onClick={handler}>
        Prioriser
      </DossierCtaButton>,
    )
    const bouton = screen.getByRole('button', { name: /Prioriser/ })
    fireEvent.click(bouton)
    await act(async () => {
      reject?.(new Error(API_MESSAGE))
    })
    fireEvent.click(bouton)
    expect(handler).toHaveBeenCalledTimes(2)
  })

  it('n’attrape pas ce qu’il ne vise pas : deux clics SÉPARÉS passent tous les deux', async () => {
    const handler = vi.fn()
    render(
      <DossierCtaButton cta="dossier.gate.prioritise" onClick={handler}>
        Prioriser
      </DossierCtaButton>,
    )
    const bouton = screen.getByRole('button', { name: /Prioriser/ })
    fireEvent.click(bouton)
    await act(async () => {
      await Promise.resolve()
    })
    fireEvent.click(bouton)
    expect(handler).toHaveBeenCalledTimes(2)
  })
})
