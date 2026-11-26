import { describe, expect, it } from 'vitest'
import { CRITERIA_WIDEN_MIN_RESULTS, type AccountSignalItem } from '@bellum/contracts'
import { buildWatchlistItems, WATCHLIST_DEFAULT_FILTERS } from './watchlist'
import { buildWatchlistView } from './watchlist-view'

// #4433.9 — Mes cibles / la veille : sous le seuil, le plateau s'élargit SEUL et dit le palier atteint.
const day = (offset: number) => new Date(Date.now() - offset * 86_400_000).toISOString().slice(0, 10)
const uuid = (n: number) => `${String(n).padStart(8, '0')}-1111-4111-8111-111111111111`

const signal = (n: number, overrides: Partial<AccountSignalItem> = {}): AccountSignalItem => ({
  id: `s${n}`,
  account_id: uuid(n),
  account_created_at: day(200),
  account_score: 8,
  company_name: `Compte ${n}`,
  date: day(3),
  label: 'Recrute 12 data engineers',
  sector: 'Services',
  source: 'Communiqué',
  type: 'Recrutement',
  ...overrides,
})

/** `total` comptes dont `treated` ont déjà déclenché une action (donc sortent de « À traiter »). */
const board = (total: number, treated: number) =>
  buildWatchlistItems(
    Array.from({ length: total }, (_, i) =>
      i < treated ? signal(i + 1, { action_id: `act-${i}`, action_label: 'Séquence lancée' }) : signal(i + 1),
    ),
  )

const state = (items: ReturnType<typeof board>, extra: Partial<Parameters<typeof buildWatchlistView>[1]> = {}) =>
  buildWatchlistView(items, {
    active: WATCHLIST_DEFAULT_FILTERS,
    activeTypes: new Set(),
    query: '',
    rules: [],
    profile: undefined,
    ...extra,
  })

describe('buildWatchlistView — les paliers de la veille (#4433.9)', () => {
  it('au-dessus du seuil : aucun élargissement', () => {
    const view = state(board(CRITERIA_WIDEN_MIN_RESULTS + 2, 1))
    expect(view.widening).toBeNull()
    expect(view.groups).toHaveLength(CRITERIA_WIDEN_MIN_RESULTS + 1)
  })

  it('« À traiter » maigre : élargi aux comptes déjà traités, l’exact en tête, le palier dit', () => {
    const view = state(board(14, 11)) // 3 à traiter, 11 traités
    expect(view.groups).toHaveLength(14)
    expect(view.groups.slice(0, 3).every(group => group.latest.triggeredActionLabel === null)).toBe(true)
    expect(view.widening).toEqual({
      minResults: CRITERIA_WIDEN_MIN_RESULTS,
      steps: [{ tier: 'watch_intent', added: 11 }],
    })
  })

  it('jamais un écran à zéro : « À traiter » à 0 ne s’applique déjà pas, tout se montre sans palier à annoncer', () => {
    const view = state(board(4, 4))
    expect(view.groups).toHaveLength(4)
    expect(view.widening).toBeNull()
  })

  it('un palier qui n’apporte rien n’est pas affiché', () => {
    // Tout est déjà « à traiter » : retirer l’intention ne change rien.
    const view = state(board(5, 0))
    expect(view.groups).toHaveLength(5)
    expect(view.widening).toBeNull()
  })

  it('un filtre posé par la personne est un geste : on ne le défait pas derrière son dos', () => {
    const items = board(14, 11)
    const prioritaires = state(items, { active: new Set(['priority'] as const) })
    expect(prioritaires.widening).toBeNull()
    const typed = state(items, { activeTypes: new Set(['hiring'] as const) })
    expect(typed.widening).toBeNull()
  })

  it('la recherche saisie n’est jamais élargie : c’est une demande, pas un filtre par défaut', () => {
    const view = state(board(14, 11), { query: 'Compte 1' })
    expect(view.widening).toBeNull()
    expect(view.groups.every(group => group.companyName.includes('Compte 1'))).toBe(true)
  })

  it('« revenir au strict » : la vue exacte, sans palier', () => {
    const view = state(board(14, 11), { strict: true })
    expect(view.widening).toBeNull()
    expect(view.groups).toHaveLength(3)
  })

  it('les chiffres des puces restent ceux de la vue stricte (rien ne ment sur ce que le filtre retient)', () => {
    const view = state(board(14, 11))
    expect(view.facetCounts.todo).toBe(3)
  })
})
