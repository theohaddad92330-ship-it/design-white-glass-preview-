import { computeMissionMargin, type MissionMarginEngineInput } from '@bellum/contracts'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const simulate = vi.fn()
const useScenario = vi.fn()
vi.mock('../api', () => ({
  useMissionMarginScenario: () => useScenario(),
}))

const { MissionMarginEngine, MarginScenarioSimulator } = await import('./MissionMarginEngine')

const MISSION_ID = '11111111-1111-4111-8111-111111111111'

function engine(over: Partial<MissionMarginEngineInput> = {}) {
  return computeMissionMargin({
    channel: 'direct',
    costSource: null,
    currency: 'EUR',
    costCurrency: null,
    dailyRateCents: 72_000,
    loadedDailyCostCents: 60_000,
    partnerCommissionDailyCents: null,
    breakdown: {},
    fixedPriceRevenueCents: null,
    expensesTotalCents: 0,
    supplierInvoicesTotalCents: 0,
    elapsedDays: 30,
    period: '2026-09',
    validatedDays: 18,
    unvalidatedDays: 0,
    thresholdPercent: null,
    costRecordedRateCents: null,
    ...over,
  })
}

beforeEach(() => {
  useScenario.mockReturnValue({ mutate: simulate, data: undefined, isPending: false, reset: vi.fn() })
})

afterEach(() => {
  cleanup()
  simulate.mockReset()
  useScenario.mockReset()
})

describe('MissionMarginEngine (#2420)', () => {
  it('l’exemple du chapitre : l’état, le chiffre, ce sur quoi il est mesuré, et ce qu’il n’inclut pas', () => {
    render(<MissionMarginEngine missionId={MISSION_ID} engine={engine()} />)
    expect(screen.getByText('Mesurée')).toBeInTheDocument()
    expect(screen.getByTestId('margin-level-commercial')).toHaveTextContent('16,7 %')
    const basis = screen.getByTestId('margin-basis')
    expect(basis).toHaveTextContent('TJM client')
    expect(basis).toHaveTextContent('720')
    expect(basis).toHaveTextContent('Coût chargé saisi')
    expect(basis).toHaveTextContent('600')
    expect(basis).toHaveTextContent('18 jours validés')
    expect(screen.getByTestId('margin-exclusions')).toHaveTextContent('les délais de paiement')
    expect(screen.getByTestId('margin-formula')).toHaveTextContent('mission-margin-')
  })

  it('coût absent : « non mesurée », et aucun « 0 % » nulle part (#2420.13)', () => {
    render(<MissionMarginEngine missionId={MISSION_ID} engine={engine({ loadedDailyCostCents: null })} />)
    expect(screen.getAllByText('Non mesurée').length).toBeGreaterThan(0)
    expect(document.body.textContent).not.toMatch(/\b0 %/)
    expect(screen.getByTestId('margin-alerts')).toHaveTextContent('coût')
  })

  it('partielle : l’état le dit, et ce qui manque est nommé', () => {
    render(<MissionMarginEngine missionId={MISSION_ID} engine={engine({ channel: 'partner' })} />)
    expect(screen.getByText('Partielle')).toBeInTheDocument()
    expect(screen.getByTestId('margin-missing')).toHaveTextContent('conditions du partenaire')
  })

  it('la contribution ne se présente jamais comme un résultat « net » (#2420.5)', () => {
    render(
      <MissionMarginEngine
        missionId={MISSION_ID}
        engine={engine({ breakdown: { internalAllocationDailyCents: 2_000 } })}
      />,
    )
    expect(screen.getByTestId('margin-level-contribution')).toHaveTextContent('13,9 %')
    expect(document.body.textContent).not.toMatch(/\bnet(te)?\b/i)
  })

  it('le diagnostic de Laura : une proposition, jamais une renégociation lancée (#2420.16, #2420.17)', () => {
    render(<MissionMarginEngine missionId={MISSION_ID} engine={engine({ thresholdPercent: 20 })} />)
    const diagnostic = screen.getByTestId('margin-diagnostic')
    expect(diagnostic).toHaveTextContent('Laura')
    expect(diagnostic).toHaveTextContent('750')
    expect(diagnostic).toHaveTextContent('576')
    expect(diagnostic).toHaveTextContent('Aucune renégociation')
  })

  it('le simulateur envoie le scénario choisi, en centimes', async () => {
    render(<MissionMarginEngine missionId={MISSION_ID} engine={engine()} />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Tarif renouvelé' }))
    expect(screen.getByRole('button', { name: 'Tarif renouvelé' })).toHaveAttribute('aria-pressed', 'true')
    await user.type(screen.getByLabelText('TJM envisagé (€)'), '750')
    await user.type(screen.getByLabelText('Jours'), '20')
    await user.click(screen.getByRole('button', { name: 'Simuler' }))
    expect(simulate).toHaveBeenCalledWith({ kind: 'renewed_rate', rateCents: 75_000, costCents: null, days: 20 })
  })

  it('un forfait se lit en montants totaux, avec sa projection à terminaison, et ne se simule pas en jours', () => {
    render(
      <MissionMarginEngine
        missionId={MISSION_ID}
        engine={engine({
          costSource: 'fixed_price',
          fixedPriceRevenueCents: 10_000_000,
          breakdown: {
            fixedPriceTeamTimeCostCents: 6_000_000,
            fixedPriceSubcontractingCostCents: 1_000_000,
            fixedPriceBudgetConsumedCents: 5_000_000,
            fixedPriceRemainingWorkCents: 3_500_000,
          },
        })}
      />,
    )
    expect(screen.getByTestId('margin-level-atCompletion')).toHaveTextContent('15 %')
    expect(screen.queryByRole('button', { name: 'Simuler' })).toBeNull()
  })

  it('#2783 — le revenu simulé s’affiche à côté de la marge, même formule, jamais un second calcul', () => {
    useScenario.mockReturnValue({
      mutate: simulate,
      isPending: false,
      reset: vi.fn(),
      data: {
        kind: 'renewed_rate',
        applicable: true,
        days: 10,
        computation: engine(),
        commercialTotalCents: 150_000,
        grossTotalCents: 150_000,
        revenueTotalCents: 750_000,
      },
    })
    render(<MarginScenarioSimulator missionId={MISSION_ID} currency="EUR" />)
    const revenue = screen.getByTestId('margin-scenario-revenue')
    expect(revenue).toHaveTextContent('500 €')
    expect(revenue).toHaveTextContent('10 jours')
  })

  it('#2783 — la prolongation d’un avenant projette la consommation du bon de commande, sans nouveau moteur', () => {
    useScenario.mockReturnValue({
      mutate: simulate,
      isPending: false,
      reset: vi.fn(),
      data: {
        kind: 'extension',
        applicable: true,
        days: 20,
        computation: engine(),
        commercialTotalCents: 240_000,
        grossTotalCents: 240_000,
        revenueTotalCents: 1_440_000,
      },
    })
    render(
      <MarginScenarioSimulator
        missionId={MISSION_ID}
        currency="EUR"
        defaultKind="extension"
        poTerms={{ poVolumeDays: 50, poConsumedDays: 40 }}
      />,
    )
    // 40 consommés + 20 de prolongation = 60 sur 50 : DÉPASSÉ de 10 jours.
    expect(screen.getByTestId('margin-scenario-po-impact')).toHaveTextContent('10')
  })

  it('#2783 — sans bon de commande connu sur la mission, aucun bloc d’impact ne s’affiche', () => {
    useScenario.mockReturnValue({
      mutate: simulate,
      isPending: false,
      reset: vi.fn(),
      data: {
        kind: 'extension',
        applicable: true,
        days: 20,
        computation: engine(),
        commercialTotalCents: 240_000,
        grossTotalCents: 240_000,
        revenueTotalCents: 1_440_000,
      },
    })
    render(
      <MarginScenarioSimulator
        missionId={MISSION_ID}
        currency="EUR"
        defaultKind="extension"
        poTerms={{ poVolumeDays: null, poConsumedDays: null }}
      />,
    )
    expect(screen.queryByTestId('margin-scenario-po-impact')).toBeNull()
  })
})
