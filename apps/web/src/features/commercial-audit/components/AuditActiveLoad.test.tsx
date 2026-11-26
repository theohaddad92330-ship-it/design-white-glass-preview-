import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { buildAuditActiveLoad, buildAuditDeclaredSignals, type AuditSignalsInput } from '@bellum/contracts'
import { AuditActiveLoad } from './AuditActiveLoad'

/**
 * #2067.2 / #2067.4 / #2067.5 / #2067.6 — LA CARTE DE L'ARBITRAGE.
 *
 * Elle dit NON à trois choses : une grandeur rendue sans la RÈGLE qui la
 * produit, une grandeur non établie rendue par un chiffre (0 compris), et un
 * repère de volume sans son hypothèse (#2067.8-.11).
 */
function loadOf(input: AuditSignalsInput) {
  return buildAuditActiveLoad(input, buildAuditDeclaredSignals(input).frontsBudget)
}

const OVERLOADED: AuditSignalsInput = {
  weekly_sales_time_protected: '5 à 10 heures par semaine',
  protected_slot_capacity: 'Je bloque des créneaux mais ils sautent souvent',
  weekly_sales_time_slots: ['Tôt le matin, avant 9 h', 'En fin de journée, après 16 h'],
  go_to_market_channels: ['Direct client final', "Appels d'offres", 'Référencements'],
}

function card(title: string): HTMLElement {
  const heading = screen.getByRole('heading', { name: title })
  return heading.parentElement as HTMLElement
}

describe('AuditActiveLoad — #2067.2/.4/.5/.6', () => {
  it('rend chaque grandeur établie AVEC la règle qui la produit', () => {
    render(<AuditActiveLoad activeLoad={loadOf(OVERLOADED)} />)
    const partners = card('Les partenaires à travailler')
    expect(within(partners).getByText(/Aucun partenaire dans ta charge active/)).toBeInTheDocument()
    expect(within(partners).getByText(/^Règle :/)).toBeInTheDocument()

    const slots = card('Tes créneaux')
    expect(within(slots).getByText(/Tôt le matin, avant 9 h, En fin de journée, après 16 h/)).toBeInTheDocument()
    expect(within(slots).getByText(/ils sautent souvent/)).toBeInTheDocument()

    const reserve = card('Ta réserve')
    expect(within(reserve).getByText(/Aucune réserve/)).toBeInTheDocument()
    expect(
      within(reserve).getByText(/ton budget de fronts \(2\) moins tes portes d’entrée ouvertes \(3\)/),
    ).toBeInTheDocument()

    const deferred = card('Ce qu’il faut reporter')
    expect(within(deferred).getByText(/Reporte 1 de ces portes d’entrée/)).toBeInTheDocument()
    expect(within(deferred).getByText(/c’est à toi de trancher/)).toBeInTheDocument()
  })

  it('une grandeur NON ÉTABLIE nomme la réponse qui manque — et n’affiche aucun chiffre', () => {
    render(<AuditActiveLoad activeLoad={loadOf({})} />)
    const reserve = card('Ta réserve')
    expect(within(reserve).getByText('Non établi.')).toBeInTheDocument()
    expect(within(reserve).getByText(/le temps que tu protèges vraiment chaque semaine/)).toBeInTheDocument()
    expect(reserve.textContent ?? '').not.toMatch(/\d/)
    expect(screen.getAllByText('Non établi.')).toHaveLength(4)
  })

  it('#2067.2 — une porte partenaire et le nombre déclaré : les réguliers dans la charge, les ponctuels hors d’elle', () => {
    render(
      <AuditActiveLoad
        activeLoad={loadOf({
          ...OVERLOADED,
          go_to_market_channels: ['Rang 2'],
          partners_regular_count: '2',
          partners_occasional_count: '4-5',
        })}
      />,
    )
    const partners = card('Les partenaires à travailler')
    expect(within(partners).getByText(/Partenaires réguliers à travailler : 2/)).toBeInTheDocument()
    expect(
      within(partners).getByText(/Tes partenaires ponctuels \(4-5\) restent hors de ta charge active/),
    ).toBeInTheDocument()
    expect(within(partners).getByText(/^Règle :/)).toBeInTheDocument()
  })

  it('#2067.2 — une porte partenaire SANS le nombre : non établi, la question nommée, aucun chiffre', () => {
    render(<AuditActiveLoad activeLoad={loadOf({ ...OVERLOADED, go_to_market_channels: ['Rang 2'] })} />)
    const partners = card('Les partenaires à travailler')
    expect(within(partners).getByText('Non établi.')).toBeInTheDocument()
    expect(within(partners).getByText(/avec combien de partenaires réguliers tu travailles/)).toBeInTheDocument()
    expect(partners.textContent ?? '').not.toMatch(/\d/)
  })

  it('#2067.8-.11 — le repère de volume porte son hypothèse', () => {
    render(<AuditActiveLoad activeLoad={loadOf(OVERLOADED)} />)
    expect(screen.getByText(/pas une conversion démontrée/)).toBeInTheDocument()
  })
})
