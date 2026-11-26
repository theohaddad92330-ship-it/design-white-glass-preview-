import { describe, expect, it } from 'vitest'
import { UI_STATES, resolveScreenState, screenStateSchema, type ScreenStateFacts } from './ui-state.js'

/**
 * Les dix états d'écran — PDF 1 §2 (« Socle : primitives, contrats, gardes »,
 * 21/08/2026).
 *
 * Ce que ce test tient, dans l'ordre de la source :
 *  - les dix états existent, sous les noms de la source ;
 *  - `empty_never` et `empty_true` sont DEUX faits, jamais confondus ;
 *  - `partial` NOMME ce qui manque — un `partial` sans `detail` est refusé ;
 *  - `error` nomme un geste de reprise.
 */
describe('UI_STATES — les dix états d’écran', () => {
  it('porte exactement les dix états de la source, dans son ordre', () => {
    expect([...UI_STATES]).toEqual([
      'loading',
      'empty_never',
      'empty_true',
      'partial',
      'stale',
      'no_integration',
      'permission',
      'approval_required',
      'error',
      'success',
    ])
  })

  it('refuse un `partial` qui ne nomme pas ce qui manque', () => {
    const named = screenStateSchema.safeParse({
      state: 'partial',
      message: '3 blocs sur 5.',
      action: null,
      detail: 'La base des marchés publics n’a pas répondu.',
    })
    expect(named.success).toBe(true)

    const unnamed = screenStateSchema.safeParse({
      state: 'partial',
      message: 'Données incomplètes.',
      action: null,
      detail: null,
    })
    expect(unnamed.success).toBe(false)
  })

  it('refuse une `error` qui ne propose aucun geste de reprise', () => {
    const mute = screenStateSchema.safeParse({
      state: 'error',
      message: 'Une erreur est survenue.',
      action: null,
      detail: null,
    })
    expect(mute.success).toBe(false)

    const actionable = screenStateSchema.safeParse({
      state: 'error',
      message: 'La lecture a échoué.',
      action: { label: 'Réessayer', href: '/accounts' },
      detail: null,
    })
    expect(actionable.success).toBe(true)
  })

  it('accepte un `empty_true` sans détail — le filtre EST le détail', () => {
    const parsed = screenStateSchema.safeParse({
      state: 'empty_true',
      message: 'Aucun compte sur ces critères.',
      action: { label: 'Retirer le filtre', href: '/accounts' },
      detail: null,
    })
    expect(parsed.success).toBe(true)
  })
})

describe('resolveScreenState — la dérivation', () => {
  const facts = (over: Partial<ScreenStateFacts> = {}): ScreenStateFacts => ({
    isLoading: false,
    failed: false,
    canRead: true,
    integrationConnected: true,
    needsIntegration: false,
    awaitingApproval: false,
    everHadRows: true,
    visibleRows: 3,
    isNarrowed: false,
    missingParts: [],
    computedAt: null,
    freshForDays: null,
    now: new Date('2026-09-01T09:00:00.000Z'),
    ...over,
  })

  it('« jamais alimenté » et « alimenté puis filtré » ne rendent PAS le même état', () => {
    const never = resolveScreenState(facts({ everHadRows: false, visibleRows: 0 }))
    const filtered = resolveScreenState(facts({ everHadRows: true, visibleRows: 0, isNarrowed: true }))

    expect(never).toBe('empty_never')
    expect(filtered).toBe('empty_true')
    expect(never).not.toBe(filtered)
  })

  /**
   * Le cas qui a fait écrire GA-106 : l'écran n'avait JAMAIS eu de ligne, et un
   * filtre traînait dans l'URL. Ce n'est pas un vide filtré — retirer le filtre
   * ne rendrait rien. On invite à commencer.
   */
  it('un filtre posé sur un écran jamais alimenté reste `empty_never`', () => {
    expect(resolveScreenState(facts({ everHadRows: false, visibleRows: 0, isNarrowed: true }))).toBe('empty_never')
  })

  /**
   * ⚠️ `everHadRows: null` = on ne SAIT pas si l'écran a déjà été alimenté.
   * Ce n'est pas « jamais » : accuser l'utilisateur d'un vide qu'il n'a pas
   * créé est exactement la faute que ces deux états séparent. Sans la réponse,
   * on rend le vide FILTRÉ quand un filtre est posé, et `empty_never`
   * seulement quand rien n'est filtré — la seule lecture qui ne ment pas.
   */
  it('sans savoir si l’écran a déjà été alimenté, un filtre posé rend `empty_true`', () => {
    expect(resolveScreenState(facts({ everHadRows: null, visibleRows: 0, isNarrowed: true }))).toBe('empty_true')
    expect(resolveScreenState(facts({ everHadRows: null, visibleRows: 0, isNarrowed: false }))).toBe('empty_never')
  })

  it('le chargement passe avant tout le reste', () => {
    expect(resolveScreenState(facts({ isLoading: true, failed: true, visibleRows: 0, everHadRows: false }))).toBe(
      'loading',
    )
  })

  it('un refus de lecture n’est jamais un vide', () => {
    expect(resolveScreenState(facts({ canRead: false, visibleRows: 0, everHadRows: false }))).toBe('permission')
  })

  it('un connecteur manquant n’est jamais un vide', () => {
    expect(resolveScreenState(facts({ needsIntegration: true, integrationConnected: false, visibleRows: 0 }))).toBe(
      'no_integration',
    )
  })

  it('une validation en attente se dit avant le contenu', () => {
    expect(resolveScreenState(facts({ awaitingApproval: true, visibleRows: 7 }))).toBe('approval_required')
  })

  it('une partie manquante rend `partial`, même avec des lignes', () => {
    expect(resolveScreenState(facts({ visibleRows: 7, missingParts: ['DECP'] }))).toBe('partial')
  })

  it('une donnée plus vieille que sa fraîcheur rend `stale`', () => {
    const stale = facts({
      computedAt: '2026-08-01T09:00:00.000Z',
      freshForDays: 7,
      visibleRows: 4,
    })
    expect(resolveScreenState(stale)).toBe('stale')
  })

  /** Une date de calcul sans durée de fraîcheur ne périme rien : on ne devine
   *  pas une durée de vie. */
  it('sans durée de fraîcheur déclarée, rien ne périme', () => {
    expect(resolveScreenState(facts({ computedAt: '2020-01-01T00:00:00.000Z', freshForDays: null }))).toBe('success')
  })

  it('un échec rend `error`, jamais un vide', () => {
    expect(resolveScreenState(facts({ failed: true, visibleRows: 0, everHadRows: false }))).toBe('error')
  })

  it('des lignes sans rien à signaler rendent `success`', () => {
    expect(resolveScreenState(facts())).toBe('success')
  })
})
