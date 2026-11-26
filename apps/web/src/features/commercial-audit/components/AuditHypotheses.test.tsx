import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { auditHypothesesFrom, type AuditContradiction } from '@bellum/contracts'
import { AuditHypotheses } from './AuditHypotheses'

/**
 * #2010.10 — RELIRE LES HYPOTHÈSES.
 *
 * Ces tests disent NON à deux choses : à un bloc rempli quand aucune
 * contradiction ne porte d'hypothèse, et à une hypothèse rendue SANS la
 * question qui la vérifierait quand la rupture en nomme une — la question
 * qui distingue une hypothèse d'une affirmation déguisée.
 */
function contradiction(overrides: Partial<AuditContradiction> = {}): AuditContradiction {
  return {
    ruleId: 'tooManySimultaneousMarkets',
    facts: [],
    tension: 'Quatre secteurs visés pour une personne à temps partiel.',
    possibleExplanation: null,
    questionToValidate: null,
    consequenceIfUnaddressed: null,
    recommendation: 'Geler deux secteurs jusqu’à la fin du trimestre.',
    indicator: 'Nombre de secteurs réellement travaillés',
    confidence: 'single_source',
    ...overrides,
  }
}

describe('AuditHypotheses — #2010.10', () => {
  it('NOMME l’absence quand aucune contradiction ne porte d’hypothèse', () => {
    render(<AuditHypotheses hypotheses={auditHypothesesFrom([contradiction()])} />)
    expect(screen.getByText(/Aucune hypothèse/)).toBeInTheDocument()
    expect(screen.queryByTestId('audit-hypothesis')).not.toBeInTheDocument()
  })

  it('rend la règle, l’hypothèse et la question à valider', () => {
    const hypotheses = auditHypothesesFrom([
      contradiction({
        ruleId: 'objectivesAboveCapacity',
        possibleExplanation: 'L’objectif a peut-être été fixé avant la réduction de l’équipe commerciale.',
        questionToValidate: 'L’objectif a-t-il été révisé depuis le départ du deuxième commercial ?',
      }),
    ])
    render(<AuditHypotheses hypotheses={hypotheses} />)
    expect(screen.getByText('Objectifs supérieurs à la capacité')).toBeInTheDocument()
    expect(screen.getByText(/objectif a peut-être été fixé avant la réduction/)).toBeInTheDocument()
    expect(screen.getByText(/révisé depuis le départ du deuxième commercial/)).toBeInTheDocument()
  })

  it('n’affiche AUCUNE ligne de question quand la rupture n’en nomme pas', () => {
    const hypotheses = auditHypothesesFrom([
      contradiction({ possibleExplanation: 'Peut-être une saisie ancienne.', questionToValidate: null }),
    ])
    render(<AuditHypotheses hypotheses={hypotheses} />)
    expect(screen.queryByTestId('audit-hypothesis-question')).not.toBeInTheDocument()
  })

  it('rend une hypothèse par contradiction qui en porte une, jamais pour celles qui n’en portent pas', () => {
    const hypotheses = auditHypothesesFrom([
      contradiction({ ruleId: 'tooManySimultaneousMarkets', possibleExplanation: null }),
      contradiction({ ruleId: 'offerWithoutProof', possibleExplanation: 'Jamais demandée par un client.' }),
    ])
    render(<AuditHypotheses hypotheses={hypotheses} />)
    expect(screen.getAllByTestId('audit-hypothesis')).toHaveLength(1)
  })
})
