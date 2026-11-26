import { missionsOfAccount, propagated } from '@bellum/contracts'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AccountRevenueColumn } from '@/features/propagation/hooks'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, ...rest }: { children: React.ReactNode }) => (
    <a href="/missions" {...rest}>
      {children}
    </a>
  ),
}))

const { AccountRevenueCell } = await import('./AccountRevenueCell')

const ACCOUNT = '11111111-1111-4111-8111-111111111111'

/**
 * LA COLONNE « FACTURÉ » DU PORTEFEUILLE — et les quatre absences qu'elle
 * refuse d'écrire « 0 € ».
 *
 * Chaque cas ci-dessous a une CAUSE différente et envoie chercher la panne à un
 * endroit différent. Les replier sur un même « 0 » serait une information fausse
 * énoncée avec l'aplomb d'une mesure.
 */
function column(over: Partial<AccountRevenueColumn> = {}): AccountRevenueColumn {
  return { visible: true, failed: false, canReadFinance: true, byAccount: new Map(), ...over }
}

function withRevenue(invoicedCents: number | null, over: Record<string, number> = {}): AccountRevenueColumn {
  return column({
    byAccount: new Map([
      [
        ACCOUNT,
        propagated(
          {
            accountId: ACCOUNT,
            invoicedCents,
            invoicedMonths: 13,
            missions: 7,
            monthsWithoutAmount: 1,
            ...over,
          },
          missionsOfAccount(ACCOUNT),
        ),
      ],
    ]),
  })
}

afterEach(cleanup)

describe('le montant facturé, quand il est mesuré', () => {
  it('affiche la somme et la rend cliquable vers sa source (§4.4)', () => {
    render(<AccountRevenueCell accountId={ACCOUNT} column={withRevenue(14_820_000)} />)
    const link = screen.getByRole('link')
    // 148 200 € — l'espace est une insécable dans la sortie d'`Intl`.
    expect(link.textContent?.replace(/\s/g, '')).toContain('148200')
    // Elle se CLIQUE et ne s'ÉDITE pas : le chiffre se corrige dans les missions.
    expect(link.querySelector('input')).toBeNull()
  })
})

describe('les quatre absences, et aucune ne vaut zéro', () => {
  it('aucune ligne, droit complet → « aucun mois facturé », jamais « 0 € »', () => {
    const { container } = render(<AccountRevenueCell accountId={ACCOUNT} column={column()} />)
    expect(container.textContent).not.toMatch(/0/)
    expect(screen.getByLabelText(/Aucun mois facturé sur ce compte$/)).toBeTruthy()
  })

  it('aucune ligne, portée restreinte → l’ambiguïté est DITE, pas tranchée', () => {
    // Sous `finance:read:own`, une absence veut dire « rien de facturé » OU
    // « hors de ton portefeuille ». L'écran ne choisit pas pour le lecteur.
    render(<AccountRevenueCell accountId={ACCOUNT} column={column({ canReadFinance: false })} />)
    expect(screen.getByLabelText(/hors de ton périmètre financier/)).toBeTruthy()
  })

  it('des mois facturés mais aucun montant saisi → ce n’est pas « 0 € »', () => {
    // Le serveur rend `null` exprès (`SUM` sans `COALESCE`). Un `?? 0` ici
    // annulerait ce soin, et un client qui paye depuis trois ans afficherait 0.
    const { container } = render(<AccountRevenueCell accountId={ACCOUNT} column={withRevenue(null)} />)
    expect(container.textContent).not.toMatch(/€/)
    expect(screen.getByLabelText(/aucun ne porte de montant saisi/)).toBeTruthy()
  })

  it('lecture en échec → « cassé » ne se lit pas comme « rien à facturer »', () => {
    render(<AccountRevenueCell accountId={ACCOUNT} column={column({ failed: true })} />)
    expect(screen.getByLabelText(/n’a pas pu être chargé/)).toBeTruthy()
  })
})

describe('le tiret n’est pas muet', () => {
  it('porte le même nom pour l’œil et pour un lecteur d’écran', () => {
    // Un « – » seul dit « pas de montant » à qui le voit et RIEN à qui ne le
    // voit pas. Même règle que le tiret de la colonne Score, juste à côté.
    render(<AccountRevenueCell accountId={ACCOUNT} column={column()} />)
    const dash = screen.getByLabelText(/Aucun mois facturé sur ce compte$/)
    expect(dash.getAttribute('title')).toBe(dash.getAttribute('aria-label'))
  })
})
