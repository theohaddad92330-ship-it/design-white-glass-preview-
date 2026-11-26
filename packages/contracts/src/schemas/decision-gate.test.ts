import { describe, expect, it } from 'vitest'
import {
  DECISION_GATES,
  gateCrossingProblems,
  gateCrossingSchema,
  IRREVERSIBLE_GATES,
  reasonRequired,
  type GateCrossing,
} from './decision-gate.js'

const crossing = (over: Partial<GateCrossing> = {}): GateCrossing =>
  gateCrossingSchema.parse({
    gate: 'account_priority',
    decision: 'accept',
    subject: 'account',
    subjectId: '11111111-1111-4111-8111-111111111111',
    missing: [],
    ...over,
  })

describe('portes de décision — le motif exigé', () => {
  it('exige un motif sur tout refus, quelle que soit la porte', () => {
    for (const gate of DECISION_GATES) {
      expect(reasonRequired(gate, 'refuse')).toBe(true)
    }
  })

  it('exige un motif sur tout franchissement forcé', () => {
    for (const gate of DECISION_GATES) {
      expect(reasonRequired(gate, 'force')).toBe(true)
    }
  })

  it('n’exige AUCUN motif pour prioriser un compte — un geste hebdomadaire assorti d’un formulaire se contourne', () => {
    expect(reasonRequired('account_priority', 'accept')).toBe(false)
    expect(reasonRequired('contact_qualification', 'accept')).toBe(false)
  })

  it('exige un motif même sur un accord, quand la porte est irréversible', () => {
    for (const gate of IRREVERSIBLE_GATES) {
      expect(reasonRequired(gate, 'accept')).toBe(true)
    }
  })
})

describe('portes de décision — ce qui empêche d’enregistrer', () => {
  it('refuse un refus sans motif', () => {
    expect(gateCrossingProblems(crossing({ decision: 'refuse' }))).toEqual(['Cette décision demande son motif.'])
  })

  it('refuse un motif fait d’espaces — un blanc n’est pas une raison', () => {
    expect(gateCrossingProblems(crossing({ decision: 'refuse', reason: '   ' }))).toHaveLength(1)
  })

  it('accepte un refus motivé', () => {
    expect(gateCrossingProblems(crossing({ decision: 'refuse', reason: 'Hors de notre secteur' }))).toEqual([])
  })

  it('refuse un franchissement forcé qui ne nomme aucun manque — sinon c’est un accord ordinaire', () => {
    const problems = gateCrossingProblems(crossing({ decision: 'force', reason: 'On y va quand même' }))
    expect(problems).toEqual(['Forcer une porte demande de nommer ce qui manquait.'])
  })

  it('journalise les trois manques d’un franchissement forcé', () => {
    const forced = crossing({
      gate: 'project_close',
      subject: 'project',
      decision: 'force',
      reason: 'Le client a signé ailleurs',
      missing: ['budget inconnu', 'aucun décideur identifié', 'pas de date de décision'],
    })

    expect(gateCrossingProblems(forced)).toEqual([])
    expect(forced.missing).toHaveLength(3)
  })

  it('laisse passer un accord ordinaire sans motif ni manque', () => {
    expect(gateCrossingProblems(crossing())).toEqual([])
  })

  it('n’invente aucun manque : la liste par défaut est vide, pas absente', () => {
    // « Rien ne manquait » et « on n'a pas regardé » ne doivent pas se lire
    // pareil ; le champ existe toujours, et il vaut `[]`.
    expect(crossing().missing).toEqual([])
  })

  it('borne le nombre de manques — une liste de cent lignes n’est plus une décision, c’est un rapport', () => {
    const tooMany = { ...crossing(), missing: Array.from({ length: 21 }, (_, i) => `manque ${i}`) }
    expect(gateCrossingSchema.safeParse(tooMany).success).toBe(false)
  })
})
