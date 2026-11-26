import { describe, expect, it } from 'vitest'
import { visibleMissionRisks } from './account-missions'

/**
 * #2124.24 — les risques d'une mission active, visibles depuis le dossier
 * compte, SANS refaire le calcul canonique (`missionRisks`, mission.ts) qui
 * exige `loadedDailyCostCents` et des relevés d'activité — deux données
 * qu'`ActiveMissionRow` ne porte pas sur le fil. Cette fonction compose les
 * deux signaux DÉJÀ envoyés (`renewal`, `marginPercent`), sans redéfinir de
 * seuil ni de calcul.
 */
describe('visibleMissionRisks (#2124.24)', () => {
  it('sans date de fin connue → no_end_date', () => {
    expect(visibleMissionRisks({ status: 'active', renewal: 'unknown', marginPercent: 20 }, true)).toEqual([
      'no_end_date',
    ])
  })

  it('fenêtre actionnable (j30) → renewal_not_started', () => {
    expect(visibleMissionRisks({ status: 'active', renewal: 'j30', marginPercent: 20 }, true)).toEqual([
      'renewal_not_started',
    ])
  })

  it('loin de l’échéance et marge saine → aucun risque, jamais un tableau muet transformé en 0', () => {
    expect(visibleMissionRisks({ status: 'active', renewal: 'far', marginPercent: 20 }, true)).toEqual([])
  })

  it('marge nulle ou négative, avec le droit → margin_at_risk', () => {
    expect(visibleMissionRisks({ status: 'active', renewal: 'far', marginPercent: 0 }, true)).toEqual([
      'margin_at_risk',
    ])
    expect(visibleMissionRisks({ status: 'active', renewal: 'far', marginPercent: -3 }, true)).toEqual([
      'margin_at_risk',
    ])
  })

  it('marge non mesurée, avec le droit → margin_unknown', () => {
    expect(visibleMissionRisks({ status: 'active', renewal: 'far', marginPercent: null }, true)).toEqual([
      'margin_unknown',
    ])
  })

  // ⚠️ Le test qui sait dire NON : sans le droit financier, `marginPercent`
  // vaut déjà `null` (rédigé par `redactFinance`) — mais si jamais un appelant
  // futur oubliait de rédiger, cette fonction ne doit JAMAIS annoncer un
  // risque de marge à qui n'a pas le droit de voir la marge. La confondre
  // avec « pas mesuré » ferait dire à un commercial sans droit qu'une marge
  // est mauvaise, ce qui est un jugement financier qu'il n'a pas le droit
  // de porter.
  it('sans le droit financier → jamais de risque de marge, même si marginPercent est renseigné par erreur', () => {
    expect(visibleMissionRisks({ status: 'active', renewal: 'far', marginPercent: -10 }, false)).toEqual([])
    expect(visibleMissionRisks({ status: 'active', renewal: 'far', marginPercent: null }, false)).toEqual([])
  })

  it('cumule renouvellement ET marge quand les deux sont mauvais', () => {
    expect(visibleMissionRisks({ status: 'active', renewal: 'overdue', marginPercent: -1 }, true)).toEqual([
      'renewal_not_started',
      'margin_at_risk',
    ])
  })

  // ⚠️ Mirroir exact du garde de `missionRisks()` (mission.ts) : une mission
  // suspendue ne calcule aucun risque — `null` le dit, distinct d'un tableau
  // vide (« calculé, rien à signaler »).
  it('mission suspendue → non calculé (null), jamais confondu avec « aucun risque »', () => {
    expect(visibleMissionRisks({ status: 'paused', renewal: 'overdue', marginPercent: -50 }, true)).toBeNull()
  })
})
