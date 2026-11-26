import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as ReactQueryModule from '@tanstack/react-query'
import type { MarketVerificationPlan } from '@bellum/contracts'

const { useMarketVerificationPlan, useCreditGate, useIsDemo, useQueries } = vi.hoisted(() => ({
  useMarketVerificationPlan: vi.fn(),
  useCreditGate: vi.fn(),
  useIsDemo: vi.fn(),
  useQueries: vi.fn(),
}))
vi.mock('../../hooks', () => ({ useMarketVerificationPlan }))
vi.mock('@/features/credits/hooks/useCreditGate', () => ({ useCreditGate }))
vi.mock('@/features/demo/useIsDemo', () => ({ useIsDemo }))
// Les réponses de `GET /analysis/launch-plan`, une par candidat — le prix que
// le LANCEUR débitera. Le test pilote ces réponses, pas un prix de grille.
vi.mock('@tanstack/react-query', async importOriginal => ({
  ...(await importOriginal<typeof ReactQueryModule>()),
  useQueries,
}))

const { VerificationPlanDialog } = await import('./VerificationPlanDialog')

// `siren: null` sur les états ci-dessous : #2288.4 — champ requis par
// MarketVerificationCompanyState, aucun SIREN connu dans ces fixtures
// (comportement inchangé).
function plan(over: Partial<MarketVerificationPlan> = {}): MarketVerificationPlan {
  return {
    candidates: 2,
    sources: ['official_registry', 'job_postings'],
    // #2288.4 (18/09, suite) — le plan n'annonce plus rien de façon
    // inconditionnelle : France Travail, comme BOAMP/DECP, vient désormais du
    // LANCEUR (`useQueries` ci-dessous), jamais de ce champ.
    publicSources: [],
    credits: { measured: true, credits: 16 },
    durationMinutes: { min: 3, max: 6 },
    adds: ['facts', 'contacts'],
    kept: 0,
    keptCreditsSpent: { measured: true, credits: 0 },
    keptWithoutKnownCost: 0,
    states: [
      { companyName: 'Thales', state: 'to_verify', siren: null },
      { companyName: 'Atos', state: 'to_verify', siren: null },
    ],
    ...over,
  }
}

beforeEach(() => {
  useMarketVerificationPlan.mockReset().mockReturnValue({ data: plan(), isFetching: false, isError: false })
  useIsDemo.mockReset().mockReturnValue(false)
  useQueries
    .mockReset()
    .mockReturnValue([{ data: { scenario: 'fresh', credits: 8 } }, { data: { scenario: 'fresh', credits: 8 } }])
  useCreditGate.mockReset().mockReturnValue({
    known: true,
    creditsLeft: 40,
    analysesLeft: 5,
    enrichmentsLeft: 40,
    canAnalyze: true,
    canEnrich: true,
    locked: false,
  })
})
afterEach(cleanup)

function open(companies: readonly string[] = ['Thales', 'Atos']) {
  render(
    <VerificationPlanDialog
      open
      onOpenChange={() => undefined}
      talentId="c1"
      companies={companies}
      onConfirm={() => undefined}
    />,
  )
}

/**
 * #2288.4 — LE COÛT ANNONCÉ AVANT LA VÉRIFICATION PAYANTE.
 *
 * Cinq informations, avant le geste, jamais après. Le reste de ce bloc garde
 * ce que le devis n'a PAS le droit de dire.
 */
describe('VerificationPlanDialog', () => {
  it('annonce les informations avant le geste — sauf le coût, qui ne se lit plus (#4463)', () => {
    open()
    const block = screen.getByTestId('verification-plan')
    expect(block).toHaveTextContent('2 entreprises')
    expect(block).toHaveTextContent('Registre officiel')
    expect(block).toHaveTextContent('Offres d’emploi publiées')
    expect(block).not.toHaveTextContent(/crédit/i)
    expect(block).toHaveTextContent('de 3 à 6 minutes')
    expect(block).toHaveTextContent('Faits')
  })

  it('ne nomme AUCUN fournisseur — des natures de source, jamais ce qui nous sert (GA-44)', () => {
    open()
    const text = screen.getByTestId('verification-plan').textContent ?? ''
    for (const vendor of ['Pappers', 'Apollo', 'Brave', 'Firecrawl', 'Serper', 'Tavily']) {
      expect(text).not.toContain(vendor)
    }
  })

  it('#4074 — nomme les offres d’emploi publiques (par leur nature, plus par leur nom) dès qu’un lancement sera RÉEL', () => {
    open()
    expect(screen.getByTestId('verification-plan')).toHaveTextContent(/offres d’emploi publiques/)
  })

  // #2288.4 (18/09, suite) — France Travail suit désormais le LANCEUR, comme
  // BOAMP/DECP : elle ne se nomme plus quand TOUS les candidats seront
  // simplement rouverts (aucune collecte n'aura lieu).
  it('c66 — sans AUCUN lancement réel (tous rouverts), la ligne ne s’affiche pas (jamais une source devinée)', () => {
    useQueries.mockReturnValue([
      { data: { scenario: 'cache_hit', accountId: 'a1', companyName: 'Thales' } },
      { data: { scenario: 'cache_hit', accountId: 'a2', companyName: 'Atos' } },
    ])
    open()
    expect(screen.getByTestId('verification-plan')).not.toHaveTextContent(/offres d’emploi publiques/)
  })

  // #4074 revient sur #2291.3 (18/09), délibérément — décision Louis 12/10 : on ne nomme plus la source.
  // ── #2288.4 (c66) — BOAMP/DECP, d'après ce que le LANCEUR interrogera ──────
  it('nomme les avis de marchés publics et la commande publique quand chaque lancement les interrogera — sans note de portée', () => {
    const tenders = { scenario: 'fresh', credits: 8, publicTenderSources: ['boamp', 'decp'] }
    useQueries.mockReturnValue([{ data: tenders }, { data: tenders }])
    open()
    const block = screen.getByTestId('verification-plan')
    expect(block).toHaveTextContent(/offres d’emploi publiques/)
    expect(block).toHaveTextContent(/avis de marchés publics/)
    expect(block).toHaveTextContent(/commande publique/)
    expect(block).not.toHaveTextContent(/entreprises lancées/)
  })

  it('ne nomme NI les avis de marchés publics NI la commande publique quand aucun lancement ne les interrogera (entreprises inconnues)', () => {
    open()
    const block = screen.getByTestId('verification-plan')
    expect(block).not.toHaveTextContent(/avis de marchés publics/)
    expect(block).not.toHaveTextContent(/commande publique/)
  })

  it('dit pour COMBIEN d’entreprises lancées les marchés publics sont annoncés, quand ce n’est pas toutes', () => {
    useQueries.mockReturnValue([
      { data: { scenario: 'fresh', credits: 8, publicTenderSources: ['boamp', 'decp'] } },
      { data: { scenario: 'fresh', credits: 8, publicTenderSources: [] } },
    ])
    open()
    const block = screen.getByTestId('verification-plan')
    expect(block).toHaveTextContent(/avis de marchés publics/)
    expect(block).toHaveTextContent(/1 des 2 entreprises lancées/)
  })

  it('n’affiche AUCUNE probabilité — ni chance, ni taux de succès', () => {
    open()
    const text = (screen.getByTestId('verification-plan').textContent ?? '').toLowerCase()
    for (const word of ['probabilit', 'chance', 'taux de succès', 'estimé à']) {
      expect(text).not.toContain(word)
    }
  })

  it('un coût NON MESURÉ ne s’écrit pas — ni « 0 crédit », ni « non mesuré » : plus de ligne de coût (#4463)', () => {
    useQueries.mockReturnValue([{ data: { scenario: 'fresh', credits: 8 } }, { data: undefined }])
    open()
    const block = screen.getByTestId('verification-plan')
    expect(block).not.toHaveTextContent('0 crédit')
    expect(block).not.toHaveTextContent(/crédit|coût/i)
    expect(block.textContent ?? '').not.toMatch(/non mesuré/i)
  })

  it('GA-66 — le total des conservés dit qu’il est un PLANCHER quand un coût manque', () => {
    useMarketVerificationPlan.mockReturnValue({
      data: plan({ kept: 3, keptWithoutKnownCost: 1, keptCreditsSpent: { measured: true, credits: 16 } }),
      isFetching: false,
      isError: false,
    })
    open()
    expect(screen.getByTestId('verification-plan')).toHaveTextContent('Ce total est un plancher')
  })

  it('un devis illisible ne propose AUCUN prix de repli', () => {
    useMarketVerificationPlan.mockReturnValue({ data: undefined, isFetching: false, isError: true })
    open()
    expect(screen.queryByTestId('verification-plan')).not.toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(/n’a pas pu être établi/)
    expect(screen.getByRole('button', { name: /Lancer les vérifications/ })).toBeDisabled()
  })

  it('un accès d’essai TERMINÉ ferme le geste payant — et le dit', () => {
    useCreditGate.mockReturnValue({
      known: true,
      creditsLeft: 0,
      analysesLeft: 0,
      enrichmentsLeft: 0,
      canAnalyze: false,
      canEnrich: false,
      locked: true,
    })
    open()
    expect(screen.getByRole('button', { name: /Lancer les vérifications/ })).toBeDisabled()
    expect(screen.getByRole('note')).toHaveTextContent(/accès d’essai/)
  })

  it('un solde INCONNU laisse passer — c’est le serveur, la vraie porte', () => {
    useCreditGate.mockReturnValue({
      known: false,
      creditsLeft: null,
      analysesLeft: null,
      enrichmentsLeft: null,
      canAnalyze: true,
      canEnrich: true,
      locked: false,
    })
    open()
    expect(screen.getByRole('button', { name: /Lancer les vérifications/ })).toBeEnabled()
  })

  // ── Le coût annoncé EST le coût débité ──────────────────────────────────
  it('le lanceur garde sa règle (une analyse déjà faite se dit), sans prix à l’écran (#4463)', () => {
    // Le serveur du plan dit 16 (2 × 8, la grille). Le lanceur, lui, rouvrira
    // Atos sans débit : le devis doit dire 8, parce que c'est 8 qui sera débité.
    useQueries.mockReturnValue([
      { data: { scenario: 'fresh', credits: 8 } },
      { data: { scenario: 'cache_hit', accountId: 'a1', companyName: 'Atos' } },
    ])
    open()
    const block = screen.getByTestId('verification-plan')
    expect(block).not.toHaveTextContent(/crédit|\b8\b|\b16\b/)
    expect(block).toHaveTextContent(/déjà analysée dans ton espace/)
  })

  it('n’interroge le lanceur que pour les candidats — un conservé ne se redemande pas', () => {
    useMarketVerificationPlan.mockReturnValue({
      data: plan({
        states: [
          { companyName: 'Thales', state: 'to_verify', siren: null },
          { companyName: 'Atos', state: 'kept', siren: null },
        ],
      }),
      isFetching: false,
      isError: false,
    })
    open()
    const queries = (useQueries.mock.calls.at(-1)?.[0] as { queries: { queryKey: readonly unknown[] }[] }).queries
    expect(queries).toHaveLength(1)
    expect(queries[0]?.queryKey).toContain('Thales')
  })

  it('en démonstration, le devis le dit — sans « 0 crédit » (#4463)', () => {
    useIsDemo.mockReturnValue(true)
    useQueries.mockReturnValue([{ data: undefined }, { data: undefined }])
    open()
    const block = screen.getByTestId('verification-plan')
    expect(block).not.toHaveTextContent(/crédit/i)
    expect(block).toHaveTextContent(/Démonstration/)
  })

  it('un prix de lancement illisible bloque le geste — aucun lancement sans coût annoncé', () => {
    useQueries.mockReturnValue([{ data: undefined }, { data: undefined }])
    open()
    expect(screen.getByRole('button', { name: /Lancer les vérifications/ })).toBeDisabled()
  })

  it('un périmètre entièrement CONSERVÉ ne propose plus rien à payer', () => {
    useQueries.mockReturnValue([])
    useMarketVerificationPlan.mockReturnValue({
      data: plan({ candidates: 0, kept: 2, credits: { measured: true, credits: 0 }, states: [] }),
      isFetching: false,
      isError: false,
    })
    open()
    expect(screen.getByRole('button', { name: /Lancer les vérifications/ })).toBeDisabled()
    expect(screen.getByTestId('verification-plan')).toHaveTextContent(/ne se repaie pas/)
  })
})
