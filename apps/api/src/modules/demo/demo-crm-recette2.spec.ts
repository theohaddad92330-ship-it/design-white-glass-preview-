import { DEMO_CRM_RECETTE2_COVERAGE } from './demo-coverage'
import { DEMO_CRM_RECETTE2_DEAL, seedDemoCrmRecette2 } from './demo-crm-recette2'

/**
 * #4191 (recette 2, E5) — la salle de démo n'avait AUCUNE affaire chez Orange : le panneau « Objets liés »
 * n'avait donc aucun exemple vitrine. Le semis pose, sur Orange (ou, à défaut, sur le compte vitrine
 * Société Générale), une affaire au stade avancé avec UN besoin et DEUX positionnements (envoyé, entretien).
 *
 * Mini-base en mémoire : le test lit l'ÉTAT FINAL des lignes insérées.
 */
type Row = Record<string, unknown>

function fakeDb(opts: { accounts: { id: string; company_name: string }[]; consultants?: number; existing?: boolean }) {
  const inserted: Record<string, Row[]> = { opportunities: [], project_needs: [], submissions: [], transitions: [] }
  const query = jest.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes('FROM accounts')) {
      return opts.accounts.filter(a => a.company_name === params[1])
    }
    if (sql.includes('FROM consultants')) {
      return Array.from({ length: opts.consultants ?? 3 }, (_, i) => ({ id: `c${i + 1}` }))
    }
    if (sql.includes('SELECT id FROM opportunities')) return opts.existing ? [{ id: 'old' }] : []
    if (sql.includes('INSERT INTO opportunities')) {
      inserted.opportunities!.push({ sql, params })
      return [{ id: 'opp1' }]
    }
    if (sql.includes('INSERT INTO project_needs')) {
      inserted.project_needs!.push({ sql, params })
      return [{ id: 'need1' }]
    }
    if (sql.includes('INSERT INTO submissions')) {
      inserted.submissions!.push({ sql, params })
      return [{ id: `sub${inserted.submissions!.length}` }]
    }
    if (sql.includes('INSERT INTO commercial_transitions')) {
      inserted.transitions!.push({ sql, params })
      return []
    }
    return []
  })
  return { manager: { query } as never, inserted }
}

const NOW = Date.parse('2026-10-15T09:00:00Z')

describe('seedDemoCrmRecette2 — une affaire vitrine pour le panneau « Objets liés »', () => {
  it('Orange existe : l’affaire pend d’Orange, au stade avancé, avec 1 besoin et 2 positionnements', async () => {
    const db = fakeDb({ accounts: [{ id: 'orange', company_name: 'Orange' }] })
    await seedDemoCrmRecette2(db.manager, 'ws', 'owner', NOW)
    expect(db.inserted.opportunities).toHaveLength(1)
    expect(db.inserted.opportunities![0]!.params).toEqual(
      expect.arrayContaining(['ws', 'orange', DEMO_CRM_RECETTE2_DEAL.label]),
    )
    expect(db.inserted.opportunities![0]!.sql).toContain("'profiles_submitted'")
    expect(db.inserted.project_needs).toHaveLength(1)
    const stages = db.inserted.submissions!.map(s => (s.params as unknown[])[4])
    expect(stages).toEqual(['submitted', 'interview'])
    const consultants = db.inserted.submissions!.map(s => (s.params as unknown[])[3])
    expect(new Set(consultants).size).toBe(2)
  })

  it('sans Orange : le même exemple sur le compte vitrine le plus riche (Société Générale)', async () => {
    const db = fakeDb({ accounts: [{ id: 'sg', company_name: 'Société Générale' }] })
    await seedDemoCrmRecette2(db.manager, 'ws', 'owner', NOW)
    expect(db.inserted.opportunities![0]!.params).toEqual(expect.arrayContaining(['sg']))
  })

  it('ni Orange ni compte vitrine : rien n’est posé', async () => {
    const db = fakeDb({ accounts: [] })
    await seedDemoCrmRecette2(db.manager, 'ws', 'owner', NOW)
    expect(db.inserted.opportunities).toHaveLength(0)
  })

  it('moins de deux consultants : rien n’est posé (jamais un positionnement sans personne)', async () => {
    const db = fakeDb({ accounts: [{ id: 'orange', company_name: 'Orange' }], consultants: 1 })
    await seedDemoCrmRecette2(db.manager, 'ws', 'owner', NOW)
    expect(db.inserted.opportunities).toHaveLength(0)
  })

  it('idempotent : une affaire de même libellé déjà là n’est pas redoublée', async () => {
    const db = fakeDb({ accounts: [{ id: 'orange', company_name: 'Orange' }], existing: true })
    await seedDemoCrmRecette2(db.manager, 'ws', 'owner', NOW)
    expect(db.inserted.opportunities).toHaveLength(0)
  })

  it('porte une couverture « seedée » qui nomme sa raison', () => {
    expect(DEMO_CRM_RECETTE2_COVERAGE.state).toBe('seede')
    expect(DEMO_CRM_RECETTE2_COVERAGE.reason).toContain('Objets liés')
  })
})
