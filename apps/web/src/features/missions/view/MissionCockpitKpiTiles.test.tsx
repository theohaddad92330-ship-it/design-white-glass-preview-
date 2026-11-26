import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatCents } from '@/lib/money'
import { MissionCockpitKpiTiles } from './MissionCockpitKpiTiles'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}))

/**
 * #2408.63 / #2408.64 / #2408.65 / #2408.71 — LES TROIS TUILES GARDÉES.
 *
 * Fige uniquement ce qui est NEUF : le compte réel (.63), et la convention
 * « non mesuré n'est pas 0 » sur les deux montants (.71). `Amounts` (formatage
 * des montants eux-mêmes) a déjà ses tests sur `/pilotage/finance` — les
 * refaire ici romprait GA-26.
 */
afterEach(cleanup)

describe('MissionCockpitKpiTiles', () => {
  it('affiche un compte RÉEL de missions actives, zéro compris', () => {
    render(<MissionCockpitKpiTiles activeMissionsCount={0} canReadFinance securedRevenue={null} atRiskRevenue={null} />)
    expect(screen.getByText('0')).toBeInTheDocument()
  })

  it('sans finance:read, les deux montants disent le droit manquant — jamais un montant deviné', () => {
    render(
      <MissionCockpitKpiTiles
        activeMissionsCount={12}
        canReadFinance={false}
        securedRevenue={undefined}
        atRiskRevenue={undefined}
      />,
    )
    const unknown = screen.getAllByText(/non mesuré/i)
    expect(unknown.length).toBeGreaterThanOrEqual(2)
  })

  it('avec finance:read mais le prévisionnel encore en chargement, aucun montant deviné', () => {
    render(
      <MissionCockpitKpiTiles
        activeMissionsCount={12}
        canReadFinance
        securedRevenue={undefined}
        atRiskRevenue={undefined}
      />,
    )
    expect(screen.queryByText(/0 €/)).not.toBeInTheDocument()
  })

  it('mesuré, sans ligne chiffrable : "non mesuré", jamais "0 €" deviné (#2408.71)', () => {
    render(
      <MissionCockpitKpiTiles activeMissionsCount={12} canReadFinance securedRevenue={null} atRiskRevenue={null} />,
    )
    expect(screen.getAllByText(/non mesuré/i).length).toBeGreaterThanOrEqual(2)
    expect(screen.queryByText(/0 €/)).not.toBeInTheDocument()
  })

  it('affiche le montant réel une fois le prévisionnel chargé', () => {
    render(
      <MissionCockpitKpiTiles
        activeMissionsCount={12}
        canReadFinance
        securedRevenue={[{ currency: 'EUR', amountCents: 700_000 }]}
        atRiskRevenue={[{ currency: 'EUR', amountCents: 250_000 }]}
      />,
    )
    // `formatCents` intercale un espace fine insécable (U+202F) que le
    // normaliseur de testing-library réduit à un espace ordinaire — l'un et
    // l'autre subissent la MÊME réduction avant comparaison.
    const normalize = (value: string) => value.replace(/\s/g, ' ')
    expect(screen.getByText(normalize(formatCents(700_000, 'EUR')))).toBeInTheDocument()
    expect(screen.getByText(normalize(formatCents(250_000, 'EUR')))).toBeInTheDocument()
  })
})
