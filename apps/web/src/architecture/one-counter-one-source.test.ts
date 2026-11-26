import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * #4193 (épopée #4191, L2) — UN COMPTEUR, UNE SOURCE.
 *
 * Les fichiers KPI d'Affaires / Talents / Missions lisent `useCrmCounters`
 * (`GET /crm-counters`) : ils ne recomptent pas leur population par
 * `.filter(...).length` sur des missions ou des besoins.
 */
const SRC = resolve(__dirname, '..')
const KPI_FILES = [
  'features/missions/view/MissionCockpitKpiTiles.tsx',
  'features/projects/view/pipeline-header-summary.ts',
]

/** Un `.filter(...)` qui se termine en `.length`, sur missions/besoins. */
const RECOUNT = /\b(?:missions?|needs?|besoins?)\w*\s*\.filter\([^)]*\)[\s\S]{0,80}?\.length/i

describe('one counter, one source', () => {
  it.each(KPI_FILES)('%s ne recompte ni missions ni besoins', file => {
    const source = readFileSync(resolve(SRC, file), 'utf8')
    expect(RECOUNT.test(source)).toBe(false)
  })

  it('la garde sait dire NON : un recomptage est reconnu', () => {
    expect(RECOUNT.test('const n = missions.filter(m => m.status === "active").length')).toBe(true)
    expect(RECOUNT.test('needs.filter(x => x.ok).length')).toBe(true)
  })

  it('les pages Missions, Planification et Besoins ouverts lisent useCrmCounters', () => {
    for (const file of [
      'features/missions/view/MissionsPage.tsx',
      'features/missions/view/PlanningPage.tsx',
      'features/projects/open-needs/view/OpenNeedsPage.tsx',
    ]) {
      expect(readFileSync(resolve(SRC, file), 'utf8'), file).toContain('useCrmCounters')
    }
  })
})
