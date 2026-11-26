import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  cancelCause,
  hostClass,
  parseArgs,
  parseSelection,
  percentile,
  readHostClasses,
  realVerdict,
} from '../../../../tools/ci/metrics.mjs'
import { summaryLine } from '../../../../tools/ci/test-changed.mjs'

/**
 * `tools/ci/metrics.mjs` — la Météo CI. Ce qui se teste ici, c'est ce qui
 * déciderait d'un faux chiffre : un run coupé sur rouge compté « annulé », une
 * ligne de sélecteur mal lue, un runner rangé dans la mauvaise classe d'hôte.
 */
describe('Météo CI', () => {
  it('lit la ligne que le sélecteur écrit réellement, dans les deux modes', () => {
    const complet = summaryLine({
      mode: 'complet',
      reason: 'fondation touchée : pnpm-lock.yaml',
      files: ['a', 'b'],
      total: 2,
    })
    const concernes = summaryLine({ mode: 'concernes', reason: '', files: ['a'], total: 3191 })

    expect(parseSelection(`2026-10-30T10:00:00Z ${complet}`)).toEqual({
      files: 2,
      total: 2,
      mode: 'complet',
      reason: 'fondation touchée : pnpm-lock.yaml',
    })
    expect(parseSelection(concernes)).toEqual({ files: 1, total: 3191, mode: 'concernes', reason: '' })
    expect(parseSelection('aucune ligne de mesure')).toBeNull()
  })

  it('compte ROUGE un run annulé qui porte une étape en échec, annulé sinon', () => {
    const redJob = { conclusion: 'cancelled', steps: [{ conclusion: 'success' }, { conclusion: 'failure' }] }
    const cutJob = { conclusion: 'cancelled', steps: [{ conclusion: 'success' }, { conclusion: 'cancelled' }] }

    expect(realVerdict({ conclusion: 'cancelled' }, [redJob, cutJob])).toBe('failure')
    expect(realVerdict({ conclusion: 'cancelled' }, [cutJob])).toBe('cancelled')
    expect(realVerdict({ conclusion: 'success' }, [])).toBe('success')
  })

  it('distingue la coupure sur rouge, le remplacement et l’annulation extérieure', () => {
    const red = [{ conclusion: 'failure' }]
    const cut = [{ conclusion: 'cancelled', started_at: '2026-10-30T10:00:00Z', completed_at: '2026-10-30T10:05:00Z' }]

    expect(cancelCause({}, red, true)).toBe('red-cut')
    expect(cancelCause({}, cut, true)).toBe('superseded')
    expect(cancelCause({}, cut, false)).toBe('external')
  })

  it('range les runners par classe d’hôte depuis la table du runbook', () => {
    const runbook = readFileSync(resolve(__dirname, '../../../../infra/ci-runner-vps/runbook.md'), 'utf8')
    const classes = readHostClasses(runbook)

    expect(Object.keys(classes).length).toBeGreaterThan(0)
    // GitHub tronque le nom affiché du runner : le préfixe doit suffire.
    expect(hostClass('vps-e820d794dc', classes)).toBe('CX43')
    expect(hostClass('vps-1fe563cc0cd1', classes)).toBe('CX53')
    expect(hostClass('vps-0000', classes)).toBe('non documenté')
    expect(hostClass('GitHub Actions 12', classes)).toBe('github')
  })

  it('calcule un percentile sans compter les valeurs absentes', () => {
    expect(percentile([10, null, 20, 30, 40], 50)).toBe(20)
    expect(percentile([10, 20, 30, 40], 90)).toBe(40)
    expect(percentile([null], 50)).toBeNull()
  })

  it('refuse une option inconnue plutôt que de mesurer autre chose', () => {
    expect(parseArgs(['--days', '7'])).toMatchObject({ days: 7, logs: 40 })
    expect(() => parseArgs(['--jours', '7'])).toThrow('option inconnue')
  })
})
