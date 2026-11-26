import { missionsOfAccount, propagated } from '@bellum/contracts'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { rate, revenue } = vi.hoisted(() => ({ rate: vi.fn(), revenue: vi.fn() }))
vi.mock('@/features/propagation/hooks', () => ({
  useAccountRate: () => rate(),
  useAccountRevenue: () => revenue(),
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, ...rest }: { children: React.ReactNode }) => (
    <a href="/missions" {...rest}>
      {children}
    </a>
  ),
}))

const { AccountRevenueBanner } = await import('./AccountRevenueBanner')

const ACCOUNT = '11111111-1111-4111-8111-111111111111'

function aRate(
  over: Partial<{ missions: number; averageSoldDailyRateCents: number | null; missionsWithoutRate: number }> = {},
) {
  return propagated(
    { accountId: ACCOUNT, missions: 7, averageSoldDailyRateCents: 63_000, missionsWithoutRate: 1, ...over },
    missionsOfAccount(ACCOUNT),
  )
}

function aRevenue(
  over: Partial<{ invoicedCents: number | null; invoicedMonths: number; monthsWithoutAmount: number }> = {},
) {
  return {
    revenue: propagated(
      {
        accountId: ACCOUNT,
        invoicedCents: 14_820_000,
        invoicedMonths: 13,
        missions: 5,
        monthsWithoutAmount: 1,
        ...over,
      },
      missionsOfAccount(ACCOUNT),
    ),
    denied: false,
    failed: false,
    canReadFinance: true,
  }
}

beforeEach(() => {
  rate.mockReset().mockReturnValue(aRate())
  revenue.mockReset().mockReturnValue(aRevenue())
})
afterEach(cleanup)

describe('le bandeau n’existe que s’il a quelque chose de vrai à dire', () => {
  it('se tait sur un compte sans mission — « 0 € sur 0 mission » ne dirait rien de vrai', () => {
    rate.mockReturnValue(undefined)
    const { container } = render(<AccountRevenueBanner accountId={ACCOUNT} />)
    expect(container.textContent).toBe('')
  })

  it('reste affiché sans droit financier — le tarif vendu moyen n’est pas un montant gardé', () => {
    // Le gater sur le CA ferait disparaître le prix de VENTE, qui est visible
    // par design, pour tout un rôle sans droit financier.
    revenue.mockReturnValue({ revenue: undefined, denied: true, failed: false, canReadFinance: false })
    render(<AccountRevenueBanner accountId={ACCOUNT} />)
    expect(screen.getByText(/Tarif vendu moyen/)).toBeTruthy()
  })
})

describe('« ce client t’a rapporté X € sur N missions »', () => {
  it('affiche la somme, le nombre de missions, et se clique vers sa source', () => {
    render(<AccountRevenueBanner accountId={ACCOUNT} />)
    const link = screen.getByRole('link')
    expect(link.textContent?.replace(/\s/g, '')).toContain('148200')
    // ⚠️ « sur 7 missions » vient de l'agrégat OUVERT : le financier n'en compte
    // que 5 (celles qui portent un mois facturé), et afficher 5 sous un compte
    // qui en a 7 en ferait disparaître deux.
    expect(link.textContent).toContain('7 missions')
  })

  it('dit que le total est un PLANCHER quand des mois n’ont pas de montant', () => {
    render(<AccountRevenueBanner accountId={ACCOUNT} />)
    expect(screen.getByText(/le total est un plancher/)).toBeTruthy()
  })
})

describe('« pas ton périmètre » et « pas mesuré » sont deux phrases', () => {
  it('403 — un droit que le rôle n’a pas, pas une donnée manquante', () => {
    revenue.mockReturnValue({ revenue: undefined, denied: true, failed: false, canReadFinance: false })
    render(<AccountRevenueBanner accountId={ACCOUNT} />)
    expect(screen.getByText(/c’est un droit que ton rôle n’a pas/)).toBeTruthy()
  })

  it('échec de lecture — « cassé » ne se lit pas « ce client n’a jamais rien payé »', () => {
    revenue.mockReturnValue({ revenue: undefined, denied: false, failed: true, canReadFinance: true })
    render(<AccountRevenueBanner accountId={ACCOUNT} />)
    expect(screen.getByText(/c’est une lecture qui a échoué/)).toBeTruthy()
  })

  it('aucun mois facturé — vrai, et ce n’est pas un montant', () => {
    revenue.mockReturnValue({ revenue: undefined, denied: false, failed: false, canReadFinance: true })
    const { container } = render(<AccountRevenueBanner accountId={ACCOUNT} />)
    expect(screen.getByText(/Aucun mois n’a encore été facturé/)).toBeTruthy()
    expect(container.textContent).not.toMatch(/\b0\s*€/)
  })

  it('portée restreinte — l’ambiguïté est dite, pas tranchée', () => {
    revenue.mockReturnValue({ revenue: undefined, denied: false, failed: false, canReadFinance: false })
    render(<AccountRevenueBanner accountId={ACCOUNT} />)
    expect(screen.getByText(/hors de ton périmètre financier/)).toBeTruthy()
  })

  it('des mois facturés, aucun montant — le total ne se calcule pas, il ne vaut pas zéro', () => {
    revenue.mockReturnValue(aRevenue({ invoicedCents: null }))
    const { container } = render(<AccountRevenueBanner accountId={ACCOUNT} />)
    expect(screen.getByText(/il ne vaut pas zéro/)).toBeTruthy()
    expect(container.textContent).not.toMatch(/\b0\s*€/)
  })
})

describe('le tarif vendu moyen dit ce qu’il ignore', () => {
  it('nomme les missions sans TJM plutôt que de les fondre dans la moyenne', () => {
    render(<AccountRevenueBanner accountId={ACCOUNT} />)
    expect(screen.getByText(/1 mission sans TJM, hors du calcul/)).toBeTruthy()
  })

  it('aucun TJM du tout → un forfait n’achète pas à 0 € la journée', () => {
    rate.mockReturnValue(aRate({ averageSoldDailyRateCents: null, missionsWithoutRate: 1 }))
    const { container } = render(<AccountRevenueBanner accountId={ACCOUNT} />)
    expect(screen.getByText(/un forfait se facture aux jalons/)).toBeTruthy()
    expect(container.textContent).not.toMatch(/\b0\s*€\s*par jour/)
  })
})
