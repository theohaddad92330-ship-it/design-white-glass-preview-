import type { DataHygiene, HygieneLine } from '@bellum/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * La pastille d'hygiène, montée pour de vrai.
 *
 * Ce qu'elle doit prouver, dans l'ordre où ça coûte cher quand c'est faux :
 *
 *  1. une lecture qui n'a pas abouti n'affiche RIEN — « 0 » se lirait
 *     « tout est propre », c'est-à-dire l'inverse de ce qu'on sait ;
 *  2. un compte illisible (`count: null`) dit « non mesuré » et non zéro ;
 *  3. zéro est une VRAIE réponse : la pastille se dit satisfaite, jamais en
 *     alerte, et ne se clique pas — filtrer vers une liste vide est un
 *     cul-de-sac ;
 *  4. ce qui filtre est un `<button type="button">` (GA-35), ce qui ne filtre
 *     pas reste un TEXTE — jamais un bouton mort.
 */

const hygiene = vi.fn()
vi.mock('@/features/pilotage/api', () => ({ pilotageApi: { hygiene: () => hygiene() } }))

const { HygieneBadge } = await import('./HygieneBadge')

function line(over: Partial<HygieneLine> = {}): HygieneLine {
  return { key: 'needs_without_skills', count: 3, total: 12, link: '/projects/needs', ...over } as HygieneLine
}

function answer(...lines: HygieneLine[]): DataHygiene {
  return { lines }
}

function draw(props: Partial<Parameters<typeof HygieneBadge>[0]> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <HygieneBadge check="needs_without_skills" label="sans compétence typée" {...props} />
    </QueryClientProvider>,
  )
}

describe('pastille d’hygiène', () => {
  beforeEach(() => {
    cleanup()
    hygiene.mockReset()
  })

  it('affiche le compte du serveur et le libellé de l’écran', async () => {
    hygiene.mockResolvedValue(answer(line({ count: 3 })))
    draw()
    expect(await screen.findByText('3')).toBeInTheDocument()
    expect(screen.getByText('sans compétence typée')).toBeInTheDocument()
  })

  it('n’affiche RIEN tant que la lecture n’a pas abouti', () => {
    hygiene.mockReturnValue(new Promise(() => {}))
    const { container } = draw()
    expect(container).toBeEmptyDOMElement()
  })

  it('n’affiche RIEN quand la lecture échoue — un vide n’est pas « tout est propre »', async () => {
    hygiene.mockRejectedValue(new Error('403'))
    const { container } = draw()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(container).toBeEmptyDOMElement()
  })

  it('dit « non mesuré » quand le compte est illisible, jamais zéro', async () => {
    hygiene.mockResolvedValue(answer(line({ count: null, total: null })))
    draw()
    expect(await screen.findByText(/non mesuré/)).toBeInTheDocument()
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })

  it('à zéro, se dit satisfaite au lieu d’alerter', async () => {
    hygiene.mockResolvedValue(answer(line({ count: 0 })))
    const { container } = draw({ onFilter: vi.fn() })
    expect(await screen.findByText('0')).toBeInTheDocument()
    expect(container.querySelector('[data-hygiene-state="satisfied"]')).not.toBeNull()
    // Rien à réparer : filtrer mènerait à une liste vide.
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('#3963 — hideWhenEmpty : population vide = aucune pastille ; population non vide = pastille', async () => {
    hygiene.mockResolvedValue(answer(line({ count: 0, total: 0 })))
    const empty = draw({ hideWhenEmpty: true, emptyLabel: 'aucun objet' })
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(empty.container.querySelector('[data-hygiene-state]')).toBeNull()
    cleanup()
    hygiene.mockResolvedValue(answer(line({ count: 3, total: 12 })))
    draw({ hideWhenEmpty: true })
    expect(await screen.findByText('3')).toBeInTheDocument()
  })

  it('filtre au clic quand l’écran porte un filtre équivalent', async () => {
    hygiene.mockResolvedValue(answer(line({ count: 3 })))
    const onFilter = vi.fn()
    draw({ onFilter })
    const button = await screen.findByRole('button')
    expect(button).toHaveAttribute('type', 'button')
    fireEvent.click(button)
    expect(onFilter).toHaveBeenCalledTimes(1)
  })

  it('reste un TEXTE quand l’écran n’a pas de filtre — jamais un bouton mort', async () => {
    hygiene.mockResolvedValue(answer(line({ count: 3 })))
    draw()
    expect(await screen.findByText('3')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('rend la PART quand le seuil du contrôle en est une, sans la recalculer', async () => {
    hygiene.mockResolvedValue(
      answer({ key: 'talents_unknown_availability', count: 5, total: 40, link: '/consultants/pool' }),
    )
    draw({ check: 'talents_unknown_availability', label: 'à disponibilité inconnue' })
    expect(await screen.findByText('5 sur 40')).toBeInTheDocument()
  })

  it('ignore un contrôle absent de la réponse plutôt que d’inventer un zéro', async () => {
    hygiene.mockResolvedValue(answer())
    const { container } = draw()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(container).toBeEmptyDOMElement()
  })
  /**
   * #2877 (recette prod 02/10, /consultants) — la tuile disait « 17 » (le vivier
   * entier, candidats compris) quand la pastille disait « 0 sur 12 » (les
   * consultants seuls) : deux populations, aucune ne le disait. La pastille
   * NOMME ce qui est hors de son compte.
   */
  it('nomme la part du vivier qu’elle ne compte pas quand l’écran donne la population entière', async () => {
    hygiene.mockResolvedValue(answer(line({ key: 'talents_unknown_availability', count: 0, total: 12 })))
    draw({
      check: 'talents_unknown_availability',
      wholePopulation: 17,
      outsideLabel: outside => `${outside} candidats non comptés`,
    })
    expect(await screen.findByText(/5 candidats non comptés/)).toBeInTheDocument()
  })

  it('ne dit rien de plus quand la population entière est celle du contrôle', async () => {
    hygiene.mockResolvedValue(answer(line({ key: 'talents_unknown_availability', count: 0, total: 12 })))
    draw({
      check: 'talents_unknown_availability',
      wholePopulation: 12,
      outsideLabel: outside => `${outside} candidats non comptés`,
    })
    await screen.findByText(/0/)
    expect(screen.queryByText(/non comptés/)).not.toBeInTheDocument()
  })
})
