import { entityQuestionFor, ENTITY_QUESTION_WAIT_MS, resumePlanAfterEntityPause } from './analysis-entity-pause'

/**
 * #2164.17 — la règle qui décide si un run se met en PAUSE pour poser une
 * question d'identité, et comment il REPREND.
 */
const NOW = new Date('2026-11-01T10:00:00.000Z')

function ambiguousResearch(candidates: Array<{ name: string; siren?: string | null; city?: string | null }>) {
  return {
    entity_resolution: {
      state: 'ambiguous',
      kind: null,
      canonical_id: null,
      commercial_name: 'BPCE',
      legal_name: null,
      country: 'FR',
      identifiers: { siren: '493455042' },
      domain: null,
      naf_code: null,
      naf_label: null,
      location: null,
      parent_names: [],
      children_count: null,
      sources: ['legal_identifier'],
      confidence: 40,
      reasons: [],
      question: { candidates },
      resolved_at: NOW.toISOString(),
    },
  }
}

describe('entityQuestionFor — #2164.17', () => {
  it('pose la question sur une identité ambiguë à deux candidats porteurs d’un SIREN', () => {
    const question = entityQuestionFor(
      ambiguousResearch([
        { name: 'BPCE', siren: '493455042', city: 'Paris' },
        { name: 'BPCE Lease', siren: '332357286' },
      ]),
      NOW,
    )
    expect(question).toEqual({
      candidates: [
        { name: 'BPCE', siren: '493455042', city: 'Paris' },
        { name: 'BPCE Lease', siren: '332357286', city: null },
      ],
      hypothesisSiren: '493455042',
      askedAt: NOW.toISOString(),
      expiresAt: new Date(NOW.getTime() + ENTITY_QUESTION_WAIT_MS).toISOString(),
    })
  })

  it('NON — une identité résolue ne met rien en pause', () => {
    const research = ambiguousResearch([])
    research.entity_resolution.state = 'resolved'
    expect(entityQuestionFor(research, NOW)).toBeNull()
  })

  it('NON — un seul candidat choisissable (l’autre sans SIREN) : pas de question, jamais un choix à un', () => {
    expect(
      entityQuestionFor(
        ambiguousResearch([
          { name: 'BPCE', siren: '493455042' },
          { name: 'BPCE ?', siren: null },
        ]),
        NOW,
      ),
    ).toBeNull()
  })

  it('NON — un blob de recherche illisible ne pose rien', () => {
    expect(entityQuestionFor(undefined, NOW)).toBeNull()
    expect(entityQuestionFor({ entity_resolution: 'x' }, NOW)).toBeNull()
  })
})

describe('resumePlanAfterEntityPause — #2164.17', () => {
  const question = entityQuestionFor(
    ambiguousResearch([
      { name: 'BPCE', siren: '493455042' },
      { name: 'BPCE Lease', siren: '332357286' },
    ]),
    NOW,
  )!

  it('aucune pause passée : le run peut encore se mettre en pause, rien ne change', () => {
    expect(resumePlanAfterEntityPause(undefined, undefined)).toEqual({
      pauseAllowed: true,
      siren: null,
      freshResearch: false,
    })
  })

  it('même entité que l’hypothèse : la recherche déjà faite est gardée', () => {
    expect(resumePlanAfterEntityPause(question, { siren: '493455042', answeredAt: NOW.toISOString() })).toEqual({
      pauseAllowed: false,
      siren: '493455042',
      freshResearch: false,
    })
  })

  it('autre entité : la recherche repart, verrouillée sur le SIREN choisi', () => {
    expect(resumePlanAfterEntityPause(question, { siren: '332357286', answeredAt: NOW.toISOString() })).toEqual({
      pauseAllowed: false,
      siren: '332357286',
      freshResearch: true,
    })
  })

  it('sans réponse avant l’échéance : reprise sur l’hypothèse, plus jamais de pause', () => {
    expect(resumePlanAfterEntityPause(question, undefined)).toEqual({
      pauseAllowed: false,
      siren: null,
      freshResearch: false,
    })
  })
})
