import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { i18n } from '@/i18n'
import { EmptyEvaluationCard } from './EmptyEvaluationCard'

/**
 * #2502.2 — la Synthèse › Évaluation montrait UNE seule phrase (« Score à
 * compléter ») que l'analyse tourne encore, ait échoué, n'ait jamais eu lieu,
 * ou ait réellement abouti sans rien à recommander. Quatre causes, quatre
 * phrases — jamais les mots de l'une empruntés par une autre, sinon
 * « cassé » et « non mesurable » se lisent pareil (même défaut que
 * `planAbsence`, tome 5).
 */
describe('EmptyEvaluationCard', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it("dit que l'analyse tourne, jamais qu'il manque un score", () => {
    render(<EmptyEvaluationCard absence="analysis-running" />)
    expect(screen.getByText(i18n.t('accountDetail:emptyEvaluation.runningTitle'))).toBeInTheDocument()
    expect(screen.queryByText(i18n.t('accountDetail:emptyEvaluation.title'))).not.toBeInTheDocument()
  })

  it("n'accuse pas le compte quand la dernière analyse a échoué", () => {
    render(<EmptyEvaluationCard absence="analysis-incomplete" />)
    expect(screen.getByText(i18n.t('accountDetail:emptyEvaluation.incompleteTitle'))).toBeInTheDocument()
    expect(screen.queryByText(i18n.t('accountDetail:emptyEvaluation.title'))).not.toBeInTheDocument()
  })

  it("dit qu'un dossier jamais analysé n'a pas encore de score", () => {
    render(<EmptyEvaluationCard absence="not-analyzed" />)
    expect(screen.getByText(i18n.t('accountDetail:emptyEvaluation.notAnalyzedTitle'))).toBeInTheDocument()
    expect(screen.queryByText(i18n.t('accountDetail:emptyEvaluation.title'))).not.toBeInTheDocument()
  })

  it("garde la copie d'origine quand l'analyse a réellement abouti sans rien à recommander", () => {
    render(<EmptyEvaluationCard absence="analysis-complete" />)
    expect(screen.getByText(i18n.t('accountDetail:emptyEvaluation.title'))).toBeInTheDocument()
  })

  it('sans prop, garde le comportement historique (compte analysé sans rien à dire)', () => {
    render(<EmptyEvaluationCard />)
    expect(screen.getByText(i18n.t('accountDetail:emptyEvaluation.title'))).toBeInTheDocument()
  })

  it('les quatre jeux de mots ne se recouvrent pas, dans les deux langues', () => {
    for (const lang of ['fr', 'en'] as const) {
      const catalogue = i18n.getResourceBundle(lang, 'accountDetail').emptyEvaluation as Record<string, string>
      const groups = [
        [catalogue.title, catalogue.description],
        [catalogue.runningTitle, catalogue.runningDescription],
        [catalogue.incompleteTitle, catalogue.incompleteDescription],
        [catalogue.notAnalyzedTitle, catalogue.notAnalyzedDescription],
      ]
      const seen = new Set<string>()
      for (const [title, description] of groups) {
        expect(seen.has(title)).toBe(false)
        seen.add(title)
        expect(title).not.toEqual(description)
      }
    }
  })
})
