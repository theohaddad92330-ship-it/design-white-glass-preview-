import { computeQualityIndicators, type ActionRecord } from './quality-metrics'

const action = (over: Partial<ActionRecord> = {}): ActionRecord => ({
  actionType: 'export',
  outcome: 'success',
  durationMs: 1000,
  errorExplained: null,
  userId: 'u1',
  ...over,
})

const indicators = (actions: ActionRecord[], routines = new Map<string, number>()) =>
  Object.fromEntries(computeQualityIndicators({ actions, routinesByUser: routines }).map(i => [i.key, i]))

describe('computeQualityIndicators', () => {
  it('rend null — pas zéro — quand il n’y a rien à mesurer', () => {
    // Un espace créé hier ne doit pas afficher « 0 % d'exécution vérifiée » et
    // faire chercher une panne qui n'existe pas.
    const result = indicators([])
    expect(result['verified_execution']?.value).toBeNull()
    expect(result['useful_drafts']?.value).toBeNull()
    expect(result['recoverable_errors']?.value).toBeNull()
  })

  it('calcule le taux d’exécution sur les seules actions TRANCHÉES', () => {
    const result = indicators([
      action({ outcome: 'success' }),
      action({ outcome: 'failed' }),
      // Une action « partielle » n'est ni un succès ni un échec : elle sort du
      // dénominateur plutôt que de fausser les deux taux.
      action({ outcome: 'partial' }),
      action({ outcome: null }),
    ])
    expect(result['verified_execution']?.value).toBe(0.5)
    expect(result['verified_execution']?.sample).toBe(2)
  })

  it('l’écart annonce/résultat est le complément du taux d’exécution', () => {
    const result = indicators([action({ outcome: 'success' }), action({ outcome: 'failed' })])
    expect(result['hallucination']?.value).toBe(0.5)
  })

  it('mesure les brouillons conservés sur les seuls brouillons', () => {
    const result = indicators([
      action({ actionType: 'plan_action_message_generated', outcome: 'success' }),
      action({ actionType: 'plan_action_message_generated', outcome: 'failed' }),
      action({ actionType: 'export', outcome: 'success' }),
    ])
    expect(result['useful_drafts']?.value).toBe(0.5)
    expect(result['useful_drafts']?.sample).toBe(2)
  })

  it('#2108.57 — le vrai brouillon écrit par le seul appelant (EngagementPanel.tsx), pas un littéral mort', () => {
    // `draft_created` n'existe dans AUCUN écrivain (`git grep` = 0 résultat) —
    // seul `plan_action_message_generated` est réellement posé en base
    // (`EngagementPanel.tsx:156`). Un filtre qui recomparerait encore à
    // `draft_created` gonflerait le compte avec ce témoin mort tout en
    // ignorant les trois vrais brouillons ci-dessous.
    const result = indicators([
      action({ actionType: 'plan_action_message_generated', outcome: 'success' }),
      action({ actionType: 'plan_action_message_generated', outcome: 'success' }),
      action({ actionType: 'plan_action_message_generated', outcome: 'failed' }),
      action({ actionType: 'export', outcome: 'success' }),
      action({ actionType: 'draft_created', outcome: 'success' }),
    ])
    expect(result['useful_drafts']?.sample).toBe(3)
    expect(result['useful_drafts']?.value).toBeCloseTo(2 / 3, 4)
  })

  it('prend la MÉDIANE du temps de réponse, pas la moyenne', () => {
    // Un seul run de trois minutes déplace une moyenne et fait croire à une
    // lenteur générale.
    const result = indicators([
      action({ durationMs: 1000 }),
      action({ durationMs: 1200 }),
      action({ durationMs: 180_000 }),
    ])
    expect(result['response_time']?.value).toBe(1200)
  })

  it('ignore une durée absente ou aberrante', () => {
    const result = indicators([action({ durationMs: null }), action({ durationMs: -5 }), action({ durationMs: 800 })])
    expect(result['response_time']?.value).toBe(800)
    expect(result['response_time']?.sample).toBe(1)
  })

  it('mesure l’adoption sur les utilisateurs ACTIFS', () => {
    // Rapporter à tous les comptes créés mesurerait l'inscription, pas l'usage.
    const routines = new Map([
      ['u1', 3],
      ['u2', 1],
      ['u3', 5],
    ])
    const result = indicators([action({ userId: 'u1' }), action({ userId: 'u2' })], routines)
    expect(result['proactive_adoption']?.value).toBe(1)
    expect(result['proactive_adoption']?.sample).toBe(2)
  })

  it('mesure les erreurs expliquées sur les seuls échecs', () => {
    const result = indicators([
      action({ outcome: 'failed', errorExplained: true }),
      action({ outcome: 'failed', errorExplained: false }),
      action({ outcome: 'success' }),
    ])
    expect(result['recoverable_errors']?.value).toBe(0.5)
    expect(result['recoverable_errors']?.sample).toBe(2)
  })

  it('porte la cible du rapport à côté de chaque valeur', () => {
    const result = indicators([action()])
    expect(result['verified_execution']?.target).toBe('> 95 %')
    expect(result['hallucination']?.target).toBe('< 1 %')
  })
})
