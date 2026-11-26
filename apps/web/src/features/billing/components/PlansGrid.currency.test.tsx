import { formatCurrencyAmount } from '@bellum/contracts'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PlansGrid } from './PlansGrid'

/**
 * Un montant se FORMATE à partir de son nombre ET de sa devise ; il ne se
 * concatène pas avec un symbole écrit dans une chaîne de traduction.
 *
 * Le défaut : `plansGrid.orPerYear`, `plansGrid.annualSaving` et
 * `plansGrid.extraSeatPrice` portaient `€` EN DUR, dans les deux langues, alors
 * que la carte connaît `currency` et ses montants en unités mineures. Le prix
 * mensuel juste au-dessus passait déjà par `formatCurrencyAmount` : la même
 * carte pouvait donc afficher « US$207.00 /mois » puis « ou 2484€/an ». Deux
 * devises sur une même carte, et c'est celle du bas qui est fausse.
 *
 * ⚠️ Ce fichier ne teste PAS les nombres — ils sont inchangés au centime près,
 * et `PlansGrid.test.tsx` les tient déjà. Il teste que chaque montant sort de
 * `formatCurrencyAmount` avec la devise de SA carte.
 */

let currency: 'eur' | 'usd' = 'eur'
let catalog: Record<string, unknown> | undefined

vi.mock('@/features/credits/hooks/usePlans', () => ({
  usePlans: () => ({ data: catalog, isError: false }),
}))
vi.mock('@/features/credits/hooks/useCheckout', () => ({
  useBillingCurrency: () => ({ data: { currency, locked: false, supported: ['eur', 'usd'] } }),
}))

function renderGrid() {
  return render(<PlansGrid currentPlanId="decouverte" loadingPlanId={null} onSelect={vi.fn()} />)
}

/**
 * `Intl` sépare le montant de son symbole par une espace fine insécable
 * (U+202F), que le DOM rendu conserve et que les comparaisons naïves ratent.
 * On ramène toutes les espaces à une seule forme des DEUX côtés — sinon le test
 * échouerait sur un caractère invisible plutôt que sur le formatage.
 */
function normalized(value: string): string {
  return value.replace(/\s+/gu, ' ')
}

/** Ce que le texte rendu ne doit JAMAIS contenir : un montant collé à son
 *  symbole, signature de la concaténation. */
const GLUED_EURO = /\d€/

describe('les montants annexes suivent la devise de la carte, comme le prix principal', () => {
  beforeEach(() => {
    currency = 'eur'
    catalog = undefined
  })

  it("formate le total annuel et l'économie au lieu de coller un symbole", async () => {
    const { container } = renderGrid()
    await userEvent.click(screen.getByRole('switch'))
    const text = normalized(container.textContent ?? '')

    // Team : 259 €/mois → 207 € annualisé → 2 484 €/an, 624 € gardés. Les deux
    // montants doivent être rendus EXACTEMENT comme le prix mensuel l'est.
    expect(text).toContain(normalized(formatCurrencyAmount(248400, 'eur', 'fr')))
    expect(text).toContain(normalized(formatCurrencyAmount(62400, 'eur', 'fr')))
  })

  it('formate aussi le prix du siège supplémentaire', () => {
    const { container } = renderGrid()
    // Starter : 39 €/mois par siège en plus.
    expect(normalized(container.textContent ?? '')).toContain(normalized(formatCurrencyAmount(3900, 'eur', 'fr')))
  })

  it('ne colle JAMAIS un chiffre à un symbole monétaire', async () => {
    const { container } = renderGrid()
    await userEvent.click(screen.getByRole('switch'))
    expect(container.textContent ?? '').not.toMatch(GLUED_EURO)
  })

  /**
   * Le témoin qui prouve que le montant suit vraiment la devise : sans lui, une
   * carte en dollars annoncerait son abonnement en dollars et son total annuel
   * en euros.
   */
  it('rend les montants annexes dans la devise de la carte, pas en euros', async () => {
    currency = 'usd'
    catalog = {
      team: {
        label: 'Team / Enterprise',
        price: 25900,
        accounts_limit: 600,
        enrichment_credits: 0,
        seats: 3,
        extra_seat_price: 5900,
        prices: { usd: { priceCents: 29900, extraSeatPriceCents: 6900 } },
      },
    }
    const { container } = renderGrid()
    await userEvent.click(screen.getByRole('switch'))
    const text = normalized(container.textContent ?? '')

    // 299 $/mois → 239 $ annualisé → 2 868 $/an, et 69 $ le siège en plus.
    expect(text).toContain(normalized(formatCurrencyAmount(286800, 'usd', 'fr')))
    expect(text).toContain(normalized(formatCurrencyAmount(6900, 'usd', 'fr')))
    expect(container.textContent ?? '').not.toMatch(GLUED_EURO)
  })
})
