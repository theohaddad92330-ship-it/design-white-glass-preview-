import { FOCUS_STALE_DAYS, SPRINT_LANE_LEVELS } from '@bellum/contracts'
import { DEMO_ACTIVITIES, DEMO_DOSSIERS } from './demo-dataset'

/**
 * #3262.24 (épopée #3284) — la carte « sans mouvement » de la bande de
 * décision de /pilotage est masquée à 0 : sans un compte de la file EXÉCUTION
 * réellement silencieux dans le jeu, la salle ne la voit jamais (recette prod
 * du 30/09). Même définition que `PilotageService.reviewSignals` : file
 * exécution, dernière activité plus vieille que `FOCUS_STALE_DAYS`.
 */
describe('démo — un compte actif sans mouvement (carte de pilotage)', () => {
  const execution = SPRINT_LANE_LEVELS.execution as readonly string[]

  const lastTouchDays = (company: string): number | null => {
    const days = DEMO_ACTIVITIES.filter(a => a.company === company).map(a => a.daysAgo)
    return days.length === 0 ? null : Math.min(...days)
  }

  const silent = DEMO_DOSSIERS.filter(d => {
    if (!execution.includes(d.account.sprint ?? '')) return false
    const last = lastTouchDays(d.account.company_name)
    return last === null || last > FOCUS_STALE_DAYS
  })

  it('au moins un compte de la file exécution est sans mouvement', () => {
    expect(silent.length).toBeGreaterThanOrEqual(1)
  })

  it('#3509 — UN SEUL : ENGIE (extension, aucun échange journalisé). Un compte sans aucune activité compte aussi, il ne doit pas traîner', () => {
    expect(silent.map(d => d.account.company_name)).toEqual(['ENGIE'])
  })

  it('mais pas tous : l’autre compte exécution reste actif (la carte ne compte pas tout le monde)', () => {
    const inExecution = DEMO_DOSSIERS.filter(d => execution.includes(d.account.sprint ?? ''))
    expect(silent.length).toBeLessThan(inExecution.length)
  })
})
