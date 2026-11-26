import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useHasOfferObjective } from '@/features/profile/hooks/useEsnProfile'
import type { EvaluationViewData } from './evaluationViewData'
import { readDossierRead } from './dossierReadViewData'
import { ScoreSummaryCard } from './ScoreSummaryCard'

vi.mock('@/features/profile/hooks/useEsnProfile', async importOriginal => {
  const actual = await importOriginal<typeof import('@/features/profile/hooks/useEsnProfile')>()
  return { ...actual, useHasOfferObjective: vi.fn() }
})

function mockHasOfferObjective(hasObjective: boolean) {
  vi.mocked(useHasOfferObjective).mockReturnValue(hasObjective)
}

/**
 * #2091 — un axe non évaluable (`weight: null`) entrait SILENCIEUSEMENT à 0
 * dans le total affiché sous le score : « 8/25 » alors qu'un seul axe sur
 * cinq avait manqué (5 points), pas trois. Doctrine `ScoreWithAxes` : un axe
 * non évaluable SORT du dénominateur, et ce qui n'a pas pu être évalué est
 * NOMMÉ.
 */
function data(overrides: Partial<EvaluationViewData> = {}): EvaluationViewData {
  return {
    score: 3.2,
    score25: 8,
    goNoGo: 'PRUDENT',
    justification: 'Justification.',
    recommendation: '',
    quickWins: [],
    risks: [],
    confidence: 60,
    confidenceTier: 'medium',
    commercialScore: null,
    scoreFactors: [],
    qualityCapped: false,
    qualityCapReason: null,
    hasEvaluation: true,
    hasNoGoTrigger: false,
    ...overrides,
  }
}

describe('ScoreSummaryCard — un axe non mesuré ne se fond jamais dans le total (#2091)', () => {
  it('NOMME l’axe non mesuré même sans facteur `total` (run legacy)', () => {
    // Un run legacy (« Legacy runs carry no kind — they are read as axes »,
    // scoreFactors.ts) n'a pas de ligne de total : avant ce lot, rien ne disait
    // qu'un des cinq axes manquait — l'axe se taisait juste, comme les autres.
    render(
      <ScoreSummaryCard
        data={data({
          scoreFactors: [
            { label: 'Budget / investissement visible', proofType: 'signal', weight: 4, kind: 'axis', max: 5 },
            { label: 'Accessibilité commerciale', proofType: 'contact', weight: 2, kind: 'axis', max: 5 },
            {
              label: 'Signal récent — pas assez de données',
              proofType: 'signal',
              weight: null,
              kind: 'axis',
              max: 5,
            },
          ],
        })}
      />,
    )

    expect(screen.getByText('Non évalués : Signal récent — pas assez de données')).toBeInTheDocument()
  })

  it('un total présent mais sans propre max retombe sur le dénominateur des axes MESURÉS (20, pas 25)', () => {
    render(
      <ScoreSummaryCard
        data={data({
          scoreFactors: [
            { label: 'Budget / investissement visible', proofType: 'signal', weight: 4, kind: 'axis', max: 5 },
            { label: 'Accessibilité commerciale', proofType: 'contact', weight: 2, kind: 'axis', max: 5 },
            {
              label: 'Signal récent — pas assez de données',
              proofType: 'signal',
              weight: null,
              kind: 'axis',
              max: 5,
            },
            { label: 'Maturité outsourcing / ESN', proofType: 'source', weight: 3, kind: 'axis', max: 5 },
            { label: "Fit avec l'offre ESN", proofType: 'profile', weight: 3, kind: 'axis', max: 5 },
            { label: 'Verdict — règle', proofType: 'business_rule', weight: null, kind: 'total', max: null },
          ],
        })}
      />,
    )

    // Avant : 4+2+0+3+3 = 12 affiché sur un /25 fixe (hardcodé en absence de
    // `total.max`). Un axe sur cinq (5 pts) n'a pas pu être évalué : le
    // dénominateur mesuré est 20, pas 25.
    expect(screen.queryByText('12 / 25')).not.toBeInTheDocument()
    expect(screen.getByText('12 / 20')).toBeInTheDocument()
    expect(screen.getByText('Non évalués : Signal récent — pas assez de données')).toBeInTheDocument()
  })

  it('ne montre rien de plus quand tous les axes sont mesurés', () => {
    render(
      <ScoreSummaryCard
        data={data({
          scoreFactors: [
            { label: 'Budget', proofType: 'signal', weight: 4, kind: 'axis', max: 5 },
            { label: 'Urgence', proofType: 'signal', weight: 4, kind: 'axis', max: 5 },
          ],
        })}
      />,
    )

    expect(screen.queryByText(/Non évalués/)).not.toBeInTheDocument()
  })
})

describe('ScoreSummaryCard — fiabilité du dossier NON ÉVALUABLE (#2307.19)', () => {
  it('affiche "Non évaluable", jamais un "0/100" qui se lirait comme une confiance faible', () => {
    render(<ScoreSummaryCard data={data({ confidence: 0, confidenceTier: 'non_evaluable' })} />)

    expect(screen.getByText('Non évaluable')).toBeInTheDocument()
    expect(screen.queryByText('0')).not.toBeInTheDocument()
    expect(screen.queryByText('/100')).not.toBeInTheDocument()
    // Distinct de « données faibles » : ce n'est pas un jugement bas, c'est
    // l'absence de matière à juger.
    expect(screen.queryByText('données faibles')).not.toBeInTheDocument()
  })

  it('garde le "/100" numérique pour un tier réellement bas', () => {
    render(<ScoreSummaryCard data={data({ confidence: 12, confidenceTier: 'low' })} />)

    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText('/100')).toBeInTheDocument()
    expect(screen.getByText('données faibles')).toBeInTheDocument()
    expect(screen.queryByText('Non évaluable')).not.toBeInTheDocument()
  })
})

describe('ScoreSummaryCard — le score ne masque JAMAIS une confiance absente (#2307.27, épopée #2789)', () => {
  it('un dossier sans confidence calculée affiche "Non mesurée" à côté du score, jamais rien', () => {
    render(<ScoreSummaryCard data={data({ confidence: null, confidenceTier: null })} />)

    // Avant ce lot : `confidence == null` faisait disparaître TOUT le bloc de
    // fiabilité — le score commercial restait seul à l'écran, exactement le
    // NO-GO de l'épopée (« un score global ne masque jamais les raisons pour
    // lesquelles un périmètre est plus ou moins fiable »).
    expect(screen.getByText('Non mesurée')).toBeInTheDocument()
    expect(screen.getByText(t => t.startsWith('Cette analyse est antérieure'))).toBeInTheDocument()
    // Distinct des deux autres états nommés : ni "0/100" (confiance faible),
    // ni "Non évaluable" (la grille a tourné mais sans matière).
    expect(screen.queryByText('/100')).not.toBeInTheDocument()
    expect(screen.queryByText('Non évaluable')).not.toBeInTheDocument()
    expect(screen.queryByText('données faibles')).not.toBeInTheDocument()
  })

  it('reste muet uniquement quand le score commercial LUI-MÊME est absent', () => {
    // #2091 — un dossier sans AUCUNE évaluation (`hasEvaluation: false`) ne
    // porte pas de score à côté duquel afficher la fiabilité : ce cas reste
    // hors de ce lot, la carte entière se lit alors différemment ailleurs.
    render(<ScoreSummaryCard data={data({ confidence: 60, confidenceTier: 'medium' })} />)
    expect(screen.queryByText('Non mesurée')).not.toBeInTheDocument()
  })
})

// Recette 06/10/2026 (Kiabi, onglet Score) : « ÉCARTER POUR CET OBJECTIF » sous un 5/10 que la Vue d'ensemble dit
// « non arbitré ». Un score posé au palier prudent par la démo (`raw_analysis.score_unarbitrated`) ne décide RIEN :
// le repli GO/NO-GO du /10 ne doit pas parler à sa place.
describe('ScoreSummaryCard — un score non arbitré ne produit jamais un verdict tranché', () => {
  it('dit « non arbitré » au lieu de « ÉCARTER POUR CET OBJECTIF »', () => {
    render(<ScoreSummaryCard data={data({ score: 5, score25: null, goNoGo: 'NO-GO', scoreUnarbitrated: true })} />)
    expect(screen.queryByText('ÉCARTER POUR CET OBJECTIF')).not.toBeInTheDocument()
    expect(screen.getByText('non arbitré')).toBeInTheDocument()
  })

  it('un score arbitré garde son verdict nommé', () => {
    render(<ScoreSummaryCard data={data({ score: 5, score25: null, goNoGo: 'NO-GO' })} />)
    expect(screen.getByText('ÉCARTER POUR CET OBJECTIF')).toBeInTheDocument()
  })
})

// Recette prod 07/10/2026 (#3675 reste, Société Générale, onglet Score) :
// « Score commercial 15/25 RÉSERVE » n'avait ni `title`, ni `aria-describedby`,
// ni infobulle au survol — contrairement à la même donnée affichée ailleurs
// (BellumReadCard, Vue d'ensemble), déjà corrigée. Le score reste un repère
// secondaire EXPLIQUÉ, partout où il s'affiche (GA-26 : même explication, pas
// recalculée deux fois).
describe('ScoreSummaryCard — « Score commercial » porte une explication accessible (#3675)', () => {
  it('le libellé « Score commercial » porte un title ET un aria-describedby vers l’explication', () => {
    render(<ScoreSummaryCard data={data({ score: 1.5, score25: 15, goNoGo: 'PRUDENT' })} />)
    const label = screen.getByText('Score commercial')
    expect(label).toHaveAttribute('title')
    const describedBy = label.getAttribute('aria-describedby')
    expect(describedBy).toBeTruthy()
    expect(document.getElementById(describedBy as string)).not.toBeNull()
  })
})

describe('ScoreSummaryCard — sans objectif renseigné (#3818)', () => {
  it('un STOP sans déclencheur, sans objectif renseigné, ne dit jamais ÉCARTER POUR CET OBJECTIF', () => {
    mockHasOfferObjective(false)
    render(<ScoreSummaryCard data={data({ score: 5, score25: null, goNoGo: 'NO-GO' })} />)
    expect(screen.getByText('ÉVALUATION PERSONNALISÉE INDISPONIBLE — ZÉRO MESURÉ')).toBeInTheDocument()
    expect(screen.queryByText('ÉCARTER POUR CET OBJECTIF')).not.toBeInTheDocument()
  })

  it('objectif renseigné : un STOP sans déclencheur garde ÉCARTER POUR CET OBJECTIF', () => {
    mockHasOfferObjective(true)
    render(<ScoreSummaryCard data={data({ score: 5, score25: null, goNoGo: 'NO-GO' })} />)
    expect(screen.getByText('ÉCARTER POUR CET OBJECTIF')).toBeInTheDocument()
  })
})

// #4016.L9.a (recette prod 14/10, Sanofi) — l'onglet Score affichait « 15/25 »
// (5 axes) SANS jamais dire sur combien d'axes, alors que la Vue d'ensemble le
// dit déjà (`dossierRead.axesEvaluated`, DossierWorthCard). Même doctrine
// (GA-26 : un score n'est jamais nu), tenue ici aussi.
describe('ScoreSummaryCard — le total dit TOUJOURS sur combien d’axes il repose (#4016.L9.a)', () => {
  it('« N axes sur M évalués » sous le total, un axe exclu ne gonfle pas M', () => {
    render(
      <ScoreSummaryCard
        data={data({
          scoreFactors: [
            { label: 'Budget', proofType: 'signal', weight: 4, kind: 'axis', max: 5 },
            { label: 'Accessibilité commerciale', proofType: 'contact', weight: 2, kind: 'axis', max: 5 },
            { label: 'Urgence business', proofType: 'signal', weight: 4, kind: 'axis', max: 5 },
            { label: 'Maturité outsourcing / ESN', proofType: 'source', weight: 3, kind: 'axis', max: 5 },
            { label: 'Sans signal associé', proofType: 'signal', weight: null, kind: 'axis', max: 5 },
            { label: 'Verdict — règle /25', proofType: 'business_rule', weight: 13, kind: 'total', max: 25 },
          ],
        })}
      />,
    )
    expect(screen.getByText('4 axes sur 5 évalués')).toBeInTheDocument()
  })

  it('sans facteur `total` (run legacy), le compte reste affiché', () => {
    render(
      <ScoreSummaryCard
        data={data({
          scoreFactors: [
            { label: 'Budget', proofType: 'signal', weight: 4, kind: 'axis', max: 5 },
            { label: 'Accessibilité commerciale', proofType: 'contact', weight: 2, kind: 'axis', max: 5 },
          ],
        })}
      />,
    )
    expect(screen.getByText('2 axes sur 2 évalués')).toBeInTheDocument()
  })

  it('sans aucun facteur, rien ne se rend (ni total, ni compte d’axes)', () => {
    render(<ScoreSummaryCard data={data({ scoreFactors: [] })} />)
    expect(screen.queryByText(/axes sur/)).not.toBeInTheDocument()
  })
})

// R12 (Thales, 15/10) — « 15/25 » ici, « 22/30 » en Vue d'ensemble : deux scores différents. Celui-ci est
// la grille à 5 critères ; le compte « N axes sur 7 » est celui de la LECTURE DU DOSSIER, et le dit.
describe('ScoreSummaryCard — chaque score porte son nom (échelle du score)', () => {
  it('la note /25 se dit grille à 5 critères, distincte de la lecture du dossier en 7 axes', () => {
    render(<ScoreSummaryCard data={data({ score25: 15 })} />)
    expect(screen.getByText(/5 critères/)).toBeInTheDocument()
    expect(screen.getByText(/lecture du dossier/i)).toBeInTheDocument()
  })

  it('« 6 axes sur 7 évalués » est nommé comme celui de la lecture du dossier', () => {
    const dossierRead = readDossierRead({
      axes: [
        { key: 'adequation_offre', state: 'measured', value: 4 },
        { key: 'potentiel_commercial', state: 'measured', value: 4 },
        { key: 'fraicheur', state: 'measured', value: 3 },
        { key: 'accessibilite', state: 'measured', value: 2 },
        { key: 'concurrence', state: 'measured', value: 2 },
        { key: 'capacite_achat_externe', state: 'measured', value: 3 },
        { key: 'qualite_preuves', state: 'unknown' },
      ],
    })
    render(
      <ScoreSummaryCard
        data={data({
          dossierRead,
          scoreFactors: [{ label: 'Budget', proofType: 'signal', weight: 4, kind: 'axis', max: 5 }],
        })}
      />,
    )
    expect(screen.getByTestId('score-axes-count')).toHaveTextContent('Lecture du dossier : 6 axes sur 7 évalués')
  })
})

// LOIC-FIX2 SCORE OGF (recette 20/10, OGF SERVICES FUNERAIRES, onglet Score).
describe('ScoreSummaryCard — LOIC-FIX2 SCORE OGF', () => {
  const concurrenceDossierRead = readDossierRead({
    axes: [
      { key: 'adequation_offre', state: 'measured', value: 4 },
      { key: 'potentiel_commercial', state: 'measured', value: 4 },
      { key: 'fraicheur', state: 'measured', value: 3 },
      { key: 'accessibilite', state: 'measured', value: 2 },
      { key: 'concurrence', state: 'unknown' },
      { key: 'capacite_achat_externe', state: 'measured', value: 3 },
      { key: 'qualite_preuves', state: 'measured', value: 3 },
    ],
  })
  const factors: EvaluationViewData['scoreFactors'] = [
    { label: 'Fit — problèmes et offres compatibles', proofType: 'profile', weight: 4, kind: 'axis', max: 5 },
    { label: 'Concurrence — incumbents, interne, alternatives', proofType: 'source', weight: 2, kind: 'axis', max: 5 },
    {
      label: 'Verdict PRUDENT — règle des cinq critères',
      proofType: 'business_rule',
      weight: 6,
      kind: 'total',
      max: 25,
    },
  ]

  it('(a) un verdict, un seul mot : la ligne de total reprend le nom du badge, jamais la famille « PRUDENT »', () => {
    mockHasOfferObjective(true)
    render(<ScoreSummaryCard data={data({ scoreFactors: factors })} />)
    const badge = screen.getByText('RÉSERVE')
    expect(badge).toBeInTheDocument()
    expect(screen.queryByText(/Verdict PRUDENT/)).not.toBeInTheDocument()
    expect(screen.getByText(/Verdict RÉSERVE/)).toBeInTheDocument()
  })

  it('(b) un axe que la lecture du dossier range parmi les non mesurés n’a PAS de note, et sort du total', () => {
    render(<ScoreSummaryCard data={data({ dossierRead: concurrenceDossierRead, scoreFactors: factors })} />)
    expect(screen.queryByText('+2 / 5')).not.toBeInTheDocument()
    expect(screen.getByTestId('score-factor-unmeasured')).toHaveTextContent('non mesuré')
    expect(screen.getByTestId('score-axes-unknown')).toHaveTextContent('Concurrence')
    expect(screen.getByText('4 / 5')).toBeInTheDocument()
  })

  it('(b bis) un axe mesuré des deux côtés garde sa note', () => {
    render(<ScoreSummaryCard data={data({ scoreFactors: factors })} />)
    expect(screen.getByText('+2 / 5')).toBeInTheDocument()
  })

  it('(c) le titre « Score du compte » porte le score avec son échelle', () => {
    render(<ScoreSummaryCard data={data({ score25: 8, scoreFactors: factors })} />)
    expect(screen.getByTestId('score-title-value')).toHaveTextContent('8/25')
  })

  it('(c bis) sans score, le titre ne porte aucun chiffre (jamais « 0 »)', () => {
    render(<ScoreSummaryCard data={data({ score: null, score25: null })} />)
    expect(screen.queryByTestId('score-title-value')).not.toBeInTheDocument()
  })
})

// #4991.1 — le score se dit en MOTS ; le détail /25 est dans un repli ; « méthodo sales ESN p25 » disparaît.
describe('ScoreSummaryCard — #4991.1 le score en mots', () => {
  it('dit le verdict en une phrase, sans « méthodo » ni « p25 » visibles', () => {
    mockHasOfferObjective(true)
    const { container } = render(<ScoreSummaryCard data={data({ scoreFactors: [] })} />)
    expect(screen.getByTestId('score-words')).toHaveTextContent(/réserve/i)
    expect(container.textContent).not.toMatch(/méthodo|p25/i)
  })

  it('range le détail en points dans un repli fermé par défaut', () => {
    render(<ScoreSummaryCard data={data({ score25: 8 })} />)
    const detail = screen.getByTestId('score-points-detail')
    expect(detail.tagName).toBe('DETAILS')
    expect(detail).not.toHaveAttribute('open')
    expect(detail).toContainElement(screen.getByTestId('score-title-value'))
  })

  it('un verdict inconnu ne fabrique pas de phrase', () => {
    render(<ScoreSummaryCard data={data({ score: null, score25: null, goNoGo: '' })} />)
    expect(screen.queryByTestId('score-words')).not.toBeInTheDocument()
  })
})
