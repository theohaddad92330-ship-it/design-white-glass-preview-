import {
  MISSION_BOARD_ALERTS,
  MISSION_BOARD_COLUMNS,
  effectsForBoardMove,
  effectsForMove,
  PROJECT_STAGES,
} from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { resources } from './resources'

/**
 * Chaque clé du catalogue a son libellé, dans les DEUX langues.
 *
 * Le défaut, vu en recette le 21/08/2026 : le panneau d'effets du board
 * affichait `board.move.proposal.set_timesheet_cadence` en toutes lettres. Les
 * traductions avaient été écrites de mémoire, pas depuis le catalogue — et
 * comme la garde de parité FR/EN compare les deux fichiers ENTRE EUX, deux
 * fichiers également incomplets passaient sans un mot.
 *
 * Cette garde-ci compare l'interface au CODE : elle énumère tous les
 * déplacements possibles et exige un libellé pour chaque proposition, chaque
 * vérification, chaque colonne et chaque alerte. C'est la même famille que
 * `enum-keys.test.ts`, appliquée à un catalogue qui n'est pas un enum.
 */
function labels(locale: 'fr' | 'en'): Record<string, unknown> {
  return (resources[locale] as { missions: Record<string, unknown> }).missions
}

function at(root: Record<string, unknown>, path: string[]): unknown {
  return path.reduce<unknown>((node, key) => (node as Record<string, unknown> | undefined)?.[key], root)
}

const BOARD_KEYS = (() => {
  const proposals = new Set<string>()
  const checks = new Set<string>()
  for (const from of MISSION_BOARD_COLUMNS) {
    for (const to of MISSION_BOARD_COLUMNS) {
      const effects = effectsForBoardMove(from, to)
      for (const proposal of effects.proposals) proposals.add(proposal.key)
      for (const check of effects.checks) checks.add(check)
    }
  }
  return { proposals: [...proposals].sort(), checks: [...checks].sort() }
})()

const STAGE_KEYS = (() => {
  const proposals = new Set<string>()
  const checks = new Set<string>()
  const changes = new Set<string>()
  for (const from of PROJECT_STAGES) {
    for (const to of PROJECT_STAGES) {
      const effects = effectsForMove(from, to)
      for (const proposal of effects.proposals) proposals.add(proposal.key)
      for (const check of effects.checks) checks.add(check)
      for (const change of effects.changes) changes.add(change)
    }
  }
  return {
    proposals: [...proposals].sort(),
    checks: [...checks].sort(),
    changes: [...changes].sort(),
  }
})()

describe('les libellés du board suivent le catalogue, pas la mémoire de qui les a écrits', () => {
  for (const locale of ['fr', 'en'] as const) {
    it(`${locale} — chaque proposition de déplacement de carte a son libellé`, () => {
      const missing = BOARD_KEYS.proposals.filter(key => !at(labels(locale), ['board', 'move', 'proposal', key]))
      expect(missing).toEqual([])
    })

    it(`${locale} — chaque vérification a son libellé`, () => {
      const missing = BOARD_KEYS.checks.filter(key => !at(labels(locale), ['board', 'move', 'check', key]))
      expect(missing).toEqual([])
    })

    it(`${locale} — chaque colonne a son libellé`, () => {
      const missing = MISSION_BOARD_COLUMNS.filter(column => !at(labels(locale), ['board', 'columns', column]))
      expect(missing).toEqual([])
    })

    it(`${locale} — chaque alerte a son libellé`, () => {
      const missing = MISSION_BOARD_ALERTS.filter(alert => !at(labels(locale), ['board', 'alerts', alert]))
      expect(missing).toEqual([])
    })
  }
})

describe('les libellés du panneau d’étape suivent le catalogue', () => {
  for (const locale of ['fr', 'en'] as const) {
    const projects = () => (resources[locale] as { projects: Record<string, unknown> }).projects

    it(`${locale} — chaque proposition d’étape a son libellé`, () => {
      const missing = STAGE_KEYS.proposals.filter(key => !at(projects(), ['stageMove', 'proposal', key]))
      expect(missing).toEqual([])
    })

    // #4339.1 — chaque proposition = une phrase métier + sa raison en UNE ligne, sans jargon.
    it(`${locale} — chaque proposition d’étape dit sa raison, sans jargon`, () => {
      const missing = STAGE_KEYS.proposals.filter(key => !at(projects(), ['stageMove', 'reason', key]))
      expect(missing).toEqual([])
      const jargon = /btmmp|tjm|matching|submission|\bn1\b|\bn2\b/i
      for (const key of STAGE_KEYS.proposals) {
        for (const kind of ['proposal', 'reason']) {
          const text = String(at(projects(), ['stageMove', kind, key]))
          expect(text, `${locale} stageMove.${kind}.${key}`).not.toMatch(jargon)
          expect(text.length, `${locale} stageMove.${kind}.${key}`).toBeLessThan(110)
        }
      }
    })

    it(`${locale} — chaque résultat et chaque raison d’échec d’une proposition est écrit`, () => {
      for (const path of [
        ['result', 'task'],
        ['result', 'draft'],
        ['result', 'matching'],
        ['result', 'openTask'],
        ['result', 'openDraft'],
        ['result', 'openMatching'],
        ['failedAction'],
        ['failedReason', 'no_recipient'],
        ['failedReason', 'no_need'],
        ['failedReason', 'unavailable'],
        ['failedReason', 'failed'],
      ]) {
        expect(at(projects(), ['stageMove', ...path]), `${locale} stageMove.${path.join('.')}`).toBeTruthy()
      }
    })

    it(`${locale} — chaque vérification d’étape a son libellé`, () => {
      const missing = STAGE_KEYS.checks.filter(key => !at(projects(), ['stageMove', 'check', key]))
      expect(missing).toEqual([])
    })

    it(`${locale} — chaque colonne écrite par un déplacement a son libellé`, () => {
      const missing = STAGE_KEYS.changes.filter(key => !at(projects(), ['stageMove', 'change', key]))
      expect(missing).toEqual([])
    })
  }
})
