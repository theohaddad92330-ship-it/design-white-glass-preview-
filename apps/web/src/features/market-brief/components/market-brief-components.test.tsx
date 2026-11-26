import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { marketBriefSchema, type MarketBrief } from '@bellum/contracts'
import lille from '../../../../../../packages/contracts/src/market-brief/lille.fixture.json'
import frMarketBrief from '@/i18n/locales/fr/marketBrief.json'
import { GroupGalaxy } from './GroupGalaxy'
import { LinkedAccounts } from './LinkedAccounts'
import { LocalRules } from './LocalRules'
import { MarketCalendar } from './MarketCalendar'
import { PriceGrid } from './PriceGrid'
import { PriceTrend } from './PriceTrend'
import { ZoneClients } from './ZoneClients'
import { ZonePeople } from './ZonePeople'

// Le mock rend la clé ET ses variables : on prouve la clé choisie et la valeur passée.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => (options ? `${key} ${JSON.stringify(options)}` : key),
  }),
}))

const brief = (): MarketBrief => marketBriefSchema.parse(structuredClone(lille))
const grid = () => {
  const price = brief().price_grid
  if (!price) throw new Error('la fixture Lille porte une grille de prix')
  return price
}

describe('#marches-locaux L4a — PriceGrid', () => {
  it('une cellule absente (échantillon trop mince) s’écrit « non mesuré », jamais 0', () => {
    render(<PriceGrid grid={grid()} />)
    const table = screen.getByTestId('market-price-grid-table')
    // Data / BI / IA n'a pas de cellule junior dans la fixture.
    const dataRow = within(table).getByText('Data / BI / IA').closest('tr')
    if (!dataRow) throw new Error('ligne Data / BI / IA attendue')
    expect(within(dataRow).getByText('priceGrid.notMeasured')).toBeTruthy()
    expect(within(table).queryByText('0')).toBeNull()
  })

  it('une cellule dont n < 3 est traitée comme absente même si le contrat la laisse passer', () => {
    const g = grid()
    const first = g.rows[0]
    if (!first) throw new Error('ligne attendue')
    first.junior = { amount: 999, n: 2 }
    render(<PriceGrid grid={g} />)
    expect(screen.queryByText(/999/)).toBeNull()
  })

  it('affiche n par cellule et le montant avec sa devise', () => {
    render(<PriceGrid grid={grid()} />)
    const table = screen.getByTestId('market-price-grid-table')
    expect(within(table).getAllByText(/"n":38/).length).toBeGreaterThan(0)
    expect(within(table).getAllByText(/"amount":"505","currency":"EUR"/).length).toBeGreaterThan(0)
  })

  it('écrit la période et la source (fichier fourni pour la fixture)', () => {
    render(<PriceGrid grid={grid()} />)
    expect(screen.getByText(/priceGrid\.period.*2021-2024/)).toBeTruthy()
    expect(screen.getByText('priceGrid.source.provided_file')).toBeTruthy()
  })

  it('colle le garde-fou de concentration sous le tableau quand top_client', () => {
    render(<PriceGrid grid={grid()} />)
    const guard = screen.getByTestId('market-price-grid-concentration')
    expect(guard.textContent).toContain('ADEO')
    expect(guard.textContent).toContain('190')
    const table = screen.getByTestId('market-price-grid-table')
    expect(table.compareDocumentPosition(guard) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('sans top_client : aucun garde-fou de concentration', () => {
    const g = grid()
    delete g.top_client
    render(<PriceGrid grid={g} />)
    expect(screen.queryByTestId('market-price-grid-concentration')).toBeNull()
  })

  it('rend une carte par métier pour le mobile (sous 768 px)', () => {
    render(<PriceGrid grid={grid()} />)
    expect(screen.getAllByTestId('market-price-grid-card')).toHaveLength(grid().rows.length)
  })

  it('devise CHF : le montant porte CHF', () => {
    const g = grid()
    g.currency = 'CHF'
    render(<PriceGrid grid={g} />)
    expect(screen.getAllByText(/"currency":"CHF"/).length).toBeGreaterThan(0)
    expect(screen.queryByText(/"currency":"EUR"/)).toBeNull()
  })

  it('les trois sources ont leur libellé français en clair', () => {
    expect(frMarketBrief.priceGrid.source.own_needs_missions).toMatch(/tes besoins et missions/i)
    expect(frMarketBrief.priceGrid.source.observed_public).toMatch(/observé publiquement/i)
    expect(frMarketBrief.priceGrid.source.provided_file).toMatch(/fichier fourni/i)
  })
})

describe('#marches-locaux L4a — PriceTrend', () => {
  it('écrit « données jusqu’à <dernière année> » en clair', () => {
    const trend = brief().price_trend ?? []
    const last = Math.max(...trend.map(point => point.year))
    render(<PriceTrend trend={trend} />)
    expect(screen.getByText(new RegExp(`priceTrend\\.dataUntil.*${last}`))).toBeTruthy()
    expect(screen.getAllByTestId('market-price-trend-year')).toHaveLength(trend.length)
  })

  it('sans point : aucune ligne', () => {
    const { container } = render(<PriceTrend trend={[]} />)
    expect(container.firstChild).toBeNull()
  })
})

describe('#marches-locaux L4a — blocs de la zone', () => {
  it('ZonePeople écrit e-mail et téléphone EN CLAIR, avec employeur (D5)', () => {
    const people = [
      {
        name: 'Camille Durand',
        function: 'Responsable achats IT',
        entity: 'Exemple Retail Lille',
        email: 'camille.durand@exemple-retail.test',
        phone: '+33 3 20 00 00 00',
        mobile: '+33 6 00 00 00 00',
        linkedin: 'https://www.linkedin.com/in/camille-durand',
      },
    ]
    render(<ZonePeople people={people} />)
    expect(screen.getByText('Camille Durand')).toBeTruthy()
    expect(screen.getByText('Exemple Retail Lille')).toBeTruthy()
    const mail = screen.getByText('camille.durand@exemple-retail.test')
    expect(mail.closest('a')?.getAttribute('href')).toBe('mailto:camille.durand@exemple-retail.test')
    const phone = screen.getByText('+33 3 20 00 00 00')
    expect(phone.closest('a')?.getAttribute('href')).toBe('tel:+33 3 20 00 00 00')
    expect(screen.getByText('+33 6 00 00 00 00')).toBeTruthy()
    expect(screen.getByText('people.linkedin').closest('a')?.getAttribute('href')).toBe(
      'https://www.linkedin.com/in/camille-durand',
    )
  })

  it('ZonePeople : une coordonnée absente ne fait aucune ligne, aucune liste vide', () => {
    const { container } = render(<ZonePeople people={[]} />)
    expect(container.firstChild).toBeNull()
    render(<ZonePeople people={[{ name: 'Sans Coordonnées' }]} />)
    expect(screen.queryByText(/mailto/)).toBeNull()
    expect(screen.queryByText('people.linkedin')).toBeNull()
  })

  it('ZoneClients trie par profils décroissants et lie le compte quand l’id est fourni', () => {
    const clients = [
      { name: 'Petit', profiles: 3, cities: ['Lille'] },
      { name: 'Grand', profiles: 50, cities: ['Lille'] },
      { name: 'Sans profils', cities: [] },
    ]
    render(
      <ZoneClients
        clients={clients}
        linkedAccountIds={{ Grand: 'acc-1' }}
        renderAccountLink={(id, children) => (
          <a href={`/accounts/${id}`} data-testid="account-link">
            {children}
          </a>
        )}
      />,
    )
    const names = screen.getAllByTestId('market-client-name').map(node => node.textContent)
    expect(names).toEqual(['Grand', 'Petit', 'Sans profils'])
    const links = screen.getAllByTestId('account-link')
    expect(links).toHaveLength(1)
    expect(links[0]?.getAttribute('href')).toBe('/accounts/acc-1')
    // Une valeur absente n'est jamais « 0 ».
    const rows = screen.getAllByTestId('market-client-name').map(node => node.closest('tr'))
    expect(rows[2]?.textContent).not.toMatch(/"count":0/)
  })

  // Recette 06/10/2026 — « 10001-10001 » : borne haute = borne basse ⇒ tranche ouverte.
  it('ZoneClients : une tranche dont la borne haute égale la basse se lit « et plus »', () => {
    render(
      <ZoneClients
        clients={[
          { name: 'Auchan', profiles: 9, size: '10001-10001', cities: [] },
          { name: 'Moyen', profiles: 5, size: '201-500', cities: [] },
          { name: 'Libre', profiles: 4, size: '5000+', cities: [] },
        ]}
      />,
    )
    const text = screen.getAllByTestId('market-client-name').map(node => node.closest('tr')?.textContent ?? '')
    expect(text[0]).toContain('clients.sizeOpen')
    expect(text[0]).toContain('10')
    expect(text[0]).not.toContain('10001-10001')
    expect(text[1]).toContain('201-500')
    expect(text[2]).toContain('5000+')
  })

  it('GroupGalaxy, MarketCalendar, LocalRules rendent le contenu du brief', () => {
    const b = brief()
    const groups = b.groups ?? []
    const calendar = b.calendar ?? []
    const rules = b.rules ?? []
    render(
      <>
        <GroupGalaxy groups={groups} />
        <MarketCalendar items={calendar} />
        <LocalRules rules={rules} />
      </>,
    )
    if (groups[0]) expect(screen.getAllByText(groups[0].name).length).toBeGreaterThan(0)
    if (calendar[0]) expect(screen.getAllByText(calendar[0].label).length).toBeGreaterThan(0)
    if (rules[0]) expect(screen.getAllByText(rules[0].rule).length).toBeGreaterThan(0)
  })

  it('les trois blocs vides ne font aucune ligne', () => {
    const { container } = render(
      <>
        <GroupGalaxy groups={[]} />
        <MarketCalendar items={[]} />
        <LocalRules rules={[]} />
        <LinkedAccounts accounts={[]} renderAccountLink={(_id, children) => <span>{children}</span>} />
      </>,
    )
    expect(container.textContent).toBe('')
  })

  it('LinkedAccounts liste les comptes liés avec leur lien', () => {
    render(
      <LinkedAccounts
        accounts={[{ id: 'a1', name: 'ADEO' }]}
        renderAccountLink={(id, children) => <a href={`/accounts/${id}`}>{children}</a>}
      />,
    )
    expect(screen.getByText('ADEO').closest('a')?.getAttribute('href')).toBe('/accounts/a1')
  })
})
