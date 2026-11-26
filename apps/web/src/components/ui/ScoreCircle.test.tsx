import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ScoreCircle } from './ScoreCircle'

/** jsdom normalises the hex `#EF4444` (ACCOUNT_VERDICT_COLOR['NO-GO']) to rgb. */
const NO_GO_RGB = 'rgb(239, 68, 68)'

/** La géométrie du gabarit `sm` — celui de la liste des comptes. */
const SM_RADIUS = (32 - 2.5 * 2) / 2
const SM_CIRCUMFERENCE = 2 * Math.PI * SM_RADIUS

function renderedOffset(score: number | null): number {
  const { container } = render(<ScoreCircle score={score} size="sm" />)
  const fill = container.querySelector('[data-testid="score-circle-fill"]')
  expect(fill, 'l’arc de remplissage doit exister').not.toBeNull()
  return Number(fill?.getAttribute('stroke-dashoffset'))
}

describe('ScoreCircle — un unscored account is not a rejected one', () => {
  it('renders a measured zero as a red NO-GO — that verdict is real', () => {
    render(<ScoreCircle score={0} />)

    const label = screen.getByText('0')
    expect(label).toBeInTheDocument()
    expect(label.getAttribute('style')).toContain(NO_GO_RGB)
  })

  it('renders a dash, not a zero, when the account has never been scored', () => {
    render(<ScoreCircle score={null} />)

    // The bug: `score={account.priority_score ?? 0}` turned "pas encore
    // analysé" into a red 0/10 NO-GO, while the accounts table showed « - »
    // for the very same account.
    expect(screen.queryByText('0')).not.toBeInTheDocument()
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('does not colour an unscored account with a verdict colour', () => {
    render(<ScoreCircle score={null} />)

    // Ghost grey resolves through a CSS var, which jsdom drops from the
    // serialised inline style — the load-bearing assertion is that the NO-GO
    // red is absent, i.e. no verdict has been asserted.
    expect(screen.getByText('—').getAttribute('style') ?? '').not.toContain(NO_GO_RGB)
  })

  it('an unscored circle is distinguishable from a zero-scored one', () => {
    const unscored = render(<ScoreCircle score={null} />).container.textContent
    const zero = render(<ScoreCircle score={0} />).container.textContent

    expect(unscored).not.toBe(zero)
  })
})

/**
 * La garde qui manquait, et sans laquelle le défaut du 27/08 est reparti pour
 * un tour : rien ne MESURAIT l'arc.
 *
 * Les tests ci-dessus lisaient le chiffre et sa couleur — les deux seules
 * choses qui marchaient en production pendant que la jauge affichait 0 % sur
 * les 25 lignes de `/accounts`. Une garde qui regarde à côté du sujet est verte
 * pour toujours.
 *
 * Ces assertions sont SYNCHRONES, volontairement : elles lisent ce que le DOM
 * vaut à la première peinture, jamais après un `await`. C'est exactement ce que
 * l'ancienne version ne pouvait pas satisfaire — sa valeur n'existait qu'au
 * bout d'une animation de 1,2 s, donc jamais dans un onglet en arrière-plan,
 * dans une capture ou à l'impression.
 */
describe('ScoreCircle — l’arc porte la valeur, pas une animation', () => {
  it('remplit 30 % de l’anneau pour un score de 3', () => {
    expect(renderedOffset(3)).toBeCloseTo(SM_CIRCUMFERENCE * 0.7, 6)
  })

  it('remplit 80 % de l’anneau pour un score de 8 — un autre score, un autre arc', () => {
    expect(renderedOffset(8)).toBeCloseTo(SM_CIRCUMFERENCE * 0.2, 6)
  })

  it('deux scores différents ne peuvent pas dessiner le même arc', () => {
    expect(renderedOffset(3)).not.toBeCloseTo(renderedOffset(8), 3)
  })

  it('laisse l’anneau vide quand le compte n’a jamais été noté', () => {
    expect(renderedOffset(null)).toBeCloseTo(SM_CIRCUMFERENCE, 6)
  })

  it('un zéro MESURÉ laisse aussi l’anneau vide — le chiffre et la couleur les distinguent', () => {
    expect(renderedOffset(0)).toBeCloseTo(SM_CIRCUMFERENCE, 6)
  })
})

describe('ScoreCircle — un score n’est jamais nu', () => {
  it('porte son échelle dans son nom accessible', () => {
    render(<ScoreCircle score={4} size="sm" />)

    // « 4 » seul, à côté d'un « 14/25 » et d'un « 83/100 » sur la fiche du même
    // compte, ne dit pas sur quelle échelle on lit.
    expect(screen.getByRole('img', { name: /4\/10/ })).toBeInTheDocument()
  })

  it('dit « non mesuré » plutôt que d’annoncer une note absente', () => {
    render(<ScoreCircle score={null} size="sm" />)

    expect(screen.getByRole('img', { name: /non mesuré/i })).toBeInTheDocument()
  })
})
