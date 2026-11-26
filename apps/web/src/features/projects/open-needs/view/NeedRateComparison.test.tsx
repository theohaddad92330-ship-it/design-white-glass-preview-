import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AccountPropagation, OpenNeedRow } from '@bellum/contracts'

/**
 * « TARIF CIBLE vs TARIF VENDU MOYEN CHEZ CE CLIENT » (PDF-02 §4.2).
 *
 * Ce que ce fichier garde, et c'est la seule chose qui compte : **aucune
 * absence ne s'écrit « 0 »**. La question du dépôt se pose sur chaque chiffre —
 * *si cette valeur est absente, « 0 » est-il VRAI ?* — et la réponse est non
 * six fois sur six. Un client sans mission chiffrée n'achète pas « à 0 € », il
 * n'a pas d'historique de prix ; un besoin sans TJM cible n'est pas gratuit.
 *
 * Il garde aussi la distinction que ce dépôt a déjà payée deux fois : « cassé »,
 * « pas encore lu » et « rien à mesurer » ne partagent pas une phrase.
 */

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, ...rest }: { children: React.ReactNode } & Record<string, unknown>) => (
    <a {...(rest as Record<string, string>)}>{children}</a>
  ),
}))

const digest = vi.fn()
const accountRate = vi.fn()
vi.mock('@/features/propagation/api', () => ({ usePropagationDigest: () => digest() }))
vi.mock('@/features/propagation/hooks', () => ({ useAccountRate: () => accountRate() }))

const { NeedRateComparison } = await import('./NeedRateComparison')

function need(over: Partial<OpenNeedRow> = {}): OpenNeedRow {
  return {
    id: 'n-1',
    title: 'Ingénieur données',
    account_id: 'a-1',
    target_tjm_cents: 560_00,
    ...over,
  } as unknown as OpenNeedRow
}

function rate(over: Partial<AccountPropagation> = {}): AccountPropagation {
  return {
    accountId: 'a-1',
    missions: 8,
    averageSoldDailyRateCents: 620_00,
    missionsWithoutRate: 1,
    editable: false,
    source: { href: '/missions?accountId=a-1', label: 'Les missions de ce compte' },
    ...over,
  } as unknown as AccountPropagation
}

/**
 * « 0 € » ÉCRIT COMME UNE VALEUR — et jamais le zéro final de « 560 € ».
 *
 * ⚠️ La première version de cette garde était `/0\s*€/`, et elle mordait sur
 * « 560 € » : elle aurait échoué sur du code juste et, pire, elle n'aurait rien
 * appris. Le zéro qu'on interdit est un montant ENTIER nul, donc précédé de
 * n'importe quoi sauf d'un chiffre.
 */
const ZERO_EUROS = /(?:^|[^0-9])0\s*€/u

const READ_OK = { isPending: false, isError: false }

beforeEach(() => {
  digest.mockReturnValue(READ_OK)
  accountRate.mockReturnValue(rate())
})

describe('le tarif CIBLE', () => {
  it('s’affiche quand il a été communiqué', () => {
    render(<NeedRateComparison need={need()} />)
    expect(screen.getByTestId('need-rate-comparison')).toHaveTextContent('560')
  })

  it('DIT son absence — et n’écrit jamais « 0 € »', () => {
    render(<NeedRateComparison need={need({ target_tjm_cents: null })} />)
    const block = screen.getByTestId('need-rate-comparison')
    expect(block).toHaveTextContent(/Personne n’a communiqué de tarif cible/)
    // La preuve directe : un « 0 € » se lirait « gratuit ».
    expect(block.textContent).not.toMatch(ZERO_EUROS)
  })
})

describe('le tarif VENDU — cinq façons de ne pas avoir de chiffre, cinq phrases', () => {
  it('l’affiche, avec le nombre de missions qui le composent', () => {
    render(<NeedRateComparison need={need()} />)
    expect(screen.getByTestId('need-rate-comparison')).toHaveTextContent(/620/)
    expect(screen.getByTestId('need-rate-comparison')).toHaveTextContent(/8 missions/)
  })

  it('dit ce que la moyenne IGNORE — une moyenne muette se lit comme complète', () => {
    render(<NeedRateComparison need={need()} />)
    expect(screen.getByTestId('need-rate-comparison')).toHaveTextContent(/1 mission non chiffrée/)
  })

  it('porte un LIEN vers les missions — un bloc propagé ne s’édite jamais sur place (§4.4)', () => {
    const { container } = render(<NeedRateComparison need={need()} />)
    const anchors = [...container.querySelectorAll('a')]
    expect(anchors.length).toBeGreaterThan(0)
    // Et aucun champ de saisie : le chiffre se corrige dans les MISSIONS.
    expect(container.querySelector('input, textarea, select')).toBeNull()
  })

  it('ne dit RIEN de faux pendant le chargement — « aucune mission » serait un zéro déguisé', () => {
    digest.mockReturnValue({ isPending: true, isError: false })
    accountRate.mockReturnValue(undefined)
    const block = render(<NeedRateComparison need={need()} />).getByTestId('need-rate-comparison')
    expect(block).toHaveTextContent(/Je regarde à quel prix ce client achète/)
    expect(block).not.toHaveTextContent(/aucune mission/i)
  })

  it('distingue une PANNE d’une absence — « cassé » et « rien à comparer » ne se ressemblent pas', () => {
    digest.mockReturnValue({ isPending: false, isError: true })
    accountRate.mockReturnValue(undefined)
    const block = render(<NeedRateComparison need={need()} />).getByTestId('need-rate-comparison')
    expect(block).toHaveTextContent(/Je n’ai pas pu lire les missions/)
    expect(block).not.toHaveTextContent(/n’a encore aucune mission/)
  })

  it('DIT son absence quand le client n’a aucune mission — au lieu d’écrire un zéro', () => {
    // Le serveur ne rend AUCUNE ligne pour un compte sans mission
    // (`missions` est `positive()`). C'est l'état du prospect, et il est vrai.
    accountRate.mockReturnValue(undefined)
    const block = render(<NeedRateComparison need={need()} />).getByTestId('need-rate-comparison')
    expect(block).toHaveTextContent(/Ce client n’a encore aucune mission/)
    expect(block.textContent).not.toMatch(ZERO_EUROS)
  })

  it('DIT son absence quand aucune mission n’est chiffrée — un forfait ne porte pas de TJM', () => {
    accountRate.mockReturnValue(rate({ averageSoldDailyRateCents: null, missions: 3, missionsWithoutRate: 3 }))
    const block = render(<NeedRateComparison need={need()} />).getByTestId('need-rate-comparison')
    expect(block).toHaveTextContent(/3 missions.*aucune ne porte de tarif journalier/s)
    expect(block.textContent).not.toMatch(ZERO_EUROS)
  })

  it('dit qu’il n’y a personne chez qui comparer quand le besoin n’a pas de compte', () => {
    const block = render(<NeedRateComparison need={need({ account_id: '' })} />).getByTestId('need-rate-comparison')
    expect(block).toHaveTextContent(/n’est rattaché à aucun compte/)
  })
})

describe('l’ÉCART — et rien de plus', () => {
  it('dit de combien le tarif cible est au-DESSOUS', () => {
    render(<NeedRateComparison need={need({ target_tjm_cents: 560_00 })} />)
    expect(screen.getByTestId('need-rate-comparison')).toHaveTextContent(/60.*de moins par jour/)
  })

  it('dit de combien il est au-DESSUS', () => {
    render(<NeedRateComparison need={need({ target_tjm_cents: 700_00 })} />)
    expect(screen.getByTestId('need-rate-comparison')).toHaveTextContent(/80.*de plus par jour/)
  })

  it('dit qu’il n’y en a pas plutôt que d’écrire « 0 € d’écart »', () => {
    render(<NeedRateComparison need={need({ target_tjm_cents: 620_00 })} />)
    const block = screen.getByTestId('need-rate-comparison')
    expect(block).toHaveTextContent(/exactement celui auquel ce client achète/)
    expect(block.textContent).not.toMatch(/0\s*€\s*(de plus|de moins|d’écart)/)
  })

  it('ne calcule AUCUN écart quand l’un des deux manque', () => {
    // Un écart contre une absence produirait un nombre qui ressemble à une
    // mesure — c'est-à-dire la pire forme de faux.
    render(<NeedRateComparison need={need({ target_tjm_cents: null })} />)
    expect(screen.getByTestId('need-rate-comparison')).not.toHaveTextContent(/de plus par jour|de moins par jour/)

    accountRate.mockReturnValue(rate({ averageSoldDailyRateCents: null }))
    const second = render(<NeedRateComparison need={need()} />).container
    expect(second.textContent).not.toMatch(/de plus par jour|de moins par jour/)
  })

  it('ne porte AUCUN jugement — l’écart est un fait, pas un verdict', () => {
    // « Tu te vends trop bas » supposerait que ce besoin est comparable aux
    // missions déjà vendues. Rien ne le dit : il peut être plus junior, plus
    // court, d'une autre nature. On rend l'écart, le commercial arbitre.
    render(<NeedRateComparison need={need({ target_tjm_cents: 400_00 })} />)
    expect(screen.getByTestId('need-rate-comparison')).not.toHaveTextContent(/trop bas|trop cher|attention|augmente/i)
  })
})
