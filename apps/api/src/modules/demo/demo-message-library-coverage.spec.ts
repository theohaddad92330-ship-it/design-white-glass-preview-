import { createMessageLibraryEntrySchema, evaluateReadiness, selectApprovedTemplate } from '@bellum/contracts'
import { ALL_IMPORTED_SEQUENCES } from '../message-library/message-library.seed-data'
import { DEMO_MESSAGE_LIBRARY_ENTRIES } from './demo-dataset'
import { DEMO_INTENTIONALLY_EMPTY, DEMO_SEEDED_TABLES } from './demo-coverage'

// #3427 — l'onglet « Bibliothèque » ne se découvre pas vide en réunion.
describe('#3427 — la bibliothèque d’exemples est seedée en démo', () => {
  it('la table est classée « seedée », plus « vide à dessein »', () => {
    expect(DEMO_SEEDED_TABLES).toContain('message_library_entries')
    expect(Object.keys(DEMO_INTENTIONALLY_EMPTY)).not.toContain('message_library_entries')
  })

  it('chaque exemple fictif respecte le contrat de création', () => {
    const invalid: string[] = []
    for (const entry of DEMO_MESSAGE_LIBRARY_ENTRIES) {
      const variables = Array.from(new Set([...entry.body.matchAll(/\{\{([^}]+)\}\}/g)].map(m => m[1])))
      const parsed = createMessageLibraryEntrySchema.safeParse({
        ...entry,
        text: entry.body,
        origin: 'Démonstration',
        sourceDocument: 'Exemple de démonstration',
        version: 1,
        date: new Date().toISOString(),
        expectedVariables: variables,
      })
      if (!parsed.success) invalid.push(entry.title)
    }
    expect(invalid).toEqual([])
  })

  it('montre les deux états : un exemple activable et un exemple à revoir, raison nommée', () => {
    const statuses = DEMO_MESSAGE_LIBRARY_ENTRIES.map(entry => entry.status)
    expect(statuses).toContain('approuve')
    expect(statuses).toContain('a_revoir')
    const unverified = DEMO_MESSAGE_LIBRARY_ENTRIES.find(entry => entry.status === 'a_revoir')
    expect(unverified?.claims.some(claim => claim.verifiedFactId === null)).toBe(true)
    expect(typeof evaluateReadiness).toBe('function')
  })

  // #3439.1 — le mécanisme de confirmation se montre en démo : un exemple dont
  // une partie des faits obligatoires est confirmée, le reste NOMMÉ.
  it('montre un exemple aux faits obligatoires confirmés en partie, le reste nommé', () => {
    const partial = DEMO_MESSAGE_LIBRARY_ENTRIES.find(
      entry => entry.mandatoryFacts.length > 0 && entry.confirmedFacts.length > 0,
    )
    expect(partial).toBeDefined()
    if (!partial) return
    expect(partial.confirmedFacts.every(fact => partial.mandatoryFacts.includes(fact))).toBe(true)
    const readiness = evaluateReadiness({
      id: 'demo',
      title: partial.title,
      text: partial.body,
      origin: 'Démonstration',
      sourceDocument: 'Exemple de démonstration',
      version: 1,
      date: new Date().toISOString(),
      channel: partial.channel,
      scenarioId: partial.scenarioId,
      persona: partial.persona as never,
      decisionRole: partial.decisionRole,
      stage: partial.stage,
      route: partial.route,
      objective: partial.objective,
      expectedVariables: [],
      mandatoryFacts: [...partial.mandatoryFacts],
      factConfirmations: partial.confirmedFacts.map(fact => ({
        fact,
        confirmedBy: 'demo',
        confirmedAt: new Date().toISOString(),
      })),
      claims: [],
      status: partial.status,
      mode: partial.mode,
      usageConstraints: [],
    })
    expect(readiness.ready).toBe(false)
    if (!readiness.ready) expect(readiness.reason).toContain('Relation avec le référent documentée.')
  })

  // #3437 / #3438 / #3440 — les séquences livrées sont aussi dans la démo, et Laura les y sert.
  it('les séquences livrées respectent le contrat de création et portent leur étape', () => {
    const invalid = ALL_IMPORTED_SEQUENCES.filter(
      ({ slug: _slug, ...entry }) => !createMessageLibraryEntrySchema.safeParse(entry).success,
    ).map(entry => entry.title)
    expect(invalid).toEqual([])
    expect(ALL_IMPORTED_SEQUENCES.every(entry => entry.step)).toBe(true)
  })

  it('en démo, « invitation acceptée » d’un décideur rend l’ouverture M1 approuvée, M2 est écarté avec sa raison', () => {
    const rows = ALL_IMPORTED_SEQUENCES.map(({ slug, ...entry }) => ({ ...entry, id: slug }))
    const criteria = { channel: 'linkedin_draft', scenarioId: 'accepted_connection', persona: 'decideur' } as const
    expect(selectApprovedTemplate(rows, criteria).selectedId).toBe('c19-3437-m1-decideur')
    const m2 = selectApprovedTemplate(rows, { ...criteria, step: 'M2' })
    expect(m2.selectedId).toBeNull()
    expect(m2.rejected[0]?.reason).toMatch(/affirmation non soutenue/)
  })
})
