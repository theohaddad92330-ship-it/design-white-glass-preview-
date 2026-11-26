import { SEGMENT_CAPABILITY_EPOCH } from '@bellum/contracts'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEMO_DOSSIERS, demoSegmentCollectedAtColumns } from './demo-dataset'

/**
 * Recette prod 05/10 — la fiche SNCF affichait « Date de collecte non mesurée —
 * à revérifier » : seul `signals_collected_at` était daté. SNCF, le dossier
 * qu'on ouvre en réunion, porte une collecte FRAÎCHE sur tous les segments
 * datables, après chaque capacité (`SEGMENT_CAPABILITY_EPOCH`).
 */
const sncf = DEMO_DOSSIERS.find(d => d.account.company_name === 'SNCF')

describe('démo — SNCF porte une date de collecte par segment', () => {
  it('chaque colonne de collecte est posée, APRÈS la capacité la plus récente du segment', () => {
    const columns = demoSegmentCollectedAtColumns(sncf?.account ?? {})
    const expected = {
      contacts_collected_at: 'contacts',
      entities_collected_at: 'entities',
      strategy_collected_at: 'strategy',
      dossier_read_collected_at: 'dossier_read',
      addressability_relation_collected_at: 'access_relation',
    } as const
    for (const [column, segment] of Object.entries(expected)) {
      const value = columns[column as keyof typeof columns]
      expect({ column, isDate: value instanceof Date }).toEqual({ column, isDate: true })
      const epoch = SEGMENT_CAPABILITY_EPOCH[segment]
      if (epoch)
        expect({ column, after: (value as Date).getTime() > Date.parse(epoch) }).toEqual({ column, after: true })
    }
  })

  it('sait dire NON : un dossier sans date ne reçoit AUCUNE colonne (jamais présumé à jour)', () => {
    const others = DEMO_DOSSIERS.filter(d => d.account.company_name !== 'SNCF')
    expect(others.length).toBeGreaterThan(0)
    for (const other of others) expect(demoSegmentCollectedAtColumns(other.account)).toEqual({})
  })

  it('le semis écrit ces colonnes', () => {
    const seed = readFileSync(join(__dirname, 'demo-seed.service.ts'), 'utf8')
    // 13/10/2026 : le semis passe par demoCollectedAtColumns (repli relatif, voir demo-no-stale-banner.spec.ts).
    expect(seed).toContain('...demoCollectedAtColumns(dossier.account, Date.now())')
  })
})
