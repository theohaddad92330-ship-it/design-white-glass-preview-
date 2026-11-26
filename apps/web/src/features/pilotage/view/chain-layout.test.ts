import { PILOTAGE_LEVELS, type PilotageLevelReport, type PilotageMetric } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import {
  CHAIN_LEVELS,
  RETIRED_LEVELS,
  SECONDARY_LEVELS,
  chainOf,
  displayedLevels,
  primaryMetric,
  secondaryOf,
} from './chain-layout'

function metric(key: string, unit: 'count' | 'rate'): PilotageMetric {
  return { key, value: 1, unit, status: 'ok' }
}

function report(level: PilotageLevelReport['level'], metrics: PilotageMetric[] = []): PilotageLevelReport {
  return { level, status: 'ok', metrics }
}

describe('la coupure entre les maillons et les lectures transverses', () => {
  /**
   * ⚠️ LA GARDE QUI COMPTE : la partition. Un maillon ajouté au contrat et
   * oublié ici DISPARAÎTRAIT de l'écran sans que rien ne rougisse — du calcul
   * juste que personne n'affiche, le défaut n°1 du dépôt.
   */
  it('couvre TOUS les maillons du contrat, une fois chacun', () => {
    const declared = [...CHAIN_LEVELS, ...SECONDARY_LEVELS, ...RETIRED_LEVELS]
    expect(declared.length).toBeGreaterThan(0)
    expect([...declared].sort()).toEqual([...PILOTAGE_LEVELS].sort())
    expect(new Set(declared).size).toBe(declared.length)
  })

  it('rend les six maillons dans l’ordre du PARCOURS, pas celui du serveur', () => {
    const shuffled = [...PILOTAGE_LEVELS].reverse().map(level => report(level))
    expect(chainOf(shuffled).map(level => level.level)).toEqual([
      'acquisition',
      'conversation',
      'qualification',
      'sourcing',
      'conversion',
      'expansion',
    ])
  })

  it('sort Économie de la chaîne', () => {
    const all = PILOTAGE_LEVELS.map(level => report(level))
    expect(chainOf(all).map(l => l.level)).not.toContain('economie')
    expect(secondaryOf(all).map(l => l.level)).toEqual(['economie'])
  })

  // R21-FIX point 4b (15/10) : la refonte Pilotage du 14/10 a SUPPRIMÉ Qualité ; le contrat la sert
  // encore, l'écran ne l'affiche — ni carte, ni compte — nulle part.
  it('Qualité est retirée de tous les écrans Pilotage', () => {
    const all = PILOTAGE_LEVELS.map(level => report(level))
    expect(RETIRED_LEVELS).toEqual(['qualite'])
    expect(displayedLevels(all).map(l => l.level)).not.toContain('qualite')
    expect(displayedLevels(all)).toHaveLength(all.length - 1)
    expect(secondaryOf(all).map(l => l.level)).not.toContain('qualite')
  })

  it('n’invente pas un maillon que le serveur n’a pas servi', () => {
    expect(chainOf([report('acquisition')]).map(l => l.level)).toEqual(['acquisition'])
  })
})

describe('la métrique qui parle pour un maillon', () => {
  it('préfère le TAUX au volume — c’est lui qui mesure le passage', () => {
    const level = report('conversation', [metric('emailsSent', 'count'), metric('replyRate', 'rate')])
    expect(primaryMetric(level)?.key).toBe('replyRate')
  })

  it('prend le premier compte quand le maillon ne porte aucun taux', () => {
    const level = report('acquisition', [
      metric('contactsTargeted', 'count'),
      metric('signals', 'count'),
      metric('profilesPushed', 'count'),
    ])
    expect(primaryMetric(level)?.key).toBe('contactsTargeted')
  })

  it('rend null sur un maillon sans aucune métrique', () => {
    expect(primaryMetric(report('sourcing'))).toBeNull()
  })
})
