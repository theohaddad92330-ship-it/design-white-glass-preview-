import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { Consultant, ConsultantUpsert } from '@bellum/contracts'
import { consultantsApi } from './api'
import { useArchiveTalentsBulk, useCommitCvParse, useUpdateConsultant } from './hooks'

vi.mock('./api', () => ({ consultantsApi: { commitCvParse: vi.fn(), archiveBulk: vi.fn(), update: vi.fn() } }))

function wrapper(qc: QueryClient) {
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

/**
 * #1790 — « la fiche ne réapparaît pas dans la file « à relire » après
 * validation ».
 *
 * La liste du vivier (badge « à relire », `ConsultantsPage.tsx`) lit
 * `useTalentSearch`, dont la clé commence par `['talents', …]` — le MÊME
 * préfixe que `useTalentStats`, `useMissingExpertise` et `usePoolSegment`.
 * `useCommitCvParse` invalide `['talents']` (préfixe) et `['consultant', id]`
 * (la fiche elle-même) : si l'une des deux disparaissait de son `onSuccess`,
 * la fiche resterait « à relire » à l'écran alors qu'elle vient d'être
 * qualifiée — exactement le défaut symétrique de #1790, une case plus loin.
 */
describe('useCommitCvParse — la fiche qualifiée ne reste pas « à relire »', () => {
  it('invalide la fiche ET les listes qui portent le badge « à relire »', async () => {
    // ⚠️ PAS de `gcTime: 0` ici : ces trois requêtes n'ont aucun `useQuery`
    // observateur (elles sont posées via `setQueryData`, comme le ferait un
    // écran déjà monté ailleurs) — un `gcTime` nul les collecterait avant même
    // que la mutation ait pu les invalider, et `getQueryState` rendrait
    // `undefined` pour les trois, un faux rouge qui ressemble à un vrai.
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    // Deux caches peuplés comme le seraient les écrans réels : la fiche, et la
    // recherche du vivier qui porte le badge « à relire ».
    const consultantKey = ['consultant', 'c1'] as const
    const talentSearchKey = ['talents', 'search', 'u1', {}] as const
    const talentStatsKey = ['talents', 'stats', 'u1'] as const
    qc.setQueryData(consultantKey, { id: 'c1', review_status: 'needs_review' })
    qc.setQueryData(talentSearchKey, { items: [{ id: 'c1', reviewStatus: 'needs_review' }], total: 1 })
    qc.setQueryData(talentStatsKey, { needsReview: 1 })

    vi.mocked(consultantsApi.commitCvParse).mockResolvedValue({ applied: [], rejected: [], qualified: true })

    const { result } = renderHook(() => useCommitCvParse('c1'), { wrapper: wrapper(qc) })
    result.current.mutate({ fields: [] })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    // La fiche elle-même : un nouveau `useConsultant('c1')` doit relire, pas
    // servir l'ancien `review_status: 'needs_review'` depuis le cache.
    expect(qc.getQueryState(consultantKey)?.isInvalidated).toBe(true)
    // La recherche du vivier — c'est ELLE qui pose le badge « à relire » sur
    // la ligne. Sans cette invalidation, la fiche qualifiée réapparaîtrait
    // « à relire » dans la liste tant que `staleTime` n'a pas expiré.
    expect(qc.getQueryState(talentSearchKey)?.isInvalidated).toBe(true)
    // Le compteur du bandeau de statistiques suit la même règle.
    expect(qc.getQueryState(talentStatsKey)?.isInvalidated).toBe(true)
  })
})

/**
 * Lot 19 (#1789) — « Compétences 0 » vu en production juste après la
 * validation d'un CV dont les 8 compétences sont pourtant EN BASE.
 *
 * `TalentCompletenessScore`/`TalentDetailHeader` lisent `useTalentSummary`
 * (`['talent', id, 'summary']`), PAS `useConsultant` — une ligne DÉRIVÉE,
 * distincte de la fiche SQL, avec son propre `skillCount`. Invalider la fiche
 * sans invalider ce résumé laisse la carte de complétude servir l'ANCIEN
 * compte, celui d'avant la revue, jusqu'à l'expiration de son `staleTime`
 * (15 s) — deux lectures du même talent qui divergent.
 */
describe('useCommitCvParse — la complétude ne reste pas sur l’ancien compte de compétences', () => {
  it('invalide aussi le résumé de vivier (`useTalentSummary`)', async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const summaryKey = ['talent', 'c1', 'summary'] as const
    qc.setQueryData(summaryKey, { id: 'c1', skillCount: 0 })

    vi.mocked(consultantsApi.commitCvParse).mockResolvedValue({ applied: [], rejected: [], qualified: true })

    const { result } = renderHook(() => useCommitCvParse('c1'), { wrapper: wrapper(qc) })
    result.current.mutate({ fields: [] })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(qc.getQueryState(summaryKey)?.isInvalidated).toBe(true)
  })
})

/**
 * #2662.2 — `useArchiveTalentsBulk` : le geste EN LOT invalide la liste comme
 * le fait `useArchiveTalent` (unitaire) — sans quoi les fiches archivées
 * resteraient visibles dans le vivier actif tant que `staleTime` n'expire pas.
 */
/**
 * #3167 (retour bêta, 28/09/2026) — « j'ai rempli les informations dans les
 * champs du formulaire mais les informations ne se sont pas mises à jour sur
 * la fiche de la candidate ».
 *
 * `useUpdateConsultant` (la mutation du formulaire d'édition,
 * `ConsultantFormDialog` → `TalentDetailPage.submit`) n'invalidait que
 * `['consultants']` (le vivier) et `['talents']` (la recherche) — jamais
 * `['consultant', id]`, la clé de `useConsultant`, exactement celle que la
 * fiche lit. Ses sept mutations SŒURS du même fichier (`useArchiveTalent`,
 * `useReactivateTalent`, `useSetTalentOwner`, `useConfirmTalentAvailability`,
 * `useConfirmTjmValidated`, `useConfirmCvValidated`) invalidaient toutes les
 * trois — la mutation manquait exactement l'invalidation que ses voisines
 * portent, et que `useCommitCvParse` porte déjà plus haut dans ce fichier
 * (#1789/#1790, même défaut, même fiche).
 */
describe('useUpdateConsultant — la fiche se met à jour après le formulaire (#3167)', () => {
  it('invalide la fiche (`useConsultant`) ET son résumé (`useTalentSummary`) après l’enregistrement', async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const consultantKey = ['consultant', 'c1'] as const
    const summaryKey = ['talent', 'c1', 'summary'] as const
    qc.setQueryData(consultantKey, { id: 'c1', full_name: 'Ancien nom' })
    qc.setQueryData(summaryKey, { id: 'c1', full_name: 'Ancien nom' })

    vi.mocked(consultantsApi.update).mockResolvedValue({ id: 'c1', full_name: 'Nouveau nom' } as Consultant)

    const { result } = renderHook(() => useUpdateConsultant(), { wrapper: wrapper(qc) })
    result.current.mutate({ id: 'c1', input: { full_name: 'Nouveau nom' } as unknown as ConsultantUpsert })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    // La fiche elle-même : un nouveau `useConsultant('c1')` doit relire,
    // jamais servir l'« Ancien nom » depuis le cache.
    expect(qc.getQueryState(consultantKey)?.isInvalidated).toBe(true)
    // Le résumé du vivier (entête de fiche, complétude, disponibilité
    // dérivée) — la même règle que `useCommitCvParse` ci-dessus.
    expect(qc.getQueryState(summaryKey)?.isInvalidated).toBe(true)
  })
})

describe('useArchiveTalentsBulk — la liste ne garde pas les fiches archivées', () => {
  it('invalide `talents` (la recherche du vivier) après un archivage en lot', async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const talentSearchKey = ['talents', 'search', 'u1', {}] as const
    qc.setQueryData(talentSearchKey, { items: [{ id: 'c1' }, { id: 'c2' }], total: 2 })

    vi.mocked(consultantsApi.archiveBulk).mockResolvedValue({ archived: ['c1', 'c2'], refused: [] })

    const { result } = renderHook(() => useArchiveTalentsBulk(), { wrapper: wrapper(qc) })
    result.current.mutate({ ids: ['c1', 'c2'], reason: null })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(consultantsApi.archiveBulk).toHaveBeenCalledWith(['c1', 'c2'], null)
    expect(qc.getQueryState(talentSearchKey)?.isInvalidated).toBe(true)
  })
})
