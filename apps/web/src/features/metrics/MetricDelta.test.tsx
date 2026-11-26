import { render, screen } from '@testing-library/react'
import type { MetricSeriesResponse } from '@bellum/contracts'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * LE RENDU UNIQUE DE LA VARIATION — ce qu'il dit, et ce qu'il refuse de dire.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT QU'IL CORRIGE
 * ─────────────────────────────────────────────────────────────────────────────
 * Cinq écrans affichaient « non mesuré » sur leurs variations, avec trois
 * formulations différentes — et deux qui ne disaient rien du tout. La cause était
 * unique : `StockSnapshotService.seriesFor` existait, était juste, testée, et
 * n'avait aucune route. Le corriger côté serveur ne suffit pas : si chaque écran
 * refait ensuite son affichage, ils divergeront au premier changement de règle.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES QUATRE RÈGLES GARDÉES ICI
 * ─────────────────────────────────────────────────────────────────────────────
 *  1. **Rien pendant le chargement.** Ni « non mesuré », ni « 0 » : les deux sont
 *     des AFFIRMATIONS, et il n'y a qu'une requête en vol.
 *  2. **Le premier mois n'est pas une panne**, et il se distingue d'un TROU dans
 *     la série — deux phrases différentes, sur le même code d'absence.
 *  3. **Un taux se lit en POINTS.** « 30 % → 33 % » fait +3 pts, jamais +10 %.
 *  4. **Une variation nulle est un fait mesuré** — « stable », jamais « +0 ».
 */

const useQuery = vi.fn()
vi.mock('@tanstack/react-query', () => ({ useQuery: (options: unknown) => useQuery(options) }))
vi.mock('@/lib/api', () => ({ apiFetch: vi.fn() }))

const { MetricDelta } = await import('./MetricDelta')

/** Une réponse de série, telle que `GET /pilotage/metric-series` la rend. */
function series(over: Partial<MetricSeriesResponse> = {}): MetricSeriesResponse {
  return {
    monthsCovered: 3,
    series: [
      {
        metricKey: 'accounts_without_next_action',
        unit: 'count',
        points: [
          { month: '2026-06', value: 11, denominator: 34 },
          { month: '2026-07', value: 9, denominator: 38 },
          { month: '2026-08', value: 5, denominator: 42 },
        ],
      },
    ],
    ...over,
  }
}

const answered = (data: MetricSeriesResponse) => ({ data, isPending: false, isError: false })

/**
 * La ligne « non mesuré ».
 *
 * ⚠️ On la cherche par son TITRE, pas par son texte : `UnknownValue` rend
 * « non mesuré — <la raison> » dans un seul nœud, et un `getByText('non mesuré')`
 * échoue sur du texte composé. La chercher par un fragment de la raison ferait
 * passer le test pour la mauvaise raison.
 */
const unmeasured = () => {
  const node = document.querySelector('[title]')
  expect(node).not.toBeNull()
  return node as HTMLElement
}

beforeEach(() => {
  useQuery.mockReset()
})

describe('MetricDelta — pendant le chargement, on n’affirme rien', () => {
  it('ne rend RIEN tant que la requête est en vol', () => {
    useQuery.mockReturnValue({ data: undefined, isPending: true, isError: false })
    const { container } = render(<MetricDelta metric="accounts_without_next_action" />)

    // Ni « non mesuré », ni « 0 », ni « +0 % » : trois façons d'affirmer ce
    // qu'on ne sait pas encore.
    expect(container.textContent).toBe('')
  })
})

describe('MetricDelta — « non mesuré » porte toujours SA raison', () => {
  it('sur un espace neuf, dit que c’est le PREMIER MOIS et que la suite arrive', () => {
    useQuery.mockReturnValue(
      answered({
        monthsCovered: 1,
        series: [{ metricKey: 'benchAvailable', unit: 'count', points: [{ month: '2026-08', value: 3 }] }],
      }),
    )
    render(<MetricDelta metric="benchAvailable" />)

    expect(unmeasured()).toHaveTextContent('non mesuré')
    expect(unmeasured()).toHaveAttribute('title', 'premier mois — la comparaison arrive le mois prochain')
  })

  it('sur un espace ANCIEN, le même code d’absence dit un TROU dans la série', () => {
    // La distinction qui compte : « pas encore » n'appelle aucun geste, un trou
    // veut dire qu'un balayage mensuel a manqué un passage.
    useQuery.mockReturnValue(
      answered({
        monthsCovered: 12,
        series: [{ metricKey: 'benchAvailable', unit: 'count', points: [{ month: '2026-08', value: 3 }] }],
      }),
    )
    render(<MetricDelta metric="benchAvailable" />)

    expect(unmeasured()).toHaveAttribute('title', 'aucune photo du mois de référence')
  })

  it('une métrique jamais photographiée dit « aucune photo de ce mois »', () => {
    useQuery.mockReturnValue(answered(series()))
    render(<MetricDelta metric="missions_without_cost" />)

    expect(unmeasured()).toHaveAttribute('title', 'aucune photo de ce mois')
  })

  it('n’écrit JAMAIS un zéro à la place d’une absence', () => {
    useQuery.mockReturnValue(answered({ monthsCovered: 0, series: [] }))
    const { container } = render(<MetricDelta metric="benchAvailable" />)

    expect(container.textContent).not.toMatch(/0/)
    expect(unmeasured()).toHaveTextContent('non mesuré')
  })
})

describe('MetricDelta — ce que la variation dit quand elle est mesurée', () => {
  it('rend le signe, la valeur ABSOLUE et la période', () => {
    useQuery.mockReturnValue(answered(series()))
    render(<MetricDelta metric="accounts_without_next_action" />)

    // 9 → 5 : quatre de moins. Le signe porte le sens en TEXTE.
    expect(screen.getByText(/−4/)).toBeInTheDocument()
    expect(screen.getByText(/vs mois dernier/)).toBeInTheDocument()
  })

  it('accompagne le dénombrement de sa variation RELATIVE', () => {
    useQuery.mockReturnValue(
      answered(
        series({
          series: [
            {
              metricKey: 'accounts_without_next_action',
              unit: 'count',
              points: [
                { month: '2026-07', value: 18, denominator: 38 },
                { month: '2026-08', value: 10, denominator: 42 },
              ],
            },
          ],
        }),
      ),
    )
    render(<MetricDelta metric="accounts_without_next_action" />)

    // −8 sur une base de 18 → −44,4 % (sous une base de 10, le pourcentage se tait : recette 14/10).
    expect(screen.getByText(/44,4 %/)).toBeInTheDocument()
  })

  it('remonte de douze mois quand on demande « vs N-1 »', () => {
    useQuery.mockReturnValue(
      answered({
        monthsCovered: 13,
        series: [
          {
            metricKey: 'benchAvailable',
            unit: 'count',
            points: [
              { month: '2025-08', value: 2 },
              { month: '2026-08', value: 6 },
            ],
          },
        ],
      }),
    )
    render(<MetricDelta metric="benchAvailable" period="yearAgo" />)

    expect(screen.getByText(/\+4/)).toBeInTheDocument()
    expect(screen.getByText(/vs N-1/)).toBeInTheDocument()
  })

  it('une variation NULLE se dit « stable » — jamais « +0 »', () => {
    useQuery.mockReturnValue(
      answered({
        monthsCovered: 2,
        series: [
          {
            metricKey: 'benchAvailable',
            unit: 'count',
            points: [
              { month: '2026-07', value: 3 },
              { month: '2026-08', value: 3 },
            ],
          },
        ],
      }),
    )
    const { container } = render(<MetricDelta metric="benchAvailable" />)

    expect(screen.getByText(/stable/)).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/[+−]0/)
  })

  it('affiche la POPULATION quand l’écran le demande, et jamais sinon', () => {
    useQuery.mockReturnValue(answered(series()))
    const { container, rerender } = render(<MetricDelta metric="accounts_without_next_action" />)
    expect(container.textContent).not.toMatch(/sur 42/)

    rerender(<MetricDelta metric="accounts_without_next_action" showPopulation />)
    expect(screen.getByText(/sur 42/)).toBeInTheDocument()
  })
})

describe('MetricDelta — un TAUX se lit en points', () => {
  it('écrit « pts » et AUCUN pourcentage', () => {
    useQuery.mockReturnValue(
      answered({
        monthsCovered: 2,
        series: [
          {
            metricKey: 'invoices_ready',
            unit: 'ratio',
            points: [
              { month: '2026-07', value: 30, denominator: 10 },
              { month: '2026-08', value: 33, denominator: 12 },
            ],
          },
        ],
      }),
    )
    const { container } = render(<MetricDelta metric="invoices_ready" />)

    // 30 % → 33 % fait +3 POINTS. « +10 % » serait vrai sur un autre calcul et
    // faux pour ce que l'écran montre.
    expect(screen.getByText(/\+3 pts/)).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/%/)
  })
})

describe('MetricDelta — une POPULATION se lit sous son propre nom', () => {
  it('« besoins ouverts » se compare sans que l’écran sache qu’il lit un dénominateur', () => {
    useQuery.mockReturnValue(
      answered({
        monthsCovered: 2,
        series: [
          {
            metricKey: 'needs_without_skills',
            unit: 'count',
            points: [
              { month: '2026-07', value: 5, denominator: 12 },
              { month: '2026-08', value: 4, denominator: 13 },
            ],
          },
        ],
      }),
    )
    render(<MetricDelta metric="open_needs" />)

    // Un besoin ouvert de plus : 12 → 13.
    expect(screen.getByText(/\+1/)).toBeInTheDocument()
  })
})

describe('MetricDelta — la couleur appuie, elle ne porte jamais seule', () => {
  it('reste GRISE tant que personne n’a dit ce que monter veut dire', () => {
    useQuery.mockReturnValue(answered(series()))
    const { container } = render(<MetricDelta metric="accounts_without_next_action" />)

    expect(container.innerHTML).not.toMatch(/success-soft-text|warning-soft-text/)
  })

  it('devient FAVORABLE quand baisser est une bonne nouvelle', () => {
    useQuery.mockReturnValue(answered(series()))
    const { container } = render(<MetricDelta metric="accounts_without_next_action" sense="lessIsBetter" />)

    expect(container.innerHTML).toMatch(/success-soft-text/)
  })

  it('devient DÉFAVORABLE sur la même baisse quand monter était la bonne nouvelle', () => {
    useQuery.mockReturnValue(answered(series()))
    const { container } = render(<MetricDelta metric="accounts_without_next_action" sense="moreIsBetter" />)

    expect(container.innerHTML).toMatch(/warning-soft-text/)
  })

  it('n’utilise AUCUNE couleur hexadécimale ni classe de palette Tailwind', () => {
    // Les deux court-circuitent le thème : une couleur figée ne suit pas le
    // basculement clair/sombre, et une classe de palette contourne les tokens.
    useQuery.mockReturnValue(answered(series()))
    const { container } = render(<MetricDelta metric="accounts_without_next_action" sense="lessIsBetter" />)

    expect(container.innerHTML).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(container.innerHTML).not.toMatch(/text-(?:amber|red|green|emerald|slate|zinc)-\d{3}/)
  })
})
