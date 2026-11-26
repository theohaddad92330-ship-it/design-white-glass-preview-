import { QueryClient } from '@tanstack/react-query'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createJSONStorage } from 'zustand/middleware'
import { reconcileAnalysisStatus, type AnalysisStatusPayload } from './analysis-status-sync'
import { useAnalysisStore } from '@/stores/analysisStore'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const ACCOUNT = 'acct-alsedis'

function qc(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
}

function status(patch: Partial<AnalysisStatusPayload> = {}): AnalysisStatusPayload {
  return { jobId: 'job-1', state: 'active', percent: null, phase: null, completedPhases: [], ...patch }
}

beforeAll(() => {
  useAnalysisStore.persist.setOptions({
    storage: createJSONStorage(() => ({ getItem: () => null, setItem: () => {}, removeItem: () => {} })),
  })
})

beforeEach(() => {
  useAnalysisStore.setState({ runs: {} })
})

describe('reconcileAnalysisStatus — la position vient de l’état, pas du flux', () => {
  // LE test. Un client qui rejoint tard un run dont les phases sont faites doit
  // voir la vraie position. C'est le rapport ALSEDIS : dossier complet côté
  // serveur, « Analyse en cours… 0 % » côté SPA.
  it('un client qui rejoint tard voit la VRAIE position, pas 0%', () => {
    useAnalysisStore.getState().adopt(ACCOUNT, 'job-1', 'ALSEDIS')
    expect(useAnalysisStore.getState().runs[ACCOUNT].percent).toBeNull()

    reconcileAnalysisStatus(
      ACCOUNT,
      status({ percent: 75, phase: 'classify_complete', completedPhases: ['research', 'contacts', 'classify'] }),
      qc(),
    )

    const run = useAnalysisStore.getState().runs[ACCOUNT]
    expect(run.percent).toBe(75)
    // …et la checklist est reconstruite : afficher la seule étape 1 alors que
    // trois phases sont finies est le même mensonge sous une autre forme.
    expect(run.completedSteps).toContain('classification')
    expect(run.completedSteps.length).toBeGreaterThanOrEqual(6)
  })

  it('un run terminé côté serveur libère l’écran même sans event WS', () => {
    useAnalysisStore.getState().adopt(ACCOUNT, 'job-1', 'ALSEDIS')
    const onDone = vi.fn()

    reconcileAnalysisStatus(ACCOUNT, status({ state: 'completed', percent: 100 }), qc(), { onDone })

    const run = useAnalysisStore.getState().runs[ACCOUNT]
    expect(run.state).toBe('completed')
    expect(run.percent).toBe(100)
    expect(onDone).toHaveBeenCalledWith(ACCOUNT)
  })

  // R5-FIX (recette prod 14/10) — « 75 » puis « 76 comptes analysés » dans le
  // sélecteur du chat entre deux chargements. CAUSE : un run qui se termine
  // SEULEMENT par ce rattrapage (le socket a manqué l'événement terminal, voir
  // le docblock de ce fichier) invalidait `accountKeys.detail` et
  // `contactKeys.byAccount`, jamais `accountKeys.list` — la liste des comptes
  // (`useAccounts({status:'completed'})`, source de « N comptes analysés »)
  // restait sur son total d'avant cette fin d'analyse jusqu'à son prochain
  // refetch naturel. Jumeau du même défaut dans `analysis-subscription.ts`.
  it('un run terminé par ce rattrapage invalide aussi la LISTE des comptes', () => {
    useAnalysisStore.getState().adopt(ACCOUNT, 'job-1', 'ALSEDIS')
    const client = qc()
    const spy = vi.spyOn(client, 'invalidateQueries')

    reconcileAnalysisStatus(ACCOUNT, status({ state: 'completed', percent: 100 }), client)

    expect(spy).toHaveBeenCalledWith({ queryKey: ['accounts', 'list'] })
  })

  // #4411 — filet d'une relance : le compte est DÉJÀ `completed` en cache, le socket
  // a manqué `analysis:done` ; le rattrapage doit quand même faire relire la fiche.
  it("une relance rattrapée relit signaux, plan et détail d'un compte déjà completed (#4411)", () => {
    useAnalysisStore.getState().adopt(ACCOUNT, 'job-2', 'ALSEDIS')
    const client = qc()
    const spy = vi.spyOn(client, 'invalidateQueries')

    reconcileAnalysisStatus(ACCOUNT, status({ state: 'completed', percent: 100 }), client)

    expect(spy).toHaveBeenCalledWith({ queryKey: ['account', ACCOUNT] })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['accounts', 'signals'] })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['plan-items'] })
  })

  it('ne re-notifie pas un run déjà marqué terminé (poll répété)', () => {
    useAnalysisStore.getState().adopt(ACCOUNT, 'job-1', 'ALSEDIS')
    const onDone = vi.fn()
    const client = qc()

    reconcileAnalysisStatus(ACCOUNT, status({ state: 'completed' }), client, { onDone })
    reconcileAnalysisStatus(ACCOUNT, status({ state: 'completed' }), client, { onDone })

    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('un run échoué devient visiblement échoué (jamais « en cours » à vie)', () => {
    useAnalysisStore.getState().adopt(ACCOUNT, 'job-1', 'ALSEDIS')
    const onError = vi.fn()

    reconcileAnalysisStatus(ACCOUNT, status({ state: 'failed' }), qc(), { onError })

    expect(useAnalysisStore.getState().runs[ACCOUNT].state).toBe('error')
    expect(onError).toHaveBeenCalled()
  })

  // « Ne JAMAIS inventer de progression. » Un serveur qui ne sait pas ne doit
  // pas faire reculer une position réelle, ni la remplacer par 0.
  it('percent=null (serveur incapable de répondre) n’écrase JAMAIS une position connue', () => {
    useAnalysisStore.getState().adopt(ACCOUNT, 'job-1', 'ALSEDIS')
    reconcileAnalysisStatus(ACCOUNT, status({ percent: 50, completedPhases: ['research', 'contacts'] }), qc())
    expect(useAnalysisStore.getState().runs[ACCOUNT].percent).toBe(50)

    reconcileAnalysisStatus(ACCOUNT, status({ percent: null }), qc())

    expect(useAnalysisStore.getState().runs[ACCOUNT].percent).toBe(50)
  })

  it('percent=null reste null quand rien n’est connu — pas de 0% fabriqué', () => {
    useAnalysisStore.getState().adopt(ACCOUNT, 'job-1', 'ALSEDIS')

    reconcileAnalysisStatus(ACCOUNT, status({ percent: null }), qc())

    expect(useAnalysisStore.getState().runs[ACCOUNT].percent).toBeNull()
  })

  it('une lecture d’état en retard ne fait pas reculer la barre (monotone)', () => {
    useAnalysisStore.getState().adopt(ACCOUNT, 'job-1', 'ALSEDIS')
    reconcileAnalysisStatus(ACCOUNT, status({ percent: 75 }), qc())

    reconcileAnalysisStatus(ACCOUNT, status({ percent: 25 }), qc())

    expect(useAnalysisStore.getState().runs[ACCOUNT].percent).toBe(75)
  })

  it('confirme la vie du run pour le GC de staleness, sans dépendre du flux', () => {
    useAnalysisStore.getState().adopt(ACCOUNT, 'job-1', 'ALSEDIS')
    useAnalysisStore.setState(s => ({
      runs: { ...s.runs, [ACCOUNT]: { ...s.runs[ACCOUNT], syncedAt: 0, events: [] } },
    }))

    reconcileAnalysisStatus(ACCOUNT, status({ percent: 50 }), qc())

    expect(useAnalysisStore.getState().runs[ACCOUNT].syncedAt).toBeGreaterThan(0)
  })

  // #3666.8 — bandeau figé « Lancement de l'analyse » : un serveur qui dit `not_found`
  // (aucune tâche, compte pas terminé) n'est PAS une preuve de vie. Sinon le sondage
  // rafraîchissait `syncedAt` toutes les 15 s et le GC de péremption n'évinçait jamais le bandeau.
  it('#3666.8 — `not_found` ne confirme PAS la vie du run : le GC de péremption peut le libérer', () => {
    useAnalysisStore.getState().adopt(ACCOUNT, 'job-1', 'ALSEDIS')
    useAnalysisStore.setState(s => ({
      runs: { ...s.runs, [ACCOUNT]: { ...s.runs[ACCOUNT], syncedAt: 0, events: [] } },
    }))

    reconcileAnalysisStatus(ACCOUNT, status({ state: 'not_found', jobId: null }), qc())

    expect(useAnalysisStore.getState().runs[ACCOUNT].syncedAt).toBe(0)
    expect(useAnalysisStore.getState().runs[ACCOUNT].state).not.toBe('completed')
  })

  it('ne fait rien pour un compte que le store ne suit pas', () => {
    reconcileAnalysisStatus('inconnu', status({ state: 'completed' }), qc())
    expect(useAnalysisStore.getState().runs).toEqual({})
  })

  it('une API sans completedPhases ne casse rien (champ absent = aucune info)', () => {
    useAnalysisStore.getState().adopt(ACCOUNT, 'job-1', 'ALSEDIS')
    const legacy = { jobId: 'job-1', state: 'active', percent: 40, phase: 'research_complete' } as AnalysisStatusPayload

    reconcileAnalysisStatus(ACCOUNT, legacy, qc())

    expect(useAnalysisStore.getState().runs[ACCOUNT].percent).toBe(40)
  })
})
