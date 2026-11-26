import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as ReactQuery from '@tanstack/react-query'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import type { DiscoverCandidate } from '@/features/discover/lib/discover-types'
import { emptyUnifiedFilters } from '@/features/discover/lib/discover-filters'

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }))
vi.mock('@/lib/api', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  apiFetch,
}))

const { gate } = vi.hoisted(() => ({
  gate: {
    known: true,
    canAnalyze: true,
    canEnrich: true,
    locked: false,
  },
}))
vi.mock('@/features/credits/hooks/useCreditGate', () => ({ useCreditGate: () => gate }))

// #2166.56 (suite, 18/09 soir) — le devis n'annonce plus « N × prix de grille »
// mais somme, entreprise par entreprise, ce que `GET /analysis/launch-plan`
// répond — la même fonction qui décide du débit au lancement (#2288.4). Comme
// `VerificationPlanDialog.test.tsx`, les réponses sont pilotées via `useQueries`
// directement plutôt qu'en rejouant de vraies requêtes réseau.
const { useIsDemo, useQueries } = vi.hoisted(() => ({
  useIsDemo: vi.fn(),
  useQueries: vi.fn(),
}))
vi.mock('@/features/demo/useIsDemo', () => ({ useIsDemo }))
vi.mock('@tanstack/react-query', async importOriginal => ({
  ...(await importOriginal<typeof ReactQuery>()),
  useQueries,
}))

const { AnalyzeSelectionDialog } = await import('./AnalyzeSelectionDialog')

function candidate(over: Partial<DiscoverCandidate> = {}): DiscoverCandidate {
  return {
    name: 'ACME',
    siren: '552100554',
    nafCode: null,
    sector: null,
    city: null,
    department: null,
    headcountRange: null,
    creationDate: null,
    score: 70,
    scoreMax: 100,
    scoreUnmeasured: [],
    dataConfidence: null,
    scoreFactors: [],
    signals: [],
    angle: null,
    suggestedRoles: [],
    portfolioState: 'analyzed',
    accountId: 'acc-1',
    sources: [],
    ...over,
  }
}

type FetchArgs = { path: string; method?: string; body?: unknown }

function renderDialog(over: Partial<Parameters<typeof AnalyzeSelectionDialog>[0]> = {}) {
  const props: Parameters<typeof AnalyzeSelectionDialog>[0] = {
    open: true,
    onOpenChange: () => {},
    candidates: [candidate()],
    onDone: () => {},
    source: 'discover',
    ...over,
  }
  return renderWithRouter(<AnalyzeSelectionDialog {...props} />, '/discover')
}

/** Une réponse `fresh` par candidat, N × 8 crédits. */
function freshPlans(count: number) {
  return Array.from({ length: count }, () => ({ data: { scenario: 'fresh' as const, credits: 8 } }))
}

beforeEach(() => {
  apiFetch.mockReset()
  apiFetch.mockResolvedValue({})
  gate.known = true
  gate.canAnalyze = true
  gate.locked = false
  useIsDemo.mockReset().mockReturnValue(false)
  useQueries.mockReset().mockReturnValue(freshPlans(1))
})

/**
 * #2166.56 — lancer une analyse de LOT depuis Découvrir. ⚠️ ACTE PAYANT : un
 * clic, le coût TOTAL EXACT (ce que le lanceur débitera réellement, jamais
 * « prix de grille × N ») annoncé AVANT tout débit — DÉCISION Louis 17/09
 * midi, correctif 18/09 soir (même règle que #2288.4). Aucune probabilité,
 * aucun coût inventé : le prix vient de `GET /analysis/launch-plan`, le solde
 * de `useCreditGate` (le même partout dans l'app).
 */
describe('AnalyzeSelectionDialog (#2166.56)', () => {
  it('ne dit AUCUN coût — un candidat déjà analysé est nommé comme tel', async () => {
    useQueries.mockReturnValue([
      { data: { scenario: 'fresh', credits: 8 } },
      { data: { scenario: 'fresh', credits: 8 } },
      { data: { scenario: 'cache_hit', accountId: 'acc-9', companyName: 'Cegedim' } },
    ])
    renderDialog({ candidates: [candidate({ siren: '1' }), candidate({ siren: '2' }), candidate({ siren: '3' })] })
    expect(await screen.findByText(/analyses seront lancées/)).toBeInTheDocument()
    expect(document.body).not.toHaveTextContent(/cr[ée]dit/i)
    expect(screen.getAllByText(/déjà analysée/i).length).toBeGreaterThan(0)
    expect(apiFetch).not.toHaveBeenCalled()
  })

  it('#2293.5 — confirmer crée UN lot (un parent, un sous-job par candidat), jamais avant le clic', async () => {
    useQueries.mockReturnValue(freshPlans(2))
    apiFetch.mockResolvedValue({ id: '00000000-0000-4000-8000-000000000001', items: [], total: 2 })
    const onDone = vi.fn()
    renderDialog({
      candidates: [
        candidate({ siren: '111111111', name: 'Banque Alpha' }),
        candidate({ siren: '222222222', name: 'Studio Beta' }),
      ],
      onDone,
    })
    expect(apiFetch).not.toHaveBeenCalled()
    fireEvent.click(await screen.findByRole('button', { name: /^lancer l.analyse$/i }))

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
    // Plus AUCUN lancement un par un depuis le navigateur : le lot les porte tous.
    expect(apiFetch.mock.calls.filter(call => (call[0] as FetchArgs).path === '/analysis/start')).toHaveLength(0)
    const batchCalls = apiFetch.mock.calls.filter(call => (call[0] as FetchArgs).path === '/analysis-batches')
    expect(batchCalls).toHaveLength(1)
    expect(batchCalls[0]?.[0]).toEqual(
      expect.objectContaining({
        method: 'POST',
        body: expect.objectContaining({
          source: 'discover',
          items: [
            expect.objectContaining({ name: 'Banque Alpha', siren: '111111111' }),
            expect.objectContaining({ name: 'Studio Beta', siren: '222222222' }),
          ],
        }),
      }),
    )
  })

  it("#2293.3 — le lot lancé sur une recherche enregistrée rejouée porte la source 'saved_search', pas 'discover'", async () => {
    useQueries.mockReturnValue(freshPlans(1))
    apiFetch.mockResolvedValue({ id: '00000000-0000-4000-8000-000000000002', items: [], total: 1 })
    renderDialog({ source: 'saved_search' })
    fireEvent.click(await screen.findByRole('button', { name: /^lancer l.analyse$/i }))

    await waitFor(() => expect(apiFetch).toHaveBeenCalled())
    const batchCalls = apiFetch.mock.calls.filter(call => (call[0] as FetchArgs).path === '/analysis-batches')
    expect(batchCalls).toHaveLength(1)
    expect(batchCalls[0]?.[0]).toEqual(
      expect.objectContaining({ body: expect.objectContaining({ source: 'saved_search' }) }),
    )
  })

  it('solde épuisé : le frein doux est visible, rien ne part', async () => {
    gate.known = true
    gate.canAnalyze = false
    useQueries.mockReturnValue(freshPlans(2))
    renderDialog({ candidates: [candidate({ siren: '1' }), candidate({ siren: '2' })] })
    expect(await screen.findByText(/beaucoup utilisé/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^lancer l.analyse$/i })).toBeDisabled()
    expect(apiFetch).not.toHaveBeenCalled()
  })

  // #2728 — l'alerte disait « Annuler » pour toute seule issue : un cul-de-sac
  // exactement à l'endroit où le client voulait payer. Le lien vers `/billing`
  // débloque le geste au lieu de se contenter de le refuser.
  it('#4464 — solde épuisé : un lien mène vers l’équipe, jamais « recharger »', async () => {
    gate.known = true
    gate.canAnalyze = false
    useQueries.mockReturnValue(freshPlans(2))
    renderDialog({ candidates: [candidate({ siren: '1' }), candidate({ siren: '2' })] })
    await screen.findByText(/beaucoup utilisé/i)
    const link = screen.getByRole('link', { name: /contacter/i })
    expect(link).toHaveAttribute('href', expect.stringContaining('mailto:'))
  })

  it('#2728 — solde suffisant : aucun lien de recharge, rien à débloquer', async () => {
    gate.known = true
    gate.canAnalyze = true
    useQueries.mockReturnValue(freshPlans(1))
    renderDialog()
    await screen.findByRole('button', { name: /^lancer l.analyse$/i })
    expect(screen.queryByRole('link', { name: /recharger/i })).not.toBeInTheDocument()
  })

  it('accès verrouillé (essai expiré) : le geste reste refusé et dit pourquoi', async () => {
    gate.locked = true
    renderDialog()
    expect(await screen.findByRole('button', { name: /^lancer l.analyse$/i })).toBeDisabled()
  })

  it('le doute n’interdit pas : solde inconnu laisse le geste cliquable', async () => {
    gate.known = false
    renderDialog()
    expect(await screen.findByRole('button', { name: /^lancer l.analyse$/i })).not.toBeDisabled()
  })

  // ── Le coût annoncé EST le coût débité (correctif 18/09 soir) ──────────
  it('une réponse manquante ou en erreur rend le devis NON MESURÉ, et bloque le lancement', async () => {
    useQueries.mockReturnValue([{ data: { scenario: 'fresh', credits: 8 } }, { data: undefined }])
    renderDialog({ candidates: [candidate({ siren: '1' }), candidate({ siren: '2' })] })
    expect(await screen.findByText(/n’a pas pu être lu/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^lancer l.analyse$/i })).toBeDisabled()
    expect(apiFetch).not.toHaveBeenCalled()
  })

  it('en démonstration, aucun crédit n’est dit et le lanceur n’est pas appelé le lanceur', async () => {
    useIsDemo.mockReturnValue(true)
    useQueries.mockReturnValue([{ data: undefined }])
    renderDialog()
    expect(document.body.textContent).not.toMatch(/cr[ée]dit/i)
    expect(apiFetch).not.toHaveBeenCalled()
  })
})

// #4432.3 — la zone cherchée devient le périmètre du dossier : DITE avant le lancement, et un geste
// « Élargir à la France » la retire sans re-saisie.
describe('AnalyzeSelectionDialog — périmètre de la zone cherchée (#4432.3)', () => {
  const searched = () => ({ ...emptyUnifiedFilters(), region: ['76'] })
  const batchBody = () =>
    (apiFetch.mock.calls.find(call => (call[0] as FetchArgs).path === '/analysis-batches')?.[0] as FetchArgs)?.body as {
      items: Array<Record<string, unknown>>
    }

  it('dit le périmètre « Occitanie » et le transmet avec le nom', async () => {
    apiFetch.mockResolvedValue({ id: '00000000-0000-4000-8000-000000000001', items: [], total: 1 })
    const onDone = vi.fn()
    renderDialog({ candidates: [candidate({ name: 'SAFRAN', department: '31' })], searchCriteria: searched(), onDone })
    expect(await screen.findByText('Périmètre du dossier : Occitanie')).toBeInTheDocument()
    fireEvent.click(await screen.findByRole('button', { name: /^lancer l.analyse$/i }))
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
    expect(batchBody().items[0]?.suggestion_criteria).toMatchObject({ zone_regions: ['Occitanie'] })
  })

  it('« Élargir à la France » retire la zone : le dossier redevient national', async () => {
    apiFetch.mockResolvedValue({ id: '00000000-0000-4000-8000-000000000001', items: [], total: 1 })
    const onDone = vi.fn()
    renderDialog({ candidates: [candidate({ name: 'SAFRAN', department: '31' })], searchCriteria: searched(), onDone })
    fireEvent.click(await screen.findByRole('button', { name: 'Élargir à la France' }))
    expect(screen.getByText('Périmètre du dossier : France')).toBeInTheDocument()
    fireEvent.click(await screen.findByRole('button', { name: /^lancer l.analyse$/i }))
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
    expect(batchBody().items[0]?.suggestion_criteria).not.toHaveProperty('zone_regions')
  })

  // #4432.2 — recette prod 22/10 : DASSAULT AVIATION (siège Saint-Cloud 92, établissements en Occitanie) ouvrait
  // la boîte sans zone ni « Élargir à la France » : `department` est celui du SIÈGE, le registre (`geography`)
  // prouve la zone. Région(s) comme en prod (`region=%2276%22` → "76"), une ou deux.
  it('#4432.2 — un siège hors zone aux établissements prouvés en zone : la zone s’affiche et s’élargit', async () => {
    const geography = {
      basis: 'establishment' as const,
      headquarters: { city: 'Saint-Cloud', department: '92' },
      siteCount: 3,
      sites: [{ siret: null, city: 'Toulouse', department: '31', region: '76' }],
      zoneRegion: null,
    }
    const dassault = candidate({ name: 'DASSAULT AVIATION', city: 'Saint-Cloud', department: '92', geography })
    renderDialog({ candidates: [dassault], searchCriteria: { ...emptyUnifiedFilters(), region: ['75', '76'] } })
    expect(await screen.findByText('Périmètre du dossier : Nouvelle-Aquitaine · Occitanie')).toBeInTheDocument()
    fireEvent.click(await screen.findByRole('button', { name: 'Élargir à la France' }))
    expect(screen.getByText('Périmètre du dossier : France')).toBeInTheDocument()
  })

  it('#4432.2 — sans zone cherchée, cadrage national : aucune ligne de périmètre, aucun bouton', async () => {
    renderDialog({
      candidates: [candidate({ name: 'SAFRAN', department: '92' })],
      searchCriteria: emptyUnifiedFilters(),
    })
    await screen.findByRole('button', { name: /^lancer l.analyse$/i })
    expect(screen.queryByText(/Périmètre du dossier/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Élargir à la France' })).toBeNull()
  })
})
