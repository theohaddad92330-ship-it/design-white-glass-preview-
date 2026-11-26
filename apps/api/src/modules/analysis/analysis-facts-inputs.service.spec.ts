import type { AccountFact } from '@bellum/contracts'
import { AnalysisFactsInputsService } from './analysis-facts-inputs.service'
import type { AnalysisAccountFactsSource } from './analysis-facts-inputs'

const ARGS = { workspaceId: 'ws-1', accountId: 'acc-1', userId: 'u-1' }
const fact = (over: Partial<AccountFact> = {}): AccountFact => ({
  date: '2025-08-12',
  kind: 'need',
  label: 'Migration paie cloud',
  weight: 0.7,
  ageDays: 426,
  ...over,
})

function build(opts: {
  source?: AnalysisAccountFactsSource
  account?: Record<string, unknown> | null
  provenance?: Array<{ field: string; source: string; observed_at: Date | string | null }>
  queries?: (sql: string) => unknown
  missions?: Array<Record<string, unknown>>
  people?: Array<Record<string, unknown>>
}) {
  const query = jest.fn(async (sql: string) => opts.queries?.(sql) ?? [])
  const accounts = {
    findOne: jest.fn(async () => (opts.account === undefined ? null : opts.account)),
    manager: { query },
  }
  const provenance = { find: jest.fn(async () => opts.provenance ?? []) }
  const missions = { find: jest.fn(async () => opts.missions ?? []) }
  const contacts = { find: jest.fn(async () => opts.people ?? []) }
  const service = new AnalysisFactsInputsService(
    accounts as never,
    provenance as never,
    opts.source,
    missions as never,
    contacts as never,
  )
  return { service, accounts, provenance, query, missions, contacts }
}

describe('AnalysisFactsInputsService (#4070)', () => {
  describe('accountFacts', () => {
    it('lit les faits par le jeton, jamais un second lecteur', async () => {
      const source: AnalysisAccountFactsSource = {
        facts: jest.fn(async () => [
          fact(),
          fact({ kind: 'deal_lost', label: 'TMA SI RH', date: '2024-06-01', ageDays: 863 }),
        ]),
        lostDealRex: jest.fn(async () => 'Perte du 2024-06-01 — motif déclaré : prix.'),
      }
      const { service } = build({ source })
      const out = await service.accountFacts(ARGS)
      expect(source.facts).toHaveBeenCalledWith(ARGS)
      expect(out.accountFacts).toEqual([
        { kind: 'need', label: 'Migration paie cloud', date: '2025-08-12', ageDays: 426 },
        { kind: 'deal_lost', label: 'TMA SI RH', date: '2024-06-01', ageDays: 863 },
      ])
      expect(out.lostDealRex).toContain('motif déclaré : prix')
    })

    it('NON — sans source branchée, aucune clé (le job reste byte-identique)', async () => {
      const { service } = build({})
      expect(await service.accountFacts(ARGS)).toEqual({})
    })

    it('NON — aucun fait, aucun REX → aucune clé', async () => {
      const source: AnalysisAccountFactsSource = { facts: async () => [], lostDealRex: async () => null }
      const { service } = build({ source })
      expect(await service.accountFacts(ARGS)).toEqual({})
    })

    it('NON — une lecture en échec ne bloque pas le lancement : on part sans', async () => {
      const source: AnalysisAccountFactsSource = {
        facts: async () => {
          throw new Error('db down')
        },
        lostDealRex: async () => 'Perte du 2024-06-01 — motif déclaré : prix.',
      }
      const { service } = build({ source })
      // Les faits manquent, le REX (autre lecture) reste : une panne n'en efface pas une autre.
      expect(await service.accountFacts(ARGS)).toEqual({ lostDealRex: 'Perte du 2024-06-01 — motif déclaré : prix.' })
    })
  })

  describe('missionContacts', () => {
    it('lit les missions de CE compte dans CET espace, puis les contacts désignés dans CE même espace', async () => {
      const { service, missions, contacts } = build({
        missions: [
          {
            id: 'm2',
            client_manager_contact_id: 'c-1',
            cra_contact_id: 'c-2',
            started_on: '2025-03-01',
            created_at: new Date('2025-02-20'),
          },
          {
            id: 'm1',
            client_manager_contact_id: 'c-1',
            cra_contact_id: null,
            started_on: '2024-02-01',
            created_at: new Date('2024-01-20'),
          },
        ],
        people: [
          { id: 'c-1', full_name: 'Paul Durand', title: 'Directeur paie' },
          { id: 'c-2', full_name: 'Alice Roy', title: null },
        ],
      })
      const out = await service.missionContacts(ARGS)
      // Un contact est daté par sa mission la PLUS RÉCENTE.
      expect(out).toEqual([
        { name: 'Paul Durand', role: 'Directeur paie', relation: 'mission', lastSeen: '2025-03-01' },
        { name: 'Alice Roy', role: null, relation: 'mission', lastSeen: '2025-03-01' },
      ])
      expect(missions.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { workspace_id: 'ws-1', account_id: 'acc-1' } }),
      )
      const contactsQuery = contacts.find.mock.calls[0] as unknown as [{ where: { workspace_id: string } }]
      expect(contactsQuery[0].where.workspace_id).toBe('ws-1')
    })

    it('NON — aucune mission ne désigne de contact : aucune lecture de contacts', async () => {
      const { service, contacts } = build({
        missions: [{ id: 'm1', client_manager_contact_id: null, cra_contact_id: null }],
      })
      expect(await service.missionContacts(ARGS)).toEqual([])
      expect(contacts.find).not.toHaveBeenCalled()
    })

    it('NON — dépôts absents ou lecture en échec → liste vide', async () => {
      const { service, missions } = build({})
      missions.find.mockRejectedValueOnce(new Error('boom'))
      expect(await service.missionContacts(ARGS)).toEqual([])
      const bare = new AnalysisFactsInputsService({} as never)
      expect(await bare.missionContacts(ARGS)).toEqual([])
    })
  })

  describe('previousAnalysis', () => {
    const account = {
      id: 'acc-1',
      sector: 'Banque',
      headquarters: 'Lyon',
      employees: null,
      raw_analysis: {
        businessDescription: 'Banque de détail.',
        angles: [{ angle: 'Modernisation SI' }, 'Conformité DORA'],
      },
    }

    it('une ré-analyse relit l’analyse précédente : datée, la correction humaine nommée', async () => {
      const { service } = build({
        account,
        provenance: [
          { field: 'headquarters', source: 'human', observed_at: new Date('2026-07-01T10:00:00Z') },
          { field: 'sector', source: 'collected', observed_at: new Date('2026-06-18T00:00:00Z') },
        ],
        queries: sql => (/analysis_runs/.test(sql) ? [{ at: new Date('2026-06-18T08:00:00Z') }] : []),
      })
      const text = await service.previousAnalysis({ ...ARGS, now: new Date('2026-10-12T09:00:00Z') })
      expect(text).toContain('Analyse du 2026-06-18 (il y a 4 mois)')
      expect(text).toContain("Siège : Lyon (corrigé par l'équipe le 2026-07-01)")
      expect(text).toContain('Secteur : Banque')
      expect(text).not.toContain('Secteur : Banque (corrigé')
      expect(text).toContain('Angles retenus : Modernisation SI ; Conformité DORA')
    })

    it('NON — une première analyse (aucune fiche écrite) ne reçoit pas de bloc', async () => {
      const { service } = build({ account: { id: 'acc-1', raw_analysis: {} } })
      expect(await service.previousAnalysis(ARGS)).toBeUndefined()
    })

    it('NON — compte absent ou lecture en échec → undefined', async () => {
      expect(await build({ account: null }).service.previousAnalysis(ARGS)).toBeUndefined()
      const failing = build({})
      failing.accounts.findOne.mockRejectedValueOnce(new Error('boom'))
      expect(await failing.service.previousAnalysis(ARGS)).toBeUndefined()
    })

    it('NON — sans analyse terminée connue, il le dit (jamais created_at)', async () => {
      const { service } = build({ account })
      const text = await service.previousAnalysis(ARGS)
      expect(text).toContain('Analyse précédente (date non connue)')
    })

    it('cloisonne : la fiche est lue dans l’espace demandé', async () => {
      const { service, accounts } = build({ account })
      await service.previousAnalysis(ARGS)
      expect(accounts.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'acc-1', workspace_id: 'ws-1' } }),
      )
    })
  })
})
