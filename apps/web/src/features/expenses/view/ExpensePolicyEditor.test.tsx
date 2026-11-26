// #2406.36 — la date par défaut du champ « Date d'effet » se lit sur
// l'horloge LOCALE, jamais UTC (`local-day.test.ts` fixe le même fuseau pour
// la même raison : un runner CI qui ignorerait `TZ` ferait passer ce test
// pour la mauvaise raison, ou tomberait sans dire pourquoi).
process.env.TZ = 'Europe/Paris'

import type { ExpensePolicyBoard } from '@bellum/contracts'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { chooseOption } from '@/test/select'

const policies = vi.fn()
const savePolicy = vi.fn()

vi.mock('../api', () => ({
  useExpensePolicies: () => policies(),
  useSaveExpensePolicy: () => ({ mutate: savePolicy, isPending: false }),
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a>,
}))
const { ExpensePolicyEditor } = await import('./ExpensePolicyEditor')

/**
 * LE BARÈME DE FRAIS — l'écran de réglage (31/08/2026).
 *
 * Ce que ces tests protègent :
 *
 *  1. **Un plafond VIDE se lit « Non plafonnée »**, jamais « 0,00 € ». Le
 *     premier veut dire « non vérifiée », le second « catégorie interdite » —
 *     et l'écran est le dernier endroit où cette distinction peut se perdre.
 *  2. **Le barème kilométrique n'est pas FOURNI.** Vide à l'ouverture, il le
 *     DIT, et il dit ce que le vide entraîne.
 *  3. **Une révision est datée**, et l'historique se voit — sans quoi
 *     enregistrer effacerait des révisions sous lesquelles des notes ont déjà
 *     été jugées.
 *  4. **Un échec de lecture ne se rend pas « aucun barème »** : on écrirait
 *     par-dessus un barème qu'on n'a pas lu.
 */

function board(over: Partial<ExpensePolicyBoard> = {}): ExpensePolicyBoard {
  return {
    policies: [
      {
        id: 'p1',
        accountId: null,
        accountName: null,
        label: 'Barème interne',
        reimbursementBasis: 'actual',
        caps: [
          { category: 'meal', capCents: 2500, vatRecoverable: true, effectiveFrom: null },
          { category: 'hotel', capCents: 15000, vatRecoverable: false, effectiveFrom: null },
        ],
        mileageRates: [],
      },
    ],
    accounts: [{ id: '22222222-2222-4222-8222-222222222222', name: 'DINUM' }],
    accountsTruncated: false,
    ...over,
  }
}

function answer(over: Record<string, unknown> = {}) {
  return { data: board(), isLoading: false, isError: false, ...over }
}

beforeEach(() => {
  cleanup()
  policies.mockReset()
  savePolicy.mockReset()
})

describe('l’écran du barème de frais', () => {
  it('rend les douze catégories, chacune avec son plafond nommé', () => {
    policies.mockReturnValue(answer())
    render(<ExpensePolicyEditor />)

    expect(screen.getByLabelText('Plafond pour Repas')).toHaveValue('25.00')
    expect(screen.getByLabelText('Plafond pour Indemnité kilométrique')).toHaveValue('')
  })

  it('écrit « Non plafonnée » sur un champ vide — jamais « 0,00 € »', () => {
    // « Plafond zéro » interdirait la catégorie ; « non plafonnée » la laisse
    // NON VÉRIFIÉE. Deux faits, et l'écran est le dernier endroit où ils
    // peuvent se confondre.
    policies.mockReturnValue(answer())
    render(<ExpensePolicyEditor />)

    expect(screen.getAllByText('Non plafonnée').length).toBeGreaterThan(0)
    expect(screen.queryByText('0,00 €')).not.toBeInTheDocument()
  })

  it('envoie `null` — et non 0 — pour une catégorie sans plafond', async () => {
    policies.mockReturnValue(answer())
    render(<ExpensePolicyEditor />)

    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer le barème' }))
    const sent = savePolicy.mock.calls[0]?.[0]
    const supplies = sent.caps.find((cap: { category: string }) => cap.category === 'supplies')
    expect(supplies.capCents).toBeNull()
    const meal = sent.caps.find((cap: { category: string }) => cap.category === 'meal')
    expect(meal.capCents).toBe(2500)
  })

  it('DIT que le barème kilométrique est vide, et ce que ça entraîne', () => {
    // Le produit ne fournit AUCUN barème kilométrique : un barème inventé
    // serait une donnée fictive présentée comme une règle officielle.
    policies.mockReturnValue(answer())
    render(<ExpensePolicyEditor />)

    expect(screen.getByText('Aucun tarif saisi.')).toBeInTheDocument()
    expect(screen.getByText(/reste non vérifiée — jamais conforme/)).toBeInTheDocument()
  })

  it('laisse saisir un tarif kilométrique, et l’envoie avec la date de la révision', async () => {
    policies.mockReturnValue(answer())
    render(<ExpensePolicyEditor />)

    await userEvent.click(screen.getByRole('button', { name: 'Ajouter un tarif' }))
    await userEvent.type(screen.getByLabelText('Puissance fiscale du tarif 1'), '5')
    await userEvent.type(screen.getByLabelText('Euros par km du tarif 1'), '0,60')
    await userEvent.clear(screen.getByLabelText('Date d’effet'))
    await userEvent.type(screen.getByLabelText('Date d’effet'), '2026-09-01')
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer le barème' }))

    const sent = savePolicy.mock.calls[0]?.[0]
    expect(sent.effectiveFrom).toBe('2026-09-01')
    expect(sent.mileageRates).toEqual([{ fiscalHorsepower: 5, centsPerKm: 60 }])
  })

  describe('#2406.36 — la date d’effet par défaut se lit sur l’horloge LOCALE', () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    it('à 00 h 30 CEST, le champ propose AUJOURD’HUI — pas la veille en UTC', async () => {
      // Même instant que `local-day.test.ts` : 00 h 30 à Paris en heure d'été
      // = 22 h 30 UTC la VEILLE. `toISOString().slice(0, 10)` y rend
      // `2026-08-31`, la date d'hier — un utilisateur qui ouvre le réglage
      // dans cette fenêtre verrait sa révision datée de la veille par défaut.
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-09-01T00:30:00+02:00'))
      policies.mockReturnValue(answer())
      render(<ExpensePolicyEditor />)

      expect(screen.getByLabelText('Date d’effet')).toHaveValue('2026-09-01')
    })
  })

  it('un tarif à demi saisi n’est PAS envoyé', async () => {
    // Un tarif sans puissance ne s'applique à rien : l'envoyer poserait une
    // ligne que le barème ne pourrait jamais retrouver.
    policies.mockReturnValue(answer())
    render(<ExpensePolicyEditor />)

    await userEvent.click(screen.getByRole('button', { name: 'Ajouter un tarif' }))
    await userEvent.type(screen.getByLabelText('Euros par km du tarif 1'), '0,60')
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer le barème' }))

    expect(savePolicy.mock.calls[0]?.[0].mileageRates).toEqual([])
  })

  it('montre les révisions existantes — elles ne s’effacent pas', () => {
    policies.mockReturnValue(
      answer({
        data: board({
          policies: [
            {
              id: 'p1',
              accountId: null,
              accountName: null,
              label: 'Barème interne',
              reimbursementBasis: 'actual',
              caps: [
                { category: 'meal', capCents: 2500, vatRecoverable: true, effectiveFrom: null },
                { category: 'meal', capCents: 2800, vatRecoverable: true, effectiveFrom: '2026-09-01' },
              ],
              mileageRates: [],
            },
          ],
          accounts: [],
          accountsTruncated: false,
        }),
      }),
    )
    render(<ExpensePolicyEditor />)

    // Une note de mars continue d'être jugée sous le barème de mars.
    expect(screen.getByText('À partir du 2026-09-01 — 1 plafond(s)')).toBeInTheDocument()
    expect(screen.getByText('Depuis toujours — 1 plafond(s)')).toBeInTheDocument()
    // Et le formulaire s'ouvre sur la révision la PLUS RÉCENTE.
    expect(screen.getByLabelText('Plafond pour Repas')).toHaveValue('28.00')
  })

  it('bascule sur le barème d’un CLIENT depuis le même écran — une seule porte', async () => {
    policies.mockReturnValue(answer())
    render(<ExpensePolicyEditor />)

    await chooseOption(screen.getByLabelText('Quel barème'), '22222222-2222-4222-8222-222222222222')
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer le barème' }))

    expect(savePolicy.mock.calls[0]?.[0].accountId).toBe('22222222-2222-4222-8222-222222222222')
  })

  it('DIT que la liste de clients est tronquée plutôt que de la couper en silence', () => {
    policies.mockReturnValue(answer({ data: board({ accountsTruncated: true }) }))
    render(<ExpensePolicyEditor />)

    expect(screen.getByText(/Seuls les 200 premiers clients sont listés/)).toBeInTheDocument()
  })

  it('un échec de lecture ne se rend JAMAIS comme « aucun barème »', () => {
    policies.mockReturnValue(answer({ data: undefined, isError: true }))
    render(<ExpensePolicyEditor />)

    expect(screen.getByText('Le barème n’a pas pu être chargé')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Enregistrer le barème' })).not.toBeInTheDocument()
  })
})

/**
 * Théo D settings-espace.HT-5 — le barème kilométrique dans Règles métier › Frais : « Reporter sur <année suivante> »
 * et un exemple CALCULÉ sur le tarif saisi (jamais un tarif officiel).
 */
describe('le barème kilométrique — report et exemple', () => {
  const withRate = () =>
    answer({
      data: board({
        policies: [
          {
            id: 'p1',
            accountId: null,
            accountName: null,
            label: 'Barème interne',
            reimbursementBasis: 'actual',
            caps: [{ category: 'meal', capCents: 2500, vatRecoverable: true, effectiveFrom: '2026-01-01' }],
            mileageRates: [{ fiscalHorsepower: 5, centsPerKm: 63, effectiveFrom: '2026-01-01' }],
          },
        ],
      }),
    })

  it('calcule « 38 km en 5 CV » sur le tarif saisi', () => {
    policies.mockReturnValue(withRate())
    render(<ExpensePolicyEditor />)
    expect(screen.getByText(/Exemple : 38 km en 5 CV = 23,94/)).toBeInTheDocument()
  })

  it('NON : aucun tarif saisi pour 5 CV = aucun exemple, rien n’est deviné', () => {
    policies.mockReturnValue(answer())
    render(<ExpensePolicyEditor />)
    expect(screen.queryByText(/Exemple : 38 km/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Reporter sur/ })).toBeDisabled()
  })

  it('« Reporter sur 2027 » règle la date d’effet au 1er janvier suivant, sans rien enregistrer', async () => {
    policies.mockReturnValue(withRate())
    render(<ExpensePolicyEditor />)
    const effectiveFrom = screen.getByLabelText(/Date d’effet|date d’effet/i) as HTMLInputElement
    const year = Number(effectiveFrom.value.slice(0, 4))

    await userEvent.click(screen.getByRole('button', { name: `Reporter sur ${year + 1}` }))

    expect(effectiveFrom.value).toBe(`${year + 1}-01-01`)
    expect(savePolicy).not.toHaveBeenCalled()
  })
})
