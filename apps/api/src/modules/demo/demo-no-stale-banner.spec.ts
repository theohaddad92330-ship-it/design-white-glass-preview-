import { isSegmentCollectionStale, SEGMENT_CAPABILITY_EPOCH } from '@bellum/contracts'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEMO_DOSSIERS, demoCollectedAtColumns } from './demo-dataset'

/**
 * Louis 13/10/2026 — le bandeau « date de collecte non mesurée / antérieure » ne
 * s'affiche plus en DÉMO : chaque compte de la salle porte une date de collecte
 * pour chaque segment, RELATIVE à l'ouverture de la salle, postérieure à la dernière
 * capacité datée. Le bandeau reste intact en production (aucune garde touchée).
 */
const SEGMENT_COLUMNS = {
  signals_collected_at: 'signals',
  contacts_collected_at: 'contacts',
  entities_collected_at: 'entities',
  strategy_collected_at: 'strategy',
  dossier_read_collected_at: 'dossier_read',
  addressability_relation_collected_at: 'access_relation',
  // #4078 — le septième segment : les cinq blocs du dossier complet.
  dossier_blocks_collected_at: 'dossier_blocks',
} as const

describe('démo — aucun compte ne déclenche le bandeau de collecte antérieure', () => {
  const nowMs = Date.now() // relatif : une capacité datée du jour dépasserait une date figée

  it('chaque dossier reçoit les sept colonnes, toutes postérieures à la capacité de leur segment', () => {
    expect(DEMO_DOSSIERS.length).toBeGreaterThan(10)
    for (const dossier of DEMO_DOSSIERS) {
      const columns = demoCollectedAtColumns(dossier.account, nowMs)
      for (const [column, segment] of Object.entries(SEGMENT_COLUMNS)) {
        const value = columns[column as keyof typeof columns]
        expect({ company: dossier.account.company_name, column, isDate: value instanceof Date }).toEqual({
          company: dossier.account.company_name,
          column,
          isDate: true,
        })
        const epoch = SEGMENT_CAPABILITY_EPOCH[segment]
        if (epoch)
          expect({
            company: dossier.account.company_name,
            column,
            stale: isSegmentCollectionStale((value as Date).toISOString(), epoch),
          }).toEqual({ company: dossier.account.company_name, column, stale: false })
      }
    }
  })

  it('la date de repli est RELATIVE à l’ouverture de la salle (jamais un instant figé)', () => {
    const bare = { company_name: 'X' } as unknown as (typeof DEMO_DOSSIERS)[number]['account']
    const a = demoCollectedAtColumns(bare, nowMs).signals_collected_at as Date
    const b = demoCollectedAtColumns(bare, nowMs + 86_400_000).signals_collected_at as Date
    expect(b.getTime() - a.getTime()).toBe(86_400_000)
    expect(a.getTime()).toBeLessThan(nowMs)
  })

  it('une date explicite du dossier (SNCF) l’emporte sur le repli', () => {
    const sncf = DEMO_DOSSIERS.find(d => d.account.company_name === 'SNCF')
    const columns = demoCollectedAtColumns(sncf?.account ?? ({} as never), nowMs)
    expect((columns.signals_collected_at as Date).toISOString()).toBe(sncf?.account.signals_collected_at)
  })

  it('le semis écrit ces colonnes', () => {
    const seed = readFileSync(join(__dirname, 'demo-seed.service.ts'), 'utf8')
    expect(seed).toContain('...demoCollectedAtColumns(dossier.account, Date.now())')
  })
})
