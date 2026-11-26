/**
 * ⚠️ #2613 — CE FICHIER A BASCULÉ. Décision de Louis du 20/09/2026 :
 * « on affiche pas ce qu'on a pas, on va pas mettre non mesuré et tout ça,
 * ça envoie juste un signal négatif à l'user qui est pas utile. »
 *
 * Portée tranchée le même jour : **partout dans les LISTES, mais un SCORE
 * garde ses axes.** La confiance dans la donnée est une ligne de CARTE dans
 * la liste Découvrir — donc côté LISTE : quand elle n'a pas été mesurée, le
 * bloc entier ne rend RIEN. Le test ci-dessous, qui exigeait « NOMME
 * l'absence », a été RETOURNÉ : il exige maintenant le silence.
 *
 * ⚠️ CE QUI TIENT ENCORE, et qu'on ne rouvre pas :
 *  - une valeur absente ne devient JAMAIS « 0 » (GA-19) — ici le bloc
 *    disparaît, il n'écrit pas « 0/100 » ;
 *  - un axe non évaluable reste HORS du dénominateur ;
 *  - sous un SCORE, l'énoncé des axes non évaluables RESTE nommé
 *    (`ScoreWithAxes`, GA-18) — un 45/70 muet sur ce qui n'a pas pu être
 *    pesé se lirait comme un 45/70 complet, et là le silence ment.
 *
 * Si tu lis ceci en croyant à une régression : ce n'en est pas une, c'est le
 * renversement. Ne le « répare » pas.
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { DiscoverCandidate } from '@/features/discover/lib/discover-types'
import { CandidateConfidence } from './CandidateConfidence'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options && 'count' in options
        ? `${key}:${options.count}`
        : options && 'score' in options
          ? `${key}:${options.score}`
          : key,
  }),
}))

function candidate(overrides: Partial<DiscoverCandidate> = {}): DiscoverCandidate {
  return {
    name: 'Alpha',
    siren: '552100554',
    nafCode: null,
    sector: null,
    city: null,
    department: null,
    headcountRange: null,
    creationDate: null,
    score: null,
    scoreMax: null,
    scoreUnmeasured: [],
    scoreFactors: [],
    signals: [],
    dataConfidence: null,
    angle: null,
    suggestedRoles: [],
    portfolioState: 'none',
    accountId: null,
    sources: [],
    ...overrides,
  } as DiscoverCandidate
}

/** #2166.12 — la confiance se LIT à l'écran, et une absence ne devient pas zéro. */
describe('CandidateConfidence', () => {
  // X37 / #3551 — la confiance s'exprime en MOT (haute / moyenne / faible), jamais
  // en « /100 » : à côté de l'intérêt « 45/100 » sur la même carte, deux nombres
  // sur la même échelle se confondent.
  it('exprime la confiance en mot, jamais en nombre sur 100', () => {
    render(<CandidateConfidence candidate={candidate({ dataConfidence: 72 })} />)
    const score = screen.getByTestId('candidate-confidence-score')
    expect(score.textContent).toMatch(/^confidence\.level\.(low|medium|high)$/)
    expect(score.textContent).not.toMatch(/\d/)
  })

  // #2613 — une confiance non mesurée ne produit AUCUNE ligne : ni le titre,
  // ni « non mesurée ». On affiche ce qu'on sait.
  it('ne rend RIEN quand la confiance n’a pas été mesurée', () => {
    const { container } = render(<CandidateConfidence candidate={candidate({ dataConfidence: null })} />)
    expect(screen.queryByTestId('candidate-confidence')).not.toBeInTheDocument()
    expect(screen.queryByTestId('candidate-confidence-unmeasured')).not.toBeInTheDocument()
    expect(screen.queryByTestId('candidate-confidence-score')).not.toBeInTheDocument()
    // …et surtout pas « 0 » à la place : le silence, pas un zéro (GA-19 tient).
    expect(container).toBeEmptyDOMElement()
  })

  it('ne montre pas le chiffre NU : il dit ce sur quoi il repose, compté et nommé', () => {
    render(
      <CandidateConfidence
        candidate={candidate({
          dataConfidence: 72,
          city: 'Lyon',
          sector: 'industry',
          signals: [{ type: 'hiring', label: 'Recrute', date: '2026-09-01' }],
          scoreFactors: [{ label: 'NAF', points: 10, evidence: '6201Z' }],
        })}
      />,
    )
    const facts = screen.getByTestId('candidate-confidence-facts')
    expect(facts).toHaveTextContent('confidence.facts.signals:1')
    expect(facts).toHaveTextContent('confidence.facts.registry:2')
    expect(facts).toHaveTextContent('confidence.facts.evidence:1')
  })

  it('n’écrit AUCUN fait à zéro — une ligne « 0 signal daté » se lirait comme un reproche', () => {
    render(<CandidateConfidence candidate={candidate({ dataConfidence: 20 })} />)
    expect(screen.queryByTestId('candidate-confidence-facts')).not.toBeInTheDocument()
  })
})
