import type { MarketPortfolioRead } from '@bellum/contracts'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * #1635.4 — LE FIT STRUCTUREL, ET LE MOT QUI N'Y EST PAS.
 *
 * L'issue demande « forte affinité ». Ce qui est livré est un COMPTE et son
 * CRITÈRE, sans gradation : « forte » exigerait une normalisation par cohorte
 * qui n'existe pas. Ces tests gardent les deux moitiés — ce qui s'affiche, et
 * ce qui ne s'affiche pas.
 */

type QueryState = { data?: MarketPortfolioRead; isLoading: boolean; isError: boolean }
const state: { current: QueryState } = { current: { data: undefined, isLoading: true, isError: false } }

vi.mock('../api', () => ({ useMarketMemoryPortfolio: () => state.current }))

const { MarketStructuralFitCard } = await import('./MarketStructuralFitCard')

const BASE: MarketPortfolioRead = {
  status: 'ok',
  coverage: { accounts: 62, covered: 38, insufficientObservations: 15, ambiguous: 6, unresolved: 3, homonyms: 4 },
  review: [],
  structuralFit: { matching: 22, covered: 38, expertises: ['Data', 'Cloud'] },
  computedAt: '2026-09-08T10:00:00.000Z',
}

beforeEach(() => {
  state.current = { data: undefined, isLoading: true, isError: false }
})
afterEach(cleanup)

describe('le fit structurel', () => {
  it('écrit le nombre de comptes qui recoupent une expertise déclarée', () => {
    state.current = { data: BASE, isLoading: false, isError: false }
    render(<MarketStructuralFitCard />)

    // ⚠️ DEUX nœuds portent « 22 » : la phrase et la complétude en dessous. Le
    // matcher vise la phrase entière, sinon le test tombe sur son propre succès.
    expect(screen.getByText(/^22 comptes couverts dont la pile observée/)).toBeTruthy()
  })

  it('affiche le CRITÈRE — le lecteur doit voir sur quoi le recoupement est fait', () => {
    state.current = { data: BASE, isLoading: false, isError: false }
    render(<MarketStructuralFitCard />)

    expect(screen.getByText(/Data · Cloud/)).toBeTruthy()
  })

  it('n’écrit AUCUNE gradation et AUCUN score — ni « forte », ni un pourcentage d’affinité', () => {
    state.current = { data: BASE, isLoading: false, isError: false }
    const { container } = render(<MarketStructuralFitCard />)

    // « forte » apparaîtrait ici si quelqu'un rebranchait la gradation ; le
    // texte explicatif dit pourquoi elle n'existe pas, entre guillemets.
    expect(screen.queryByText(/présentent une forte affinité/)).toBeNull()
    expect(container.textContent).not.toMatch(/\d+\s*\/\s*100/)
  })

  it('dit sur quoi le fit porte, et NOMME ce qui en sort', async () => {
    // Corrigé en recette le 08/09/2026 : la première version lisait « calculé
    // sur 22 comptes sur 38 », c'est-à-dire qu'on n'aurait pas su évaluer 16
    // comptes couverts. Faux — les 38 ont été évalués. Le fait à dire est que
    // 24 comptes du portefeuille sortent du calcul faute de pile observée.
    state.current = { data: BASE, isLoading: false, isError: false }
    const { container } = render(<MarketStructuralFitCard />)

    // #1866 — le DÉNOMINATEUR reste dans le flux, c'est lui qui rend le
    // chiffre vrai ; le détail de l'exclusion s'est replié derrière un
    // déclencheur tabulable. NOMMÉ ne veut pas dire PEINT en permanence —
    // mais il ne doit pas non plus devenir introuvable, et c'est ce que la
    // seconde moitié de ce test vérifie.
    expect(container.textContent).toMatch(/38 comptes du portefeuille sur 62/)
    expect(container.textContent).not.toMatch(/22 comptes couverts sur 38/)

    await userEvent.setup().click(screen.getByRole('button', { name: /hors du calcul/i }))
    expect(await screen.findByText(/24 comptes sans observation du marché/)).toBeInTheDocument()
  })

  it('ne nomme aucune exclusion quand tout le portefeuille est couvert', () => {
    state.current = {
      data: {
        ...BASE,
        coverage: { accounts: 38, covered: 38, insufficientObservations: 0, ambiguous: 0, unresolved: 0, homonyms: 0 },
      },
      isLoading: false,
      isError: false,
    }
    const { container } = render(<MarketStructuralFitCard />)

    expect(container.textContent).not.toMatch(/sans observation du marché/)
  })

  it('sans expertise déclarée, dit ce qui manque — jamais « 0 sur 38 »', () => {
    state.current = { data: { ...BASE, structuralFit: null }, isLoading: false, isError: false }
    render(<MarketStructuralFitCard />)

    expect(screen.getByText(/Renseigne tes expertises/)).toBeTruthy()
    expect(screen.queryByText(/comptes couverts dont/)).toBeNull()
  })

  it('disparaît entièrement sur une panne — une panne n’est pas une absence de fit', () => {
    state.current = {
      data: { status: 'unavailable', reason: 'read_failed' },
      isLoading: false,
      isError: false,
    }
    const { container } = render(<MarketStructuralFitCard />)

    expect(container.textContent).toBe('')
  })

  it('affiche un recoupement à ZÉRO quand il y a des expertises — c’est une vraie mesure', () => {
    state.current = {
      data: { ...BASE, structuralFit: { matching: 0, covered: 38, expertises: ['Data'] } },
      isLoading: false,
      isError: false,
    }
    render(<MarketStructuralFitCard />)

    expect(screen.getByText(/0 compte couvert dont/)).toBeTruthy()
  })
})
