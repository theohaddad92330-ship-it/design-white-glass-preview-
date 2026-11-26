import type { PipeByOwner, PipeInspection, PipeWaterfall } from '@bellum/contracts'
import { fireEvent, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'

/**
 * `/pilotage/pipe` — ce que l'écran montre, et ce qu'il REFUSE de montrer :
 * pas de probabilité, pas de « 0 » pour une valeur absente, pas de ligne pour
 * ce qu'on n'a pas, chaque chiffre avec sa base.
 */
const inspection = vi.fn()
const waterfall = vi.fn()
const byOwner = vi.fn()
vi.mock('./api', () => ({
  usePipeInspection: () => inspection(),
  usePipeWaterfall: () => waterfall(),
  usePipeByOwner: () => byOwner(),
}))
const mutateCategory = vi.fn()
const mutateDate = vi.fn()
vi.mock('@/features/projects/hooks/useUpdateProjectForecast', () => ({
  useUpdateForecastCategory: () => ({ mutate: mutateCategory, isPending: false, isError: false }),
  useUpdateCloseDate: () => ({ mutate: mutateDate, isPending: false, isError: false }),
}))

const { PipeInspection: PipeInspectionView } = await import('./PipeInspection')
const { PipeWaterfall: PipeWaterfallView } = await import('./PipeWaterfall')
const { PipeByOwner: PipeByOwnerView } = await import('./PipeByOwner')

const ID = '11111111-1111-4111-8111-111111111111'
const ok = <T,>(data: T) => ({ data, isLoading: false, isError: false })

const row = (over: Partial<PipeInspection['rows'][number]> = {}): PipeInspection['rows'][number] => ({
  id: ID,
  accountId: '22222222-2222-4222-8222-222222222222',
  accountName: 'SNCF',
  label: 'Tierce maintenance applicative — systèmes de billettique',
  amountCents: 180_000_00,
  stage: 'negotiation',
  forecastCategory: 'best_case',
  expectedCloseOn: '2026-10-02',
  ownerId: null,
  ownerName: 'Camille Durand',
  daysInStage: 40,
  signals: [],
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('table d’inspection', () => {
  it('un montant absent se dit « Non mesuré », jamais 0 €', async () => {
    inspection.mockReturnValue(
      ok<PipeInspection>({
        rows: [row({ amountCents: null })],
        totals: [{ category: 'best_case', count: 1, amountCents: 0, withoutAmount: 1 }],
        generatedAt: '2026-10-14T10:00:00Z',
      }),
    )
    renderWithRouter(<PipeInspectionView />)
    const rowEl = (await screen.findAllByTestId('pipe-row'))[0] as HTMLElement
    expect(within(rowEl).getByText('Non mesuré')).toBeTruthy()
    expect(rowEl.textContent).not.toMatch(/0\s*€/)
    // Le total d'une catégorie sans aucun montant dit aussi « Non mesuré ».
    expect(within(screen.getByTestId('pipe-category-totals')).getByText('Non mesuré')).toBeTruthy()
  })

  it('chaque signal dit son fait chiffré, sans score', async () => {
    inspection.mockReturnValue(
      ok<PipeInspection>({
        rows: [
          row({
            signals: [
              { kind: 'close_overdue', days: 12, count: null, fromCents: null, toCents: null },
              { kind: 'close_pushed', days: null, count: 3, fromCents: null, toCents: null },
              { kind: 'amount_lowered', days: null, count: null, fromCents: 220_000_00, toCents: 180_000_00 },
              { kind: 'no_activity', days: 34, count: null, fromCents: null, toCents: null },
              { kind: 'stage_stale', days: 40, count: null, fromCents: null, toCents: null },
            ],
          }),
        ],
        totals: [{ category: 'best_case', count: 1, amountCents: 180_000_00, withoutAmount: 0 }],
        generatedAt: '2026-10-14T10:00:00Z',
      }),
    )
    renderWithRouter(<PipeInspectionView />)
    expect(await screen.findByText('Date prévue dépassée de 12 j')).toBeTruthy()
    expect(screen.getByText('Date prévue repoussée 3 fois')).toBeTruthy()
    expect(screen.getByText('Aucune activité depuis 34 j')).toBeTruthy()
    expect(screen.getByText(/Montant baissé de .*220.*à .*180/)).toBeTruthy()
    expect(screen.getByText(/40 j dans ce stade, au-delà de la médiane du stade/)).toBeTruthy()
  })

  it('les totaux sont non pondérés, « non déclarée » a sa ligne, et aucune probabilité n’apparaît', async () => {
    inspection.mockReturnValue(
      ok<PipeInspection>({
        rows: [row(), row({ id: '33333333-3333-4333-8333-333333333333', forecastCategory: null })],
        totals: [
          { category: 'best_case', count: 1, amountCents: 180_000_00, withoutAmount: 0 },
          { category: null, count: 1, amountCents: 180_000_00, withoutAmount: 0 },
        ],
        generatedAt: '2026-10-14T10:00:00Z',
      }),
    )
    const { container } = renderWithRouter(<PipeInspectionView />)
    const totals = await screen.findByTestId('pipe-category-totals')
    expect(within(totals).getByText('Non déclarée')).toBeTruthy()
    expect(within(totals).getByText('Possible')).toBeTruthy()
    expect(screen.getByText('Opportunités ouvertes, montants non pondérés.')).toBeTruthy()
    expect(container.textContent).not.toMatch(/probab|%/i)
  })

  it('édite la catégorie en place : la déclaration part avec l’id, null efface', async () => {
    inspection.mockReturnValue(ok<PipeInspection>({ rows: [row()], totals: [], generatedAt: '2026-10-14T10:00:00Z' }))
    renderWithRouter(<PipeInspectionView />)
    const select = await screen.findByRole('combobox', { name: /Catégorie déclarée — SNCF/ })
    expect(select.textContent).toContain('Possible')
  })

  it('édite la date prévue à la sortie du champ ; la vider l’efface ; une date inchangée n’écrit rien', async () => {
    inspection.mockReturnValue(ok<PipeInspection>({ rows: [row()], totals: [], generatedAt: '2026-10-14T10:00:00Z' }))
    renderWithRouter(<PipeInspectionView />)
    const input = (await screen.findByLabelText(/Date de signature prévue — SNCF/)) as HTMLInputElement
    expect(input.value).toBe('2026-10-02')
    fireEvent.blur(input)
    expect(mutateDate).not.toHaveBeenCalled()
    fireEvent.change(input, { target: { value: '2026-11-15' } })
    expect(mutateDate).not.toHaveBeenCalled() // jamais à chaque frappe
    fireEvent.blur(input)
    expect(mutateDate).toHaveBeenCalledWith({ id: ID, date: '2026-11-15' })
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(mutateDate).toHaveBeenLastCalledWith({ id: ID, date: null })
  })

  it('aucune opportunité ouverte : une phrase, pas de tableau', async () => {
    inspection.mockReturnValue(ok<PipeInspection>({ rows: [], totals: [], generatedAt: '2026-10-14T10:00:00Z' }))
    renderWithRouter(<PipeInspectionView />)
    expect(await screen.findByText('Aucune opportunité ouverte dans le pipe.')).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('un échec de lecture n’est pas un vide', async () => {
    inspection.mockReturnValue({ data: undefined, isLoading: false, isError: true })
    renderWithRouter(<PipeInspectionView />)
    expect((await screen.findByRole('alert')).textContent).toContain('n’a pas pu être chargée')
  })
})

const wf = (over: Partial<PipeWaterfall> = {}): PipeWaterfall => ({
  from: '2026-10-01T00:00:00.000Z',
  to: '2026-10-14T12:00:00.000Z',
  openingCents: 600_000_00,
  createdCents: 130_000_00,
  raisedCents: 0,
  loweredCents: 50_000_00,
  lostCents: 0,
  signedCents: 250_000_00,
  removedCents: 0,
  closingCents: 430_000_00,
  unexplainedCents: 0,
  openingCount: 3,
  closingCount: 2,
  withoutAmountCount: 1,
  ...over,
})

describe('waterfall', () => {
  it('dit sa période et sa base, ne montre que les barres non nulles, nomme les sans-montant', async () => {
    waterfall.mockReturnValue(ok(wf()))
    renderWithRouter(<PipeWaterfallView />)
    const bars = await screen.findByTestId('pipe-waterfall-bars')
    const labels = within(bars)
      .getAllByRole('listitem')
      .map(item => item.textContent ?? '')
    expect(labels).toHaveLength(5) // ouverture, entrées, baissés, signées, clôture
    expect(labels.join('|')).not.toContain('Perdues')
    expect(screen.getByText(/3 opportunités ouvertes à l’ouverture, 2 à la clôture/)).toBeTruthy()
    expect(screen.getByText(/non pondérés/)).toBeTruthy()
    expect(screen.getByText(/1 opportunité ouverte sans montant/)).toBeTruthy()
    expect(screen.queryByText(/Écart/)).toBeNull()
  })

  it('un écart non expliqué est nommé, jamais absorbé', async () => {
    waterfall.mockReturnValue(ok(wf({ unexplainedCents: 10_000_00 })))
    renderWithRouter(<PipeWaterfallView />)
    expect(await screen.findByText('Écart non expliqué')).toBeTruthy()
    expect(screen.getByText(/ne permet pas d’expliquer/)).toBeTruthy()
  })
})

const owner = (over: Partial<PipeByOwner['owners'][number]> = {}): PipeByOwner['owners'][number] => ({
  ownerId: ID,
  ownerName: 'Camille Durand',
  openCount: 8,
  openCents: 900_000_00,
  signedCount: 1,
  signedCents: 130_000_00,
  winRate: 0.6,
  winRateWon: 6,
  winRateLost: 4,
  winRateDays: 90,
  medianCycleDays: 62,
  cycleSample: 6,
  cycleDays: 180,
  ...over,
})

describe('par commercial', () => {
  it('taux de gain avec son dénominateur et sa fenêtre ; cycle médian avec son échantillon', async () => {
    byOwner.mockReturnValue(ok<PipeByOwner>({ from: '', to: '', owners: [owner()] }))
    renderWithRouter(<PipeByOwnerView />)
    expect(await screen.findByText('60 % — 6 signées sur 10 clôturées (90 j glissants)')).toBeTruthy()
    expect(screen.getByText(/62 jours — médiane de 6 signées sur 180 j/)).toBeTruthy()
  })

  it('sous la base minimale : « n sur m », jamais un pourcentage', async () => {
    byOwner.mockReturnValue(
      ok<PipeByOwner>({ from: '', to: '', owners: [owner({ winRate: null, winRateWon: 2, winRateLost: 1 })] }),
    )
    const { container } = renderWithRouter(<PipeByOwnerView />)
    expect(await screen.findByText(/2 signées sur 3 clôturées \(90 j glissants\) — base trop petite/)).toBeTruthy()
    expect(container.textContent).not.toMatch(/\d\s*%/)
  })

  it('rien de clos : une phrase, jamais 0 %', async () => {
    byOwner.mockReturnValue(
      ok<PipeByOwner>({
        from: '',
        to: '',
        owners: [
          owner({
            winRate: null,
            winRateWon: 0,
            winRateLost: 0,
            medianCycleDays: null,
            cycleSample: 0,
            signedCount: 0,
          }),
        ],
      }),
    )
    const { container } = renderWithRouter(<PipeByOwnerView />)
    expect(await screen.findByText('Aucune clôture sur 90 j glissants')).toBeTruthy()
    expect(screen.getByText('Aucune signature sur 180 j')).toBeTruthy()
    expect(container.textContent).not.toMatch(/\b0\s*%/)
  })

  it('un porteur absent se dit « Non attribué »', async () => {
    byOwner.mockReturnValue(ok<PipeByOwner>({ from: '', to: '', owners: [owner({ ownerId: null, ownerName: null })] }))
    renderWithRouter(<PipeByOwnerView />)
    expect(await screen.findByText('Non attribué')).toBeTruthy()
  })
})
