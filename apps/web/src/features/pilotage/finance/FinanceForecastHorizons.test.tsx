import { computeHorizonForecast, type ForecastItem } from '@bellum/contracts'
import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { FinanceForecastHorizons, ForecastHorizonsBody } from './FinanceForecastHorizons'

const useForecastHorizons = vi.fn((_horizon: string) => ({ data: undefined, isLoading: true, isError: false }))
vi.mock('../api', () => ({
  useForecastHorizons: (horizon: string) => useForecastHorizons(horizon),
}))

describe('FinanceForecastHorizons — le bloc monté (#2425.2)', () => {
  it('ouvre sur l’horizon « Mois », lu par la route, avec la vue complète et la vue manager', async () => {
    renderWithRouter(<FinanceForecastHorizons />)
    await screen.findByText('Prévisionnel par horizon')
    expect(useForecastHorizons).toHaveBeenCalledWith('month')
    expect(screen.getByText('Mois')).toBeInTheDocument()
    expect(screen.getByText('Complète')).toBeInTheDocument()
    expect(screen.getByText('Manager (5 lignes)')).toBeInTheDocument()
  })
})

/**
 * #2425 — le prévisionnel par horizon, à l'écran. Les données sont calculées
 * par le VRAI module du contrat (`computeHorizonForecast`), pas recopiées : un
 * écran qui lirait un champ que le calcul ne produit plus rougirait ici.
 */

function item(partial: Partial<ForecastItem> & Pick<ForecastItem, 'key' | 'component'>): ForecastItem {
  return {
    amountCents: 100_000,
    declaredAmountCents: null,
    currency: 'EUR',
    becameKey: null,
    declaredBlocked: false,
    renewalOpen: false,
    ...partial,
  }
}

const FULL = computeHorizonForecast({
  horizon: 'month',
  now: new Date('2026-09-23T10:00:00Z'),
  items: [
    item({ key: 'mission:a', component: 'backlog', amountCents: 1_000_000, renewalOpen: true }),
    item({ key: 'mission:b', component: 'backlog', amountCents: 200_000, declaredBlocked: true }),
    item({ key: 'mission:c', component: 'renewal', amountCents: 300_000 }),
    item({ key: 'opportunity:d', component: 'pipeline', amountCents: null }),
    item({ key: 'invoice:a:2026-08', component: 'toInvoice', amountCents: 400_000 }),
    item({ key: 'invoice:b:2026-07', component: 'receivable', amountCents: 250_000 }),
    item({ key: 'invoice:c:2026-06', component: 'overdue', amountCents: 90_000 }),
    item({ key: 'invoice:d:2026-06', component: 'disputed', amountCents: 60_000 }),
  ],
  capacity: { reservedDays: 30, availableDays: 12, bench: 2, uncoveredNeeds: 3 },
})

async function renderBody(
  props: Partial<Parameters<typeof ForecastHorizonsBody>[0]> = {},
  waitFor: string | RegExp = 'Décisions proposées',
) {
  const result = renderWithRouter(
    <ForecastHorizonsBody forecast={FULL} loading={false} failed={false} view="full" {...props} />,
  )
  // Le routeur se résout de façon asynchrone : attendre un libellé garantit
  // que le DOM interrogé est celui du composant, pas la coquille du routeur.
  await screen.findByText(waitFor)
  return result
}

describe('FinanceForecastHorizons (#2425)', () => {
  it('#2425.1 / .3 — les sept composantes, chacune sur sa ligne, jamais un total seul', async () => {
    await renderBody()
    const list = screen.getByTestId('forecast-components')
    expect(within(list).getAllByRole('listitem')).toHaveLength(7)
    expect(within(list).getByText('Carnet signé')).toBeInTheDocument()
    expect(within(list).getByText('Facturé, en litige')).toBeInTheDocument()
  })

  it('#2425.4 — quatre scénarios, chacun avec ses hypothèses écrites', async () => {
    await renderBody()
    const scenarios = screen.getByTestId('forecast-scenarios')
    for (const label of ['Engagé', 'Référence', 'Haut', 'Bas']) {
      expect(within(scenarios).getByText(label)).toBeInTheDocument()
    }
    expect(within(scenarios).getAllByText(/Seules les missions signées comptent/)).toHaveLength(4)
    expect(within(scenarios).getByText(/1 mission bloquée ou à risque retirée/)).toBeInTheDocument()
  })

  it('#2425.5 / c26 — la confiance nomme ses axes ; aucun pourcentage à l’écran', async () => {
    const { container } = await renderBody()
    expect(screen.getAllByText(/Contrat : oui · Source : oui · Historique : non évalué/).length).toBeGreaterThan(0)
    expect(container.textContent).not.toMatch(/%/)
  })

  it('#2425.6 — CA prévisionnel, facture prévue, cash prévu : trois montants distincts', async () => {
    await renderBody()
    const money = screen.getByTestId('forecast-money')
    expect(within(money).getByText('CA prévisionnel')).toBeInTheDocument()
    expect(within(money).getByText('Facture prévue')).toBeInTheDocument()
    expect(within(money).getByText('Cash prévu')).toBeInTheDocument()
    expect(within(money).getByText(/15\s000\s€/)).toBeInTheDocument()
    expect(within(money).getByText(/4\s000\s€/)).toBeInTheDocument()
    expect(within(money).getByText(/2\s500\s€/)).toBeInTheDocument()
  })

  it('#2425.7 — le bloc capacité porte ses quatre indicateurs', async () => {
    await renderBody()
    const capacity = screen.getByTestId('forecast-capacity')
    for (const label of ['Disponible', 'Réservée', 'Trous (sans affectation)', 'Besoins non couverts']) {
      expect(within(capacity).getByText(label)).toBeInTheDocument()
    }
    expect(within(capacity).getByText('12 j')).toBeInTheDocument()
  })

  it('#2425.8 — l’écart CA / cash cite le délai de facturation, chiffré', async () => {
    await renderBody()
    const gap = screen.getByTestId('forecast-gap')
    expect(within(gap).getByText(/Délai de facturation/)).toBeInTheDocument()
    expect(within(gap).getByText('Produit, pas encore facturé')).toBeInTheDocument()
  })

  it('#2425.9 — sept décisions en vue complète, chacune avec son lien', async () => {
    await renderBody()
    const decisions = screen.getByTestId('forecast-decisions')
    expect(within(decisions).getAllByRole('listitem')).toHaveLength(7)
    expect(within(decisions).getByRole('link', { name: 'Voir : Sécuriser le renouvellement' })).toHaveAttribute(
      'href',
      '/missions',
    )
  })

  it('#2425.10 — la vue manager n’affiche JAMAIS plus de cinq lignes, et dit ce qui attend', async () => {
    await renderBody({ view: 'manager' })
    const decisions = screen.getByTestId('forecast-decisions')
    expect(within(decisions).getAllByRole('listitem')).toHaveLength(5)
    expect(screen.getByText('2 autres décisions dans la vue complète')).toBeInTheDocument()
    expect(screen.queryByTestId('forecast-components')).toBeNull()
  })

  it('#2783 — sans avenant dans l’horizon, la ligne « dont avenants » le dit, jamais un « 0 » nu', async () => {
    await renderBody()
    expect(screen.getByText('Aucun avenant à effet dans cet horizon.')).toBeInTheDocument()
  })

  it('#2783 — accepté et simulé s’affichent SÉPARÉMENT, jamais fondus', async () => {
    const withAmendments = computeHorizonForecast({
      horizon: 'month',
      now: new Date('2026-09-23T10:00:00Z'),
      items: [],
      capacity: null,
      amendments: { accepted: 2, simulated: 3 },
    })
    await renderBody({ forecast: withAmendments })
    const amendments = screen.getByTestId('forecast-amendments')
    expect(within(amendments).getByText(/2 acceptés/)).toBeInTheDocument()
    expect(within(amendments).getByText(/3 simulés/)).toBeInTheDocument()
  })

  it('« non mesuré » n’est jamais « 0 » : sans donnée, les montants sont nommés absents', async () => {
    const empty = computeHorizonForecast({ horizon: 'week', now: new Date(), items: [], capacity: null })
    const { container } = await renderBody({ forecast: empty })
    expect(container.textContent).not.toMatch(/\b0\s€/)
    expect(container.textContent).toContain('Aucune décision à proposer')
  })

  it('#3483 / #3550.3 — l’absence se dit UNE fois, NOMMÉE : aucun tiret isolé, aucun libellé sans valeur', async () => {
    const empty = computeHorizonForecast({ horizon: 'week', now: new Date(), items: [], capacity: null })
    const { container } = await renderBody({ forecast: empty })
    const said = (container.textContent ?? '').match(/non mesuré/gi) ?? []
    expect(said.length).toBe(1)
    // Les montants absents ne font AUCUNE ligne, mais la légende les nomme.
    expect(screen.queryByTestId('forecast-money')).toBeNull()
    expect(screen.getByTestId('forecast-absent-legend')).toHaveTextContent('Facture prévue')
    // Aucun nœud texte ne se réduit à un tiret.
    const dashes = Array.from(container.querySelectorAll('*')).filter(
      node => node.children.length === 0 && node.textContent?.trim() === '—',
    )
    expect(dashes).toHaveLength(0)
  })

  it('témoin : avec des données, les montants présents gardent leur ligne et la légende ne ment pas', async () => {
    await renderBody()
    expect(screen.getByTestId('forecast-money')).toBeInTheDocument()
  })

  it('un échec de lecture se dit, distinct du vide', async () => {
    await renderBody({ forecast: null, failed: true }, /./)
    expect(screen.queryByTestId('forecast-money')).toBeNull()
    expect(screen.queryByText('Décisions proposées')).toBeNull()
  })
})
