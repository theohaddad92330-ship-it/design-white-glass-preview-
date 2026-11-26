import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { AccountEntity } from '../../database/entities/account.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { DiscoverSourcesService } from './discover-sources.service'

/**
 * #4067 — les FAITS que l'espace connaît déjà d'un candidat Découvrir, lus en
 * une requête par source pour toute la page (jamais une par carte), TOUJOURS
 * filtrés par l'espace. Une source en panne ou sans rien de branché rend `null`
 * — « non mesuré » — jamais un zéro deviné.
 */
const WS = 'ws-1'
const NOW = new Date('2026-10-12T00:00:00Z')

type Routes = Partial<Record<string, unknown[] | Error>>

/** Route chaque requête sur un MARQUEUR de son SQL — un test dit quelle source
 *  rend quoi, sans dépendre de l'ordre des appels. */
const build = async (routes: Routes, contactRows: Array<{ account_id: string; count: string }> = []) => {
  const contactsQb = {
    innerJoin: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue(contactRows),
  }
  const query = jest.fn(async (sql: string, _params?: unknown[]) => {
    // Les sondes d'existence (`*_has_*`) d'abord : elles lisent la même table
    // que la lecture principale.
    const entries = Object.entries(routes).sort(([a], [b]) => Number(b.includes('_has_')) - Number(a.includes('_has_')))
    for (const [marker, rows] of entries) {
      if (sql.includes(marker)) {
        if (rows instanceof Error) throw rows
        return rows
      }
    }
    return []
  })
  const moduleRef = await Test.createTestingModule({
    providers: [
      DiscoverSourcesService,
      { provide: getRepositoryToken(AccountEntity), useValue: { manager: { query } } },
      { provide: getRepositoryToken(ContactEntity), useValue: { createQueryBuilder: () => contactsQb } },
    ],
  }).compile()
  return { service: moduleRef.get(DiscoverSourcesService), query, contactsQb }
}

const owned = { siren: '552081317', name: 'Acme Industrie', accountId: 'acc-1' }
const fresh = { siren: '999999999', name: 'Neuve SA', accountId: null }

describe('DiscoverSourcesService (#4067)', () => {
  it('rend une ligne par candidat, dans l’ordre, et rien sans candidat', async () => {
    const { service, query } = await build({})
    expect(await service.collect(WS, [], NOW)).toEqual([])
    expect(query).not.toHaveBeenCalled()
  })

  it('#4067.1 — lit l’historique des signaux du compte de l’ESPACE (workspace en paramètre)', async () => {
    const { service, query } = await build({
      'FROM signal_history': [
        { account_id: 'acc-1', signal_type: 'hiring', signal_date: '2026-01-10', change_count: 1 },
      ],
    })
    const [ownedFacts, freshFacts] = await service.collect(WS, [owned, fresh], NOW)
    expect(ownedFacts.signalHistory).toEqual({ signals: [{ type: 'hiring', date: '2026-01-10', changeCount: 1 }] })
    // Un candidat neuf n'a pas d'historique dans l'espace : non mesuré, jamais « aucun signal ».
    expect(freshFacts.signalHistory).toBeNull()
    const call = query.mock.calls.find(([sql]) => String(sql).includes('FROM signal_history'))!
    expect(call[1]).toEqual(expect.arrayContaining([WS]))
  })

  it('#4067.2 — CRM : gagnées, perdues, ouvertes, en sommeil et contacts connus du compte', async () => {
    const { service } = await build(
      {
        'FROM crm_deal_facts': [
          { account_id: 'acc-1', company_siren: null, is_closed: true, is_won: true, last_at: '2025-05-01' },
          { account_id: null, company_siren: '552081317', is_closed: true, is_won: false, last_at: '2025-01-01' },
          { account_id: 'acc-1', company_siren: null, is_closed: false, is_won: null, last_at: '2026-01-01' },
          { account_id: 'acc-1', company_siren: null, is_closed: false, is_won: null, last_at: '2026-10-01' },
        ],
        crm_has_deals: [{ crm_has_deals: true }],
      },
      [{ account_id: 'acc-1', count: '4' }],
    )
    const [facts, freshFacts] = await service.collect(WS, [owned, fresh], NOW)
    expect(facts.crm).toEqual({
      won: 1,
      lost: 1,
      open: 1,
      dormant: 1,
      contacts: 4,
      lastActivityAt: new Date('2026-10-01').toISOString(),
    })
    // CRM branché : un candidat neuf est MESURÉ (on a cherché son SIREN), à zéro.
    expect(freshFacts.crm).toEqual({ won: 0, lost: 0, open: 0, dormant: 0, contacts: 0, lastActivityAt: null })
  })

  it('#4067.2 — sans CRM branché, un candidat neuf reste NON MESURÉ', async () => {
    const { service } = await build({ crm_has_deals: [{ crm_has_deals: false }] })
    const [facts] = await service.collect(WS, [fresh], NOW)
    expect(facts.crm).toBeNull()
  })

  it('#4067.3 — référentiel de comptes cibles par SIREN exact', async () => {
    const { service } = await build({
      'FROM dataforge_account_statuses': [{ siren: '552081317', statut_code: 'CIBLE_PRIORITAIRE' }],
    })
    const [facts, freshFacts] = await service.collect(WS, [owned, fresh], NOW)
    expect(facts.dataforge).toEqual({ status: 'CIBLE_PRIORITAIRE' })
    expect(freshFacts.dataforge).toBeNull()
  })

  // #4294.9 — le référentiel ne se lisait que par son STATUT : les besoins passés observés sur le
  // compte (base commune, PARTAGÉE — GA-16, jamais filtrée par l'espace) pèsent désormais aussi.
  it('#4294.9 — besoins passés observés par SIREN, rattachement univoque, sans statut aussi', async () => {
    const { service, query } = await build({
      'FROM dataforge_account_statuses': [{ siren: '552081317', statut_code: 'A_QUALIFIER' }],
      'JOIN dataforge_needs': [
        { siren: '552081317', total: 3, won: 1, latest: '2025-03-14' },
        { siren: '999999999', total: 1, won: 0, latest: null },
      ],
    })
    const [facts, freshFacts] = await service.collect(WS, [owned, fresh], NOW)
    expect(facts.dataforge).toEqual({ status: 'A_QUALIFIER', needs: { total: 3, won: 1, latestAt: '2025-03-14' } })
    expect(freshFacts.dataforge).toEqual({ status: null, needs: { total: 1, won: 0, latestAt: null } })
    const [sql, params] = query.mock.calls.find(([q]) => String(q).includes('JOIN dataforge_needs'))!
    // un SIREN porté par deux grappes ne se lit pas (#4281.4) : la règle d'univocité est DANS la requête
    expect(String(sql)).toContain('is_cluster_primary')
    expect(params).toEqual([['552081317', '999999999']])
  })

  it('#4294.9 — NON : besoins en panne, le statut reste lu et la forme reste celle d’avant', async () => {
    const { service } = await build({
      'FROM dataforge_account_statuses': [{ siren: '552081317', statut_code: 'CIBLE_PRIORITAIRE' }],
      'JOIN dataforge_needs': new Error('db down'),
    })
    const [facts] = await service.collect(WS, [owned], NOW)
    expect(facts.dataforge).toEqual({ status: 'CIBLE_PRIORITAIRE' })
  })

  it('#4067.4 — Drive : documents de l’ESPACE seulement, et seulement si l’espace en a', async () => {
    const { service, query } = await build({
      drive_has_documents: [{ drive_has_documents: true }],
      'JOIN rag_documents d': [
        { idx: '1', documents: '2', latest: '2026-09-01T00:00:00.000Z' },
        { idx: '2', documents: '0', latest: null },
      ],
    })
    const [facts, freshFacts] = await service.collect(WS, [owned, fresh], NOW)
    expect(facts.drive).toEqual({ documents: 2, latestAt: '2026-09-01T00:00:00.000Z' })
    expect(freshFacts.drive).toEqual({ documents: 0, latestAt: null })
    const call = query.mock.calls.find(([sql]) => String(sql).includes('JOIN rag_documents d'))!
    expect(String(call[0])).toContain('d.workspace_id = $1')
    expect(call[1]?.[0]).toBe(WS)
  })

  it('#4067.4 — Drive vide ⇒ non mesuré (rien de synchronisé à lire)', async () => {
    const { service } = await build({ drive_has_documents: [{ drive_has_documents: false }] })
    const [facts] = await service.collect(WS, [owned], NOW)
    expect(facts.drive).toBeNull()
  })

  it('#4067.4 — missions passées sur le compte et consultants du vivier passés chez lui', async () => {
    const { service } = await build({
      bench_has_rows: [{ bench_has_rows: true }],
      'FROM missions': [{ account_id: 'acc-1', count: '2', latest_open: null, latest_finished: '2026-06-30' }],
      'JOIN consultant_experiences': [{ idx: '1', consultants: '1' }],
    })
    const [facts, freshFacts] = await service.collect(WS, [owned, fresh], NOW)
    expect(facts.missions).toEqual({ missions: 2, consultants: 1, latestAt: '2026-06-30' })
    expect(freshFacts.missions).toEqual({ missions: 0, consultants: 0, latestAt: null })
  })

  // #4067.4 (R47) — Dassault : la mission est TERMINÉE, sa fin prévue (30/11) est restée dans le futur.
  // Le statut terminé gagne sur une date de fin planifiée : « 1 mission passée », jamais « en cours ».
  it('#4067.4 — une mission terminée à fin prévue future ne date jamais d’après aujourd’hui', async () => {
    const { service } = await build({
      bench_has_rows: [{ bench_has_rows: true }],
      'FROM missions': [{ account_id: 'acc-1', count: '1', latest_open: null, latest_finished: '2026-11-30' }],
    })
    const [facts] = await service.collect(WS, [owned], NOW)
    expect(Date.parse(facts!.missions!.latestAt!)).toBeLessThan(NOW.getTime())
  })

  it('#4067.4 — une mission encore ouverte garde sa fin prévue (à venir ⇒ en cours)', async () => {
    const { service } = await build({
      bench_has_rows: [{ bench_has_rows: true }],
      'FROM missions': [{ account_id: 'acc-1', count: '2', latest_open: '2026-11-30', latest_finished: '2026-11-15' }],
    })
    const [facts] = await service.collect(WS, [owned], NOW)
    expect(facts!.missions!.latestAt).toBe('2026-11-30')
  })

  // #4067.11 (#4286.15.d) — ce que la BASE COMMUNE sait de la société : des personnes nommées, en poste
  // et revues (c94 / #4286.15.b), comptées par SIREN, au périmètre de l'espace (démo ≠ réel). Un compte,
  // jamais un nom ; zéro = aucune clé.
  it('#4067.11 — compte les personnes ACTUELLES et revues que la base commune connaît, par SIREN', async () => {
    const { service, query } = await build({
      'FROM shared_company_people': [{ company_key: 'siren_552081317', people: 3 }],
    })
    const [first, second] = await service.collect(WS, [owned, fresh], NOW)
    expect(first?.sharedPeople).toBe(3)
    expect(second).not.toHaveProperty('sharedPeople')
    const call = query.mock.calls.find(([sql]) => String(sql).includes('FROM shared_company_people'))
    const sql = String(call?.[0])
    expect(sql).toContain("p.origin = 'bellum'")
    expect(sql).toContain("p.employment_state = 'current'")
    expect(sql).toMatch(/p\.last_seen_at >= now\(\) - make_interval/)
    expect(sql).toMatch(/is_demo/)
    expect(call?.[1]).toEqual([WS, ['siren_552081317', 'siren_999999999'], 365])
    expect(sql).not.toMatch(/full_name|linkedin_url|title/)
  })

  it('#4067.11 — NON : base commune en panne ⇒ aucune clé, les autres sources restent lues', async () => {
    const { service } = await build({
      'FROM shared_company_people': new Error('db down'),
      FROM_dataforge_never_matches: [],
    })
    const [first] = await service.collect(WS, [owned], NOW)
    expect(first).not.toHaveProperty('sharedPeople')
  })

  it('une source en panne rend « non mesuré » pour toute la page, sans faire tomber les autres', async () => {
    const { service } = await build({
      'FROM signal_history': new Error('db down'),
      'FROM dataforge_account_statuses': [{ siren: '552081317', statut_code: 'CIBLE_SECONDAIRE' }],
    })
    const [facts] = await service.collect(WS, [owned], NOW)
    expect(facts.signalHistory).toBeNull()
    expect(facts.dataforge).toEqual({ status: 'CIBLE_SECONDAIRE' })
  })

  // #4067 (reste) — l'IA coupe à `limit` sans connaître l'espace : l'API lui dit sur quels SIREN l'espace détient un fait.
  describe('spaceFactSirens', () => {
    it('lit en UNE requête les SIREN avec historique ou affaires CRM de l’ESPACE, bornés', async () => {
      const { service, query } = await build({
        'FROM signal_history': [{ siren: '552081317' }, { siren: '552 081 317 ' }, { siren: 'x' }, { siren: null }],
      })
      expect(await service.spaceFactSirens(WS, 50)).toEqual(['552081317'])
      expect(query).toHaveBeenCalledTimes(1)
      const [sql, params] = query.mock.calls[0]
      expect(String(sql)).toContain('FROM crm_deal_facts')
      expect(params).toEqual(expect.arrayContaining([WS, 50]))
    })

    it('sans cap valide ou sur panne : liste vide, jamais une erreur (non mesuré)', async () => {
      const down = await build({ 'FROM signal_history': new Error('db down') })
      expect(await down.service.spaceFactSirens(WS, 50)).toEqual([])
      const none = await build({})
      expect(await none.service.spaceFactSirens(WS, 0)).toEqual([])
      expect(none.query).not.toHaveBeenCalled()
    })
  })
})
