import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AccountMarketContext } from '@bellum/contracts'

type QueryState = { data?: AccountMarketContext | null; isPending: boolean; isError: boolean }

const state: { current: QueryState; enabled: boolean | undefined } = {
  current: { data: undefined, isPending: true, isError: false },
  enabled: undefined,
}

vi.mock('@/features/accounts/hooks/useAccountMarketContext', () => ({
  useAccountMarketContext: (_id: string | undefined, enabled: boolean) => {
    state.enabled = enabled
    return state.current
  },
}))

const { AccountMarketContextButton } = await import('./AccountMarketContextButton')

/**
 * #1582 — LE POPOVER « CONTEXTE MARCHÉ », et les trois choses qu'il ne dit
 * jamais.
 *
 * Cette suite ne garde pas une mise en page — jsdom n'en met aucune — mais les
 * REFUS qui font l'intérêt de cette forme, et qui se perdent au premier
 * copier-coller :
 *
 *  1. **Aucune date.** #1582 l'écrit, et la mémoire marché n'en expose pas.
 *  2. **Aucun « Non ».** Zéro ESN observée n'est pas « aucune ESN » : c'est
 *     « à qualifier ». Une absence d'observation ne devient jamais une
 *     négation — c'est la même règle que « non mesuré n'est pas zéro ».
 *  3. **Une panne ne se raconte pas comme une absence.** Sur 503, le popover le
 *     DIT ; il n'écrit ni « à qualifier », ni « 0 », ni rien du tout.
 *
 * Et le quatrième, qui est la raison d'être du popover : **il ne lit rien tant
 * qu'il est fermé.** Vingt-cinq lignes affichées ne déclenchent aucune requête.
 */

const ACCOUNT = '11111111-1111-4111-8111-111111111111'

function monter(paths: number | null | undefined) {
  return render(<AccountMarketContextButton accountId={ACCOUNT} companyName="Thales" pathsObserved={paths} />)
}

beforeEach(() => {
  state.current = { data: undefined, isPending: true, isError: false }
  state.enabled = undefined
})
afterEach(cleanup)

describe('l’icône ne se rend que sur un compte COUVERT', () => {
  it('compte couvert : l’icône est là, et c’est un bouton nommé (GA-32, GA-35)', () => {
    monter(41)
    const bouton = screen.getByRole('button', { name: /contexte marché/i })
    expect(bouton.tagName).toBe('BUTTON')
    expect(bouton.getAttribute('type')).toBe('button')
  })

  it('compte NON couvert (`null`) : aucune icône', () => {
    const { container } = monter(null)
    expect(container.firstChild).toBeNull()
  })

  it('mémoire illisible (champ ABSENT) : aucune icône — jamais une icône qui n’ouvrirait rien', () => {
    const { container } = monter(undefined)
    expect(container.firstChild).toBeNull()
  })

  it('`0` ne rend rien : `typeof 0 === "number"` est le piège déjà payé sur #1577', () => {
    const { container } = monter(0)
    expect(container.firstChild).toBeNull()
  })
})

describe('la requête ne part qu’à l’OUVERTURE', () => {
  it('fermé : le hook est appelé désactivé — 25 lignes, zéro requête', () => {
    monter(41)
    expect(state.enabled).toBe(false)
  })

  it('ouvert : le hook est activé', () => {
    monter(41)
    fireEvent.click(screen.getByRole('button', { name: /contexte marché/i }))
    expect(state.enabled).toBe(true)
  })
})

describe('ce que le popover écrit une fois ouvert', () => {
  function ouvrir(data: QueryState) {
    state.current = data
    monter(41)
    fireEvent.click(screen.getByRole('button', { name: /contexte marché/i }))
  }

  it('compte couvert, ESN observées : « Observé » et « Couvert », avec les parcours et la source', () => {
    ouvrir({ data: { paths_observed: 41, esn_observed: 2 }, isPending: false, isError: false })
    expect(screen.getByText('Recours à des externes')).toBeTruthy()
    expect(screen.getByText('Observé')).toBeTruthy()
    expect(screen.getByText('Écosystème ESN')).toBeTruthy()
    expect(screen.getByText('Couvert')).toBeTruthy()
    expect(
      screen.getByText('41 parcours de carrière lus dans les données de marché (personnes passées par ce compte)'),
    ).toBeTruthy()
    expect(screen.getByText('Observations du marché')).toBeTruthy()
  })

  it('aucune ESN observée : « À qualifier », JAMAIS « Aucune » ni un « Non »', () => {
    ouvrir({ data: { paths_observed: 12, esn_observed: 0 }, isPending: false, isError: false })
    expect(screen.getByText('À qualifier')).toBeTruthy()
    const texte = document.body.textContent ?? ''
    expect(texte).not.toMatch(/\bNon\b/)
    expect(texte).not.toMatch(/aucune/i)
    // Contrôle positif : sans lui, un rendu vide ferait passer les deux refus.
    expect(texte).toContain('12 parcours de carrière lus dans les données de marché (personnes passées par ce compte)')
  })

  it('aucune date, dans aucun état — le refus n’est pas une préférence de mise en page', () => {
    ouvrir({ data: { paths_observed: 41, esn_observed: 2 }, isPending: false, isError: false })
    const texte = document.body.textContent ?? ''
    expect(texte).not.toMatch(/\d{4}/)
    expect(texte).not.toMatch(/il y a |depuis |202\d/)
  })

  it('mémoire en panne : le popover le DIT — ni « à qualifier », ni « 0 », ni le silence', () => {
    ouvrir({ data: undefined, isPending: false, isError: true })
    expect(screen.getByText(/indisponible/i)).toBeTruthy()
    const texte = document.body.textContent ?? ''
    expect(texte).not.toContain('À qualifier')
    expect(texte).not.toContain('Observé')
    expect(texte).not.toMatch(/\b0 parcours/)
  })

  it('lecture en cours : ni verdict ni chiffre tant que la réponse n’est pas là', () => {
    ouvrir({ data: undefined, isPending: true, isError: false })
    const texte = document.body.textContent ?? ''
    expect(texte).not.toContain('Couvert')
    expect(texte).not.toContain('À qualifier')
    expect(texte).not.toMatch(/parcours observés/)
  })
})
