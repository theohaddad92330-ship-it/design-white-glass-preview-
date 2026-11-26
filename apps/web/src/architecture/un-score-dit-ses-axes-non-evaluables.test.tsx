/**
 * ⚠️⚠️ #4016.L9.a revient sur GA-58 et sur le seuil de trois axes (c26),
 * délibérément — Louis 13/10. Le score de COMPTE s'affiche dès DEUX axes
 * évaluables, et il dit TOUJOURS son nombre d'axes (« 2 axes sur 7 évalués ») ;
 * les axes non évaluables restent nommés ; sous deux axes, pas de score (les
 * axes connus restent visibles). Bloc « #4016.L9.a » en fin de fichier : il DIT
 * NON à un score à un axe et à un score nu sans nombre d'axes.
 *
 * ⚠️ #2613 — L'AUTRE MOITIÉ DU RENVERSEMENT, celle qui NE bascule PAS.
 *
 * Décision de Louis du 20/09/2026 : « on affiche pas ce qu'on a pas, on va pas
 * mettre non mesuré et tout ça, ça envoie juste un signal negatif à l'user qui
 * est pas utile. » Portée tranchée le même jour : **partout dans les LISTES,
 * mais un SCORE garde ses axes.**
 *
 * `une-absence-ne-fait-pas-une-ligne.test.ts` tient le côté LISTE : là, une
 * absence ne produit plus aucune ligne. Ce fichier tient l'EXCEPTION, et il la
 * tient en exigeant l'inverse.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI L'EXCEPTION
 * ─────────────────────────────────────────────────────────────────────────
 * Un 45/70 dont on ignore ce qui a pu être pesé se lit comme un 45/70 complet.
 * Le lecteur croit à une mesure entière, compare deux comptes qui n'ont pas été
 * mesurés sur les mêmes axes, et classe sur du vent. Là — et là seulement — le
 * silence MENT, et c'est exactement le défaut que GA-18 / GA-19 ont été écrites
 * pour empêcher.
 *
 * Trois choses restent donc vraies sous un score, et cette garde les tient :
 *  1. les axes NON ÉVALUABLES sont NOMMÉS, pas seulement comptés — « trois axes
 *     non évaluables » n'apprend rien, « disponibilité inconnue, aucune langue
 *     saisie » dit quoi compléter ;
 *  2. un score ABSENT ne fait pas disparaître ses axes — c'est le profil dont
 *     on a le plus besoin de savoir ce qui a manqué ;
 *  3. un axe non évaluable ne vaut JAMAIS zéro : il sort du dénominateur, et le
 *     rendu reste « 45/70 », jamais un pourcentage.
 *
 * Une garde protège une règle, elle ne l'invente pas : le prédicat ci-dessous
 * est cassé sur un COUPABLE FACTICE — un score nu — et on vérifie qu'il le
 * refuse en le NOMMANT.
 */
import { render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { ACCOUNT_SCORE_MIN_EVALUATED_AXES } from '@bellum/contracts'
import { ScoreWithAxes } from '@/components/primitives/ScoreWithAxes'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...rest }: { to: string; children: ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}))

const { DossierWorthCard } = await import('@/features/accounts/view/account-detail/tabs/sections/DossierReadBlocks')
const { readDossierRead } = await import('@/features/accounts/view/account-detail/tabs/evaluation/dossierReadViewData')

/**
 * Le prédicat de la garde : ce rendu ÉNONCE-t-il ses axes non évaluables ?
 *
 * « Énoncer » veut dire nommer chaque axe, en texte visible OU dans l'infobulle
 * — en `compact` (une cellule de tableau) les axes vivent dans le `title`, et
 * exiger du texte visible ferait échouer un rendu parfaitement conforme.
 */
function statesItsUnevaluableAxes(root: HTMLElement, axisLabels: readonly string[]): boolean {
  const text = root.textContent ?? ''
  const titles = [...root.querySelectorAll('[title]')].map(node => node.getAttribute('title') ?? '').join(' | ')
  return axisLabels.every(label => text.includes(label) || titles.includes(label))
}

const AXES = [
  { label: 'Disponibilité', score: null },
  { label: 'Langues', score: null },
  { label: 'Compétences', score: 45 },
]
const NON_EVALUABLES = ['Disponibilité', 'Langues'] as const

describe('#2613 — un SCORE dit toujours ses axes non évaluables', () => {
  it('le score complet NOMME ce qui n’a pas pu être pesé', () => {
    const { container } = render(<ScoreWithAxes score={45} max={70} axes={AXES} />)
    expect(statesItsUnevaluableAxes(container, NON_EVALUABLES)).toBe(true)
    // …et la note reste une note sur son maximum, jamais un pourcentage.
    expect(screen.getByText(/45\/70/)).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/%/)
  })

  it('en cellule de tableau (compact), les axes vivent dans l’infobulle — pas nulle part', () => {
    const { container } = render(<ScoreWithAxes score={45} max={70} axes={AXES} compact />)
    expect(statesItsUnevaluableAxes(container, NON_EVALUABLES)).toBe(true)
  })

  it('un score ABSENT ne fait pas disparaître ses axes', () => {
    const { container } = render(<ScoreWithAxes score={null} max={70} axes={AXES} />)
    expect(statesItsUnevaluableAxes(container, NON_EVALUABLES)).toBe(true)
    // …et l'absence ne se chiffre pas : aucun « 0 » ne remplace la note.
    expect(within(container).queryByText(/\b0\s*\/\s*70\b/)).toBeNull()
  })

  it('un axe non évaluable N’ENTRE PAS dans le dénominateur — le max est celui qu’on passe', () => {
    // Trois axes dont deux non évaluables : la primitive n'invente ni un
    // dénominateur de 3, ni un « 45/105 ». Elle rend le `max` qu'on lui donne.
    const { container } = render(<ScoreWithAxes score={45} max={70} axes={AXES} />)
    expect(container.textContent).toContain('45/70')
    expect(container.textContent).not.toContain('/105')
  })

  /**
   * Le coupable FACTICE du côté SCORE.
   *
   * Sans lui, le prédicat pourrait être vrai pour n'importe quoi — et une garde
   * qui ne sait pas dire NON ne garde rien. Ce composant est exactement ce que
   * #2613 N'AUTORISE PAS : la note, seule, sans un mot sur ce qui a manqué.
   */
  function ScoreNu({ score, max }: { score: number; max: number }) {
    return (
      <span>
        {score}/{max}
      </span>
    )
  }

  it('sait dire NON — un score NU est refusé, et on le nomme', () => {
    const { container } = render(<ScoreNu score={45} max={70} />)
    const manquants = NON_EVALUABLES.filter(label => !statesItsUnevaluableAxes(container, [label]))

    expect(statesItsUnevaluableAxes(container, NON_EVALUABLES)).toBe(false)
    // …et la garde NOMME ce qui manque, au lieu de dire « faux ».
    expect(manquants).toEqual(['Disponibilité', 'Langues'])
  })

  it('sait dire NON — COMPTER les axes ne vaut pas les NOMMER', () => {
    // La faute la plus tentante : « 2 axes non évaluables ». Elle passe pour de
    // la transparence et n'apprend rien — on ne sait pas quoi compléter.
    function ScoreQuiCompte({ score, max, count }: { score: number; max: number; count: number }) {
      return (
        <span>
          {score}/{max} · {count} axes non évaluables
        </span>
      )
    }
    const { container } = render(<ScoreQuiCompte score={45} max={70} count={2} />)
    expect(statesItsUnevaluableAxes(container, NON_EVALUABLES)).toBe(false)
  })
})

/**
 * #4016.L9.a — le prédicat du score de COMPTE : un score affiché DIT-il sur
 * combien d'axes il repose, et ce nombre atteint-il le plancher du contrat ?
 * Rend les fautes NOMMÉES — vide quand le rendu est conforme. Un rendu SANS
 * score (`hasScore` faux) n'a rien à compter.
 */
function accountScoreFaults(root: HTMLElement, hasScore: boolean): string[] {
  if (!hasScore) return []
  const counted = (root.textContent ?? '').match(/(\d+) axes? sur (\d+) évalués?/)
  if (!counted) return ['score nu : aucun nombre d’axes']
  const evaluated = Number(counted[1])
  return evaluated < ACCOUNT_SCORE_MIN_EVALUATED_AXES
    ? [`score à ${evaluated} axe : sous le plancher de ${ACCOUNT_SCORE_MIN_EVALUATED_AXES}`]
    : []
}

/** Un TOTAL de score de dossier à l'écran : « n/m » avec m > 5 (une note
 *  d'axe seule vaut « n/5 »), ou un total sur 5 quand UN axe seul est noté. */
function rendersADossierTotal(root: HTMLElement, onlyAxisValue: string | null): boolean {
  const totals = [...(root.textContent ?? '').matchAll(/(\d+)\/(\d+)/g)].filter(([, , max]) => Number(max) > 5)
  if (totals.length > 0) return true
  return onlyAxisValue !== null && (root.textContent ?? '').split(onlyAxisValue).length - 1 > 1
}

describe('#4016.L9.a — un score de COMPTE dès deux axes, qui dit TOUJOURS son nombre d’axes', () => {
  const DEUX_AXES = [
    { key: 'adequation_offre', state: 'measured', value: 4 },
    { key: 'concurrence', state: 'partial', value: 2 },
  ]

  function lire(raw: unknown) {
    const view = readDossierRead(raw)
    if (!view) throw new Error('la lecture devrait exister')
    return view
  }

  it('deux axes évaluables : un score, son nombre d’axes, et les cinq autres NOMMÉS', () => {
    const { container } = render(<DossierWorthCard read={lire({ axes: DEUX_AXES })} />)
    expect(screen.getByText(/6\/10/)).toBeInTheDocument()
    expect(accountScoreFaults(container, true)).toEqual([])
    expect(screen.getByText(/hors du calcul/)).toHaveTextContent('Qualité des preuves')
  })

  it('un seul axe : PAS de score — mais l’axe connu reste visible', () => {
    const { container } = render(<DossierWorthCard read={lire({ axes: DEUX_AXES.slice(0, 1) })} />)
    expect(rendersADossierTotal(container, '4/5')).toBe(false)
    expect(screen.getByText('4/5')).toBeInTheDocument()
  })

  it('SAIT DIRE NON — un score posé sur UN seul axe est refusé, et on le nomme', () => {
    function ScoreUnAxe() {
      return <span>4/5 · 1 axe sur 7 évalué</span>
    }
    const { container } = render(<ScoreUnAxe />)
    expect(accountScoreFaults(container, true)).toEqual(['score à 1 axe : sous le plancher de 2'])
  })

  it('SAIT DIRE NON — un score de compte nu, sans nombre d’axes, est refusé', () => {
    function ScoreSansNombre() {
      return <span>15/25 · 2 axes non évaluables</span>
    }
    const { container } = render(<ScoreSansNombre />)
    expect(accountScoreFaults(container, true)).toEqual(['score nu : aucun nombre d’axes'])
  })

  it('SAIT DIRE NON — le détecteur de total voit un total, ou une note d’axe répétée comme score', () => {
    const { container } = render(<span>Note 4/5 · 4/5</span>)
    expect(rendersADossierTotal(container, '4/5')).toBe(true)
    const { container: other } = render(<span>6/10</span>)
    expect(rendersADossierTotal(other, null)).toBe(true)
  })
})
