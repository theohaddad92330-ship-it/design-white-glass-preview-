import { render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { chooseOption } from '@/test/select'
import type { AccountMarketContext, AccountMarketPaths } from '@bellum/contracts'

/** Lot 773 (f) — l'encart « Observé sur le marché » dit ce que la mémoire marché sait, en agrégats, et mène à l'Écosystème. */
const state = vi.hoisted(() => ({ data: null as AccountMarketContext | null }))
vi.mock('@/features/accounts/hooks/useAccountMarketContext', () => ({
  useAccountMarketContext: () => ({ data: state.data }),
}))
const paths = vi.hoisted(() => ({
  data: null as AccountMarketPaths | null,
  isError: false,
  enabled: [] as boolean[],
}))
vi.mock('@/features/accounts/hooks/useAccountMarketPaths', () => ({
  useAccountMarketPaths: (_id: string, enabled: boolean) => {
    paths.enabled.push(enabled)
    return { data: enabled ? paths.data : undefined, isError: paths.isError, isLoading: false }
  },
}))
const { MarketObservedCard } = await import('./MarketObservedCard')

describe('MarketObservedCard', () => {
  beforeEach(() => {
    paths.enabled.length = 0
  })

  it('technos, familles, ESN avec leurs parcours, ex-ESN : sous le seuil de 3 parcours, rien', () => {
    state.data = {
      paths_observed: 198,
      esn_observed: 2,
      observed_stack_detail: [
        { techno: 'SAP', persons: 12 },
        { techno: 'COBOL', persons: 2 },
      ],
      role_families: [{ family: 'Data / IA', persons: 7 }],
      esn_observed_detail: [
        { esnName: 'Alpha', persons: 9, certainty: 'forte' },
        { esnName: 'Beta', persons: 1, certainty: 'faible' },
      ],
      ex_esn_present: 4,
    }
    render(<MarketObservedCard accountId="a1" />)
    const card = screen.getByTestId('signal-market-card')
    expect(card.textContent).toContain('198 parcours observés chez ce compte')
    expect(card.textContent).toContain('SAP · 12 parcours')
    expect(card.textContent).not.toContain('COBOL')
    expect(card.textContent).toContain('Data / IA')
    expect(card.textContent).toContain('Alpha · 9 parcours')
    expect(card.textContent).not.toContain('Beta')
    expect(card.textContent).toContain('4 parcours')
    // Source générique, jamais un fournisseur ; le détail renvoie à l'onglet Écosystème.
    expect(card.textContent).toContain('observé sur le marché')
    expect(card.textContent).not.toContain('Mémoire marché')
    expect(within(card).getByRole('button', { name: 'Voir les détails' })).toBeInTheDocument()
  })

  it('rien au-dessus du seuil : la phrase des parcours seule, aucune liste vide', () => {
    state.data = { paths_observed: 198, esn_observed: 0 }
    render(<MarketObservedCard accountId="a1" />)
    expect(screen.getByTestId('signal-market-card').querySelector('dl')).toBeNull()
  })

  it('pas de contexte marché ⇒ pas d’encart', () => {
    state.data = null
    render(<MarketObservedCard accountId="a1" />)
    expect(screen.queryByTestId('signal-market-card')).toBeNull()
  })

  describe('« Voir les détails » ouvre le détail des parcours (#5192)', () => {
    const path = (over: Partial<AccountMarketPaths['paths'][number]> = {}): AccountMarketPaths['paths'][number] => ({
      job_title: 'Data Engineer',
      role_family: 'Data / IA',
      skills: ['Kafka', 'SAP'],
      start_date: '2023-01-01',
      end_date: null,
      date_precision: 'year',
      work_status: 'freelance',
      esn_name: 'Alpha',
      daily_rate_eur: 650,
      ...over,
    })
    const open = async () => {
      state.data = { paths_observed: 198, esn_observed: 1, observed_stack_detail: [{ techno: 'SAP', persons: 12 }] }
      paths.data = {
        paths_total: 2,
        paths: [
          path(),
          path({
            job_title: 'Architecte',
            role_family: 'Architecture',
            skills: ['Java'],
            esn_name: null,
            daily_rate_eur: null,
            work_status: 'salarie',
          }),
        ],
      }
      render(<MarketObservedCard accountId="a1" />)
      expect(paths.enabled.every(flag => flag === false)).toBe(true)
      await userEvent.click(screen.getByRole('button', { name: 'Voir les détails' }))
      return screen.getByRole('dialog')
    }

    it('clic ⇒ modale : agrégats en tête, puis une ligne par parcours, aucun identifiant', async () => {
      const dialog = await open()
      expect(within(dialog).getByText('2 parcours observés chez ce compte')).toBeInTheDocument()
      const rows = within(dialog).getAllByRole('listitem')
      expect(rows).toHaveLength(2)
      expect(rows[0].textContent).toContain('Data Engineer')
      expect(rows[0].textContent).toContain('Kafka')
      expect(rows[0].textContent).toContain('Alpha')
      expect(rows[0].textContent).toContain('650')
      // Absence ⇒ aucune ligne : le 2e parcours n'a ni ESN ni TJM, rien n'est écrit « 0 » ni « — ».
      expect(rows[1].textContent).not.toMatch(/\b0\b|—|null/)
      expect(dialog.textContent).not.toContain('Mémoire marché')
      expect(dialog.querySelector('img, a[href]')).toBeNull()
    })

    it('détail pas encore là : jamais « 0 parcours », aucun volume non listé, et le manque est dit (#5192)', async () => {
      state.data = { paths_observed: 257, esn_observed: 1, observed_stack_detail: [{ techno: 'SAP', persons: 12 }] }
      paths.data = { paths_total: 0, paths: [] }
      render(<MarketObservedCard accountId="a1" />)
      await userEvent.click(screen.getByRole('button', { name: 'Voir les détails' }))
      const dialog = screen.getByRole('dialog')
      expect(within(dialog).queryByText('257 parcours observés chez ce compte')).toBeNull()
      expect(dialog.textContent).not.toMatch(/\b0 parcours/)
      expect(within(dialog).getByText(/pas encore disponible/)).toBeInTheDocument()
      expect(within(dialog).queryAllByRole('listitem')).toHaveLength(0)
    })

    it('filtre par techno, famille et ESN', async () => {
      const dialog = await open()
      await chooseOption(within(dialog).getByLabelText('Techno'), 'Java')
      expect(within(dialog).getAllByRole('listitem')).toHaveLength(1)
      await chooseOption(within(dialog).getByLabelText('Techno'), 'Tous')
      await chooseOption(within(dialog).getByLabelText('ESN'), 'Alpha')
      expect(within(dialog).getAllByRole('listitem')[0].textContent).toContain('Data Engineer')
      await chooseOption(within(dialog).getByLabelText('Famille de rôle'), 'Architecture')
      expect(within(dialog).queryAllByRole('listitem')).toHaveLength(0)
    })

    it('Échap ferme la modale', async () => {
      await open()
      await userEvent.keyboard('{Escape}')
      expect(screen.queryByRole('dialog')).toBeNull()
    })
  })
})
