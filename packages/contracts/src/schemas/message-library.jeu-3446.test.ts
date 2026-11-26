import { describe, expect, it } from 'vitest'
import {
  evaluateReadiness,
  MESSAGE_LIBRARY_CLAIM_KINDS,
  renderVerbatim,
  selectApprovedTemplate,
  type MessageLibraryEntry,
} from './message-library.js'
import {
  minDelayBeforeStep,
  OUTREACH_PERSONAS,
  OUTREACH_SCENARIOS,
  scenarioForRelationship,
  type OutreachPersona,
  type OutreachScenarioId,
} from './outreach-scenarios.js'
import { outreachReplyEffect, OUTREACH_REPLY_CLASSES } from './outreach-sequence-events.js'

/**
 * #3446 — le jeu de tests des exemples approuvés, rejoué sur le moteur RÉEL
 * (`message-library.ts` + registre des scénarios), un bloc par test du corps de
 * l'issue. Aucun texte inventé : les entrées sont des fixtures neutres, les
 * règles sont celles du code.
 */

function entry(overrides: Partial<MessageLibraryEntry> = {}): MessageLibraryEntry {
  return {
    id: 'ml-x',
    title: 'M1',
    text: 'Bonjour {{Prenom}},\n\nJe regarde {{domaine}} chez {{Entreprise}}.\n\nUne question : où en êtes-vous ?',
    origin: 'fixture',
    sourceDocument: 'fixture',
    version: 1,
    date: '2026-10-01T00:00:00.000Z',
    channel: 'linkedin_draft',
    scenarioId: 'cold_approach',
    persona: 'decideur',
    decisionRole: 'decideur',
    stage: 'premier_contact',
    route: 'r',
    objective: 'o',
    expectedVariables: ['Prenom', 'domaine', 'Entreprise'],
    mandatoryFacts: [],
    claims: [],
    status: 'approuve',
    mode: 'verbatim',
    usageConstraints: [],
    ...overrides,
  }
}

const VARS = { Prenom: 'Camille', domaine: 'la donnée', Entreprise: 'Acme' }

describe('#3446 test 1 — mode verbatim', () => {
  it('le texte rendu est identique : retirer les valeurs des variables redonne le modèle, rien n’est ajouté', () => {
    const e = entry()
    const out = renderVerbatim(e, VARS)
    if (!out.ok) throw new Error('rendu attendu')
    const back = Object.entries(VARS).reduce((acc, [k, v]) => acc.split(v).join(`{{${k}}}`), out.text)
    expect(back).toBe(e.text)
    expect(out.text.split('\n\n')).toHaveLength(e.text.split('\n\n').length)
  })

  it('seules les variables autorisées changent : une variable hors liste n’est jamais substituée', () => {
    const e = entry({ text: 'Bonjour {{Prenom}}, voici {{Surprise}}.', expectedVariables: ['Prenom'] })
    const out = renderVerbatim(e, { Prenom: 'Camille', Surprise: 'un bonus' })
    if (!out.ok) throw new Error('rendu attendu')
    expect(out.text).toBe('Bonjour Camille, voici {{Surprise}}.')
  })
})

describe('#3446 test 2 — variables absentes', () => {
  it('une variable obligatoire manquante : pas de texte « prêt », la variable est NOMMÉE', () => {
    const out = renderVerbatim(entry(), { Prenom: 'Camille', Entreprise: 'Acme' })
    expect(out.ok).toBe(false)
    if (out.ok) return
    expect(out.missingVariables).toEqual(['domaine'])
  })

  it('une valeur blanche compte comme absente', () => {
    const out = renderVerbatim(entry(), { ...VARS, Prenom: '   ' })
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.missingVariables).toEqual(['Prenom'])
  })
})

describe('#3446 test 3 — fait non vérifié : le texte ne sort pas', () => {
  it.each(MESSAGE_LIBRARY_CLAIM_KINDS)('une affirmation « %s » sans preuve bloque le rendu', kind => {
    const e = entry({ claims: [{ kind, statement: 'x', verifiedFactId: null }] })
    expect(evaluateReadiness(e).ready).toBe(false)
    const out = renderVerbatim(e, VARS)
    expect(out.ok).toBe(false)
    // Aucun texte de repli n’est fabriqué.
    expect('text' in out).toBe(false)
  })

  it('la même affirmation, une fois soutenue par une donnée réelle, débloque', () => {
    const e = entry({ claims: [{ kind: 'client', statement: 'x', verifiedFactId: 'fact-1' }] })
    expect(renderVerbatim(e, VARS).ok).toBe(true)
  })

  it('un modèle bloqué n’est jamais sélectionné et la raison est tracée', () => {
    const e = entry({ claims: [{ kind: 'delai', statement: 'x', verifiedFactId: null }] })
    const trace = selectApprovedTemplate([e], {
      channel: 'linkedin_draft',
      scenarioId: 'cold_approach',
      persona: 'decideur',
    })
    expect(trace.selectedId).toBeNull()
    expect(trace.rejected[0]?.reason).toContain('affirmation non soutenue')
  })
})

describe('#3446 test 4 — bon scénario', () => {
  const states: [string, OutreachScenarioId][] = [
    ['dormant', 'dormant_connection'],
    ['ancien_client', 'dormant_connection'],
    ['refere', 'referred_contact'],
    ['linkedin', 'accepted_connection'],
    ['froid', 'cold_approach'],
  ]
  it.each(states)('l’état de relation « %s » route vers %s', (state, expected) => {
    expect(scenarioForRelationship(state)?.id).toBe(expected)
  })

  it('une connexion dormante ne reçoit jamais la séquence froide, un recommandé n’est jamais inconnu', () => {
    for (const state of ['dormant', 'ancien_client', 'refere']) {
      expect(scenarioForRelationship(state)?.id).not.toBe('cold_approach')
    }
  })

  it('un état non couvert ne force aucun scénario', () => {
    expect(scenarioForRelationship('client_actif')).toBeNull()
  })

  const personas: [OutreachPersona, OutreachPersona][] = [
    ['operationnel', 'decideur'],
    ['acheteur', 'expert'],
    ['decideur', 'operationnel'],
  ]
  it.each(personas)('un modèle écrit pour « %s » n’est jamais servi à « %s »', (written, requested) => {
    const e = entry({ persona: written })
    const trace = selectApprovedTemplate([e], {
      channel: 'linkedin_draft',
      scenarioId: 'cold_approach',
      persona: requested,
    })
    expect(trace.selectedId).toBeNull()
  })

  it('un modèle de scénario dormant n’est pas servi à une approche froide', () => {
    const e = entry({ scenarioId: 'dormant_connection' })
    const trace = selectApprovedTemplate([e], {
      channel: 'linkedin_draft',
      scenarioId: 'cold_approach',
      persona: 'decideur',
    })
    expect(trace.selectedId).toBeNull()
  })

  it('chaque persona a ses propres modèles : aucun n’est servi à un autre', () => {
    for (const written of OUTREACH_PERSONAS) {
      for (const requested of OUTREACH_PERSONAS.filter(p => p !== written)) {
        const trace = selectApprovedTemplate([entry({ persona: written })], {
          channel: 'linkedin_draft',
          scenarioId: 'cold_approach',
          persona: requested,
        })
        expect(trace.selectedId).toBeNull()
      }
    }
  })
})

describe('#3446 test 5 — cohérence de séquence', () => {
  it.each(Object.values(OUTREACH_SCENARIOS))(
    '$id : M1 le jour même, aucun M2/M3 avant le délai configuré',
    scenario => {
      expect(minDelayBeforeStep(scenario, 0)).toBe(0)
      for (let i = 1; i < scenario.maxSteps; i++) {
        expect(minDelayBeforeStep(scenario, i)).toBeGreaterThan(0)
        expect(minDelayBeforeStep(scenario, i)).toBe(scenario.minDelayDays[i])
      }
      expect(scenario.stopOnReply).toBe(true)
      expect(scenario.maxSteps).toBe(3)
    },
  )

  it('une réponse ou un refus arrête la suite, jamais une relance de plus', () => {
    for (const cls of OUTREACH_REPLY_CLASSES.filter(c => c !== 'out_of_office' && c !== 'unknown' && c !== 'not_now')) {
      expect(outreachReplyEffect(cls).action).toBe('stop')
    }
    expect(outreachReplyEffect('refusal')).toMatchObject({ action: 'stop', event: 'refusal' })
  })

  it('un message n’est pas relancé après l’absence ambiguë : pause réversible, pas un envoi', () => {
    expect(outreachReplyEffect('unknown').action).toBe('pause')
    expect(outreachReplyEffect('out_of_office').action).toBe('pause')
  })
})
