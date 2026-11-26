import { DEMO_DOSSIERS } from './demo-dataset'

/**
 * #3777 — recette démo SNCF 10/10 : l'onglet Plan d'action n'avait NI « Prochains mouvements »
 * NI la note « déjà suivies dans le tableau ». Le composant (`PlanNextMoves`) est monté, mais il
 * rend `null` quand le plan ne porte ni mouvement recommandé, ni route, ni prochaines actions,
 * ni « si silence » : la salle n'en semait aucun. Le plan de SNCF les porte maintenant, et au
 * moins une prochaine action reprend mot pour mot une ligne du tableau (la note « déjà suivies »).
 */
type Rec = Record<string, unknown>
const sncf = DEMO_DOSSIERS.find(d => d.account.company_name === 'SNCF')
const analysis = (sncf?.account as unknown as { raw_analysis?: Rec } | undefined)?.raw_analysis
const plan = analysis?.['plan'] as Rec | undefined

describe('#3777 — le plan SNCF porte ses « Prochains mouvements »', () => {
  it('LIT : le dossier SNCF existe et porte un plan', () => {
    expect(sncf).toBeDefined()
    expect(plan).toBeDefined()
  })

  it('un mouvement d’ouverture recommandé, reconnu par l’écran', () => {
    const movement = plan?.['recommendedMovement'] as Rec | undefined
    expect(['bottom_up', 'middle_out', 'top_down', 'sandwich', 'rang2', 'prospection_inversee', 'public']).toContain(
      movement?.['movement'],
    )
    expect(String(movement?.['rationale'] ?? '').length).toBeGreaterThan(20)
  })

  it('des prochaines actions, chacune avec son libellé et sa raison', () => {
    const actions = (plan?.['nextActions'] ?? []) as Rec[]
    expect(actions.length).toBeGreaterThanOrEqual(2)
    for (const action of actions) {
      expect(String(action['label'] ?? '')).not.toBe('')
      expect(String(action['why'] ?? '')).not.toBe('')
    }
  })

  it('« si silence » est posé (troisième point du premier mouvement)', () => {
    expect(plan?.['ifNoResponse']).toBeDefined()
  })

  it('au moins une prochaine action reprend mot pour mot une ligne du tableau — la note « déjà suivies »', () => {
    const actions = (plan?.['nextActions'] ?? []) as Rec[]
    const board = ((plan?.['action_plan'] as Rec).phases as { actions: { action: string }[] }[]).flatMap(phase =>
      phase.actions.map(a => a.action.trim()),
    )
    expect(actions.filter(a => board.includes(String(a['label']).trim())).length).toBeGreaterThanOrEqual(1)
  })

  it('sait dire NON : toutes les prochaines actions ne sont pas des doublons du tableau', () => {
    const actions = (plan?.['nextActions'] ?? []) as Rec[]
    const board = ((plan?.['action_plan'] as Rec).phases as { actions: { action: string }[] }[]).flatMap(phase =>
      phase.actions.map(a => a.action.trim()),
    )
    expect(actions.some(a => !board.includes(String(a['label']).trim()))).toBe(true)
  })
})
