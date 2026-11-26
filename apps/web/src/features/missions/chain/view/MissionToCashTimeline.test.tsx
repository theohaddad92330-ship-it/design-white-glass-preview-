import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { MissionToCashStage } from '../missionChain'
import { MissionToCashTimeline } from './MissionToCashTimeline'

/**
 * #2421.7 — LA GARDE NO-GO A UN APPELANT RÉEL.
 *
 * `missionToCashNoGo` (missionChain.ts) existait sans jamais être invoqué : une
 * étape incohérente (bloquée sans motif, ouverte sans responsable ni exception,
 * franchie sans preuve) pouvait donc se rendre silencieusement — c'est
 * exactement le NO-GO que l'issue #2421 refuse (« jamais "facturation en
 * cours" sans étape, blocage, responsable ET preuve »). Ce test casse le
 * comportement pour vérifier que le composant DIT l'incohérence au lieu de la
 * taire.
 */

function stage(overrides: Partial<MissionToCashStage> = {}): MissionToCashStage {
  return {
    stage: 'billable_computed',
    step: 'billable',
    state: 'done',
    blocker: null,
    reasonKey: null,
    actionKey: null,
    route: null,
    params: {},
    owner: { rule: 'mission_owner', name: 'Claire Porteur' },
    since: '2026-09-01',
    proof: { key: 'billable', at: '2026-09-02' },
    exception: false,
    ...overrides,
  }
}

describe('#2421.7 — la timeline appelle la garde NO-GO', () => {
  afterEach(() => cleanup())

  it('une étape cohérente ne rend AUCUN avertissement NO-GO', () => {
    render(<MissionToCashTimeline stages={[stage()]} now={new Date('2026-09-10')} />)
    expect(screen.queryByText('Étape incohérente')).not.toBeInTheDocument()
  })

  it('une étape FRANCHIE sans preuve déclenche l’avertissement NO-GO, avec l’étape nommée', () => {
    render(<MissionToCashTimeline stages={[stage({ proof: null })]} now={new Date('2026-09-10')} />)
    expect(screen.getByText('Étape incohérente')).toBeInTheDocument()
    expect(screen.getByText('CA facturable calculé : franchie sans preuve enregistrée.')).toBeInTheDocument()
  })

  it('une étape BLOQUÉE sans motif ni bloqueur déclenche l’avertissement NO-GO', () => {
    render(
      <MissionToCashTimeline
        stages={[stage({ state: 'blocked', blocker: null, reasonKey: null, proof: null, exception: true })]}
        now={new Date('2026-09-10')}
      />,
    )
    expect(screen.getByText('Étape incohérente')).toBeInTheDocument()
    expect(screen.getByText('CA facturable calculé : bloquée sans motif enregistré.')).toBeInTheDocument()
  })
})
