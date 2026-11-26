import { kpiTarget } from '@bellum/contracts'
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { KpiTargetBadge } from './KpiTargetBadge'

/**
 * La pilule de cible — ce qu'elle promet à l'écran.
 *
 * Trois propriétés, dans l'ordre où elles cassent quand on les oublie :
 *
 *  1. la borne s'affiche avec son SENS (« < 65 j », « > 85 % »), sans quoi le
 *     lecteur devine, et il devine dans le sens qui l'arrange ;
 *  2. une valeur absente n'est pas « hors cible » — c'est le piège central du
 *     lot, et il se trompe dans le BON sens : un DSO inconnu traité comme zéro
 *     serait vert ;
 *  3. une cible de complétude se DIT, parce qu'elle ne parle pas de la même
 *     chose que les autres.
 */
describe('KpiTargetBadge', () => {
  const dso = kpiTarget('dso_days')!
  const bench = kpiTarget('bench_rate')!
  const margin = kpiTarget('gross_margin')!
  const unmeasuredMargin = kpiTarget('unmeasured_margin')!
  const timesheets = kpiTarget('timesheets_on_time')!

  it('lit vraiment des cibles — les cinq existent', () => {
    // Une garde qui rendrait `null` partout passerait au vert sans rien montrer.
    for (const target of [dso, bench, margin, unmeasuredMargin, timesheets]) expect(target).toBeTruthy()
  })

  it('écrit la borne AVEC son sens', () => {
    expect(render(<KpiTargetBadge target={dso} value={32} />).container.textContent).toContain('< 65 j')
    expect(render(<KpiTargetBadge target={timesheets} value={91} />).container.textContent).toContain('> 85 %')
    expect(render(<KpiTargetBadge target={margin} value={31} />).container.textContent).toContain('25 – 40 %')
  })

  it('« non mesuré » n’est jamais « hors cible »', () => {
    // Le test qui porte le lot. Un délai de paiement inconnu affiché comme
    // atteint dirait « on est payé le jour même » — le meilleur résultat
    // possible, sur un espace où l'on ne sait rien.
    const { container } = render(<KpiTargetBadge target={dso} value={null} />)
    expect(container.textContent).toContain('non comparée')
    expect(container.textContent).not.toContain('dans la cible')
    expect(container.textContent).not.toContain('hors cible')
  })

  it('dit de quel côté on est — et la couleur ne s’annonce pas toute seule', () => {
    // Un lecteur d'écran n'entend pas le vert : le verdict est écrit.
    expect(render(<KpiTargetBadge target={dso} value={32} />).container.textContent).toContain('dans la cible')
    expect(render(<KpiTargetBadge target={dso} value={71} />).container.textContent).toContain('hors cible')
    // « Moins est mieux » et « plus est mieux » ne se colorent pas pareil : 4 %
    // d'intercontrat est bon, 4 % de CRA reçus serait catastrophique.
    expect(render(<KpiTargetBadge target={bench} value={4} />).container.textContent).toContain('dans la cible')
    expect(render(<KpiTargetBadge target={timesheets} value={4} />).container.textContent).toContain('hors cible')
  })

  it('nomme les cibles de COMPLÉTUDE, qui ne mesurent pas la performance', () => {
    const { container } = render(<KpiTargetBadge target={unmeasuredMargin} value={6} />)
    expect(container.textContent).toContain('complétude')
    // …et ne le dit pas sur les autres, sans quoi le mot ne distinguerait rien.
    expect(render(<KpiTargetBadge target={dso} value={32} />).container.textContent).not.toContain('complétude')
  })

  it('ne peint jamais en rouge — hors cible est une file de travail, pas une panne', () => {
    const { container } = render(<KpiTargetBadge target={dso} value={71} />)
    const classes = container.firstElementChild?.className ?? ''
    expect(classes).not.toContain('danger')
    expect(classes).toContain('warning')
  })
})
