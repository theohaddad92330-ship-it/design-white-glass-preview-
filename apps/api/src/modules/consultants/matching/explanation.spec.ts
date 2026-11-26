import type { MatchNeed, MatchResult } from '@bellum/contracts'
import { MATCH_AXIS_WEIGHTS } from '@bellum/contracts'
import type { MatchRunEntity } from '../../../database/entities/match-run.entity'
import { explanationMarkdown, toExplanation } from './explanation'

const RUN = {
  id: '44444444-4444-4444-8444-444444444444',
  weights: MATCH_AXIS_WEIGHTS,
  threshold: 60,
  created_at: new Date('2026-09-01T10:00:00Z'),
} as MatchRunEntity

const NEED: MatchNeed = {
  needId: '11111111-1111-4111-8111-111111111111',
  role: 'Data Engineer',
  accountName: 'EDF DSI',
  accountSector: 'énergie',
  projectSectors: [],
  skills: [],
  minYears: null,
  seniorityBand: null,
  environment: [],
  languages: [],
  clearances: [],
  location: null,
  remote: null,
  startOn: null,
  targetRateCents: null,
  contractKind: null,
}

const RESULT: MatchResult = {
  consultantId: '22222222-2222-4222-8222-222222222222',
  axes: [
    { axis: 'must_have', score: 84, weight: 25, detail: '2/2 couvertes', evidence: [] },
    { axis: 'language', score: null, weight: 5, detail: 'le besoin ne demande aucune langue', evidence: [] },
  ],
  correspondenceScore: 84,
  pushableScore: 71,
  bucket: 'recommended',
  exclusions: [],
  skills: [],
  gaps: ['databricks (souhaitée) — non prouvé'],
  adjacency: [],
  questionsToValidate: ['niveau réel sur Databricks'],
  flags: [],
}

describe('le document d’explication (BEL-MTC-303)', () => {
  it('porte la date du calcul et la pondération employée', () => {
    const explanation = toExplanation(RUN, NEED, RESULT)
    expect(explanation.runAt).toBe('2026-09-01T10:00:00.000Z')
    expect(explanation.weights.must_have).toBe(23)
    expect(explanation.threshold).toBe(60)
  })

  it('ne contient la donnée d’AUCUN autre candidat', () => {
    const explanation = toExplanation(RUN, NEED, RESULT)
    const serialised = JSON.stringify(explanation)
    expect(serialised).toContain(RESULT.consultantId)
    // Un seul identifiant de personne dans tout le document.
    expect(serialised.match(/consultantId/g)).toHaveLength(1)
  })

  it('écrit « non évaluable » plutôt que zéro', () => {
    const markdown = explanationMarkdown(toExplanation(RUN, NEED, RESULT))
    expect(markdown).toContain('non évaluable')
    // La différence entre « ce point ne vous a pas été reproché » et « vous
    // avez zéro » est toute la raison d'être du document.
    expect(markdown).not.toMatch(/\| Langue \| 5 \| 0\/100/)
  })

  it('dit qu’un système automatisé a produit le classement, et ce qu’il n’a pas lu', () => {
    const markdown = explanationMarkdown(toExplanation(RUN, NEED, RESULT))
    expect(markdown).toContain('système automatisé')
    expect(markdown).toContain('ni le nom')
  })

  it('n’attribue AUCUNE note au profil que le pré-filtrage a écarté avant tout calcul', () => {
    // C'est le document qu'on remet à la personne concernée (art. 86 de l'AI
    // Act) — donc l'endroit où un chiffre inventé coûte le plus cher. Le
    // pré-filtrage écarte AVANT les treize axes et compose `axes: []` avec deux
    // zéros que le contrat impose faute de champ nullable.
    const prefiltered = explanationMarkdown(
      toExplanation(RUN, NEED, {
        ...RESULT,
        axes: [],
        correspondenceScore: 0,
        pushableScore: 0,
        bucket: 'excluded',
        exclusions: [{ reason: 'consent_expired', severity: 'blocking', detail: 'consentement expiré' }],
      }),
    )
    expect(prefiltered).not.toMatch(/Score de (correspondance|poussabilité) : \d+\/100/)
    expect(prefiltered).toContain('Score de correspondance : non mesuré')
    expect(prefiltered).toContain('Score de poussabilité : non mesuré')
    // Le MOTIF, lui, est dû : c'est la seule chose qu'on sache de ce profil, et
    // c'est la réponse à la question que le document pose.
    expect(prefiltered).toContain('consent_expired')
  })

  it('écrit les deux scores quand le profil a bien été noté', () => {
    // Le sens inverse : la règle ne doit pas effacer un score réellement calculé.
    const scored = explanationMarkdown(
      toExplanation(RUN, NEED, {
        ...RESULT,
        axes: [
          { axis: 'must_have', score: 84, weight: 25, detail: '2/2 couvertes', evidence: [] },
          { axis: 'availability', score: 100, weight: 12, detail: 'disponible', evidence: [] },
          { axis: 'seniority', score: 70, weight: 10, detail: 'senior', evidence: [] },
          { axis: 'language', score: null, weight: 5, detail: 'aucune langue demandée', evidence: [] },
        ],
      }),
    )
    expect(scored).toContain('Score de correspondance : 84/100')
    expect(scored).toContain('Score de poussabilité : 71/100')
    expect(scored).not.toContain('Score de correspondance : non mesuré')
  })

  it('reprend les manques et les questions', () => {
    const markdown = explanationMarkdown(toExplanation(RUN, NEED, RESULT))
    expect(markdown).toContain('databricks (souhaitée) — non prouvé')
  })
})
