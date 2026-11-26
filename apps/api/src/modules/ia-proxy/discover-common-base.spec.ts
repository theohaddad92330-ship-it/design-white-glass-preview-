import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { AccountEntity } from '../../database/entities/account.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { SPACE_PAST_NEEDS_SOURCE } from './space-past-needs-source'
import { DiscoverSourcesService } from './discover-sources.service'

/**
 * #4793.1 / #4791.1 / #4791.2 / #4791.3 (Louis 31/10) — LA BASE COMMUNE FABRIQUE DES CANDIDATS.
 *
 * Elle ne lit QUE des tables partagées (comptes et besoins de la base commune, GA-16) : sa signature ne reçoit
 * aucun espace, et sa requête n'en nomme aucun. Le CRM, les comptes suivis, les notes de l'espace restent un
 * critère de RANG (`spaceFactSirens`, `baseAccountSirens`), jamais une source.
 */
type Row = Record<string, unknown>

async function build(rows: Row[] = [], fail = false) {
  const query = jest.fn(async (_sql: string, _params: unknown[]) => {
    if (fail) throw new Error('lecture en échec')
    return rows
  })
  const moduleRef = await Test.createTestingModule({
    providers: [
      DiscoverSourcesService,
      { provide: getRepositoryToken(AccountEntity), useValue: { manager: { query } } },
      { provide: getRepositoryToken(ContactEntity), useValue: { createQueryBuilder: () => ({}) } },
    ],
  }).compile()
  return { service: moduleRef.get(DiscoverSourcesService), query }
}

const row = (siren: string, needDate: string | null, label = 'Java') => ({
  siren,
  name: `Compte ${siren}`,
  city: 'Lille (59)',
  sector: 'Banque',
  naf_code: '64.19Z',
  need_label: label,
  need_date: needDate,
})

describe('#4793.1 — DiscoverSourcesService.commonBaseCandidates', () => {
  it('rend des CANDIDATS de la base commune, le besoin daté porté (récent OU historique)', async () => {
    const { service } = await build([row('700000001', '2019-03-12'), row('700000002', '2026-10-01')])
    const out = await service.commonBaseCandidates({ keywords: ['Java'], city: 'Lille' }, 100)
    expect(out).toEqual([
      {
        siren: '700000001',
        name: 'Compte 700000001',
        city: 'Lille (59)',
        sector: 'Banque',
        nafCode: '64.19Z',
        observedNeed: { label: 'Java', date: '2019-03-12' },
      },
      {
        siren: '700000002',
        name: 'Compte 700000002',
        city: 'Lille (59)',
        sector: 'Banque',
        nafCode: '64.19Z',
        observedNeed: { label: 'Java', date: '2026-10-01' },
      },
    ])
  })

  it('une ligne SANS date ne porte aucun besoin (on n’affiche pas ce qu’on n’a pas)', async () => {
    const { service } = await build([row('700000001', null)])
    const [only] = await service.commonBaseCandidates({ keywords: ['Java'] }, 10)
    expect(only).not.toHaveProperty('observedNeed')
  })

  it('n’ouvre AUCUN espace : la requête ne lit ni workspace_id, ni CRM, ni comptes suivis', async () => {
    const { service, query } = await build([row('700000001', '2025-03-01')])
    await service.commonBaseCandidates({ keywords: ['Java'], city: 'Lille' }, 10)
    const [sql, params] = query.mock.calls[0]
    expect(sql).toMatch(/dataforge_accounts/)
    expect(sql).not.toMatch(/workspace_id|crm_|\baccounts a\b|rag_documents|project_needs|signal_history/)
    expect(JSON.stringify(params)).not.toMatch(/ws-/)
    // La signature elle-même ne reçoit aucun espace.
    expect(service.commonBaseCandidates.length).toBe(2)
  })

  it('muette sans critère métier, secteur ni lieu — jamais « toute la base »', async () => {
    const { service, query } = await build([row('700000001', '2025-03-01')])
    expect(await service.commonBaseCandidates({}, 10)).toEqual([])
    expect(query).not.toHaveBeenCalled()
  })

  it('le secteur (NAF) suffit comme critère', async () => {
    const { service, query } = await build([row('700000001', '2025-03-01')])
    await service.commonBaseCandidates({ nafCode: '64.19Z,62.02A' }, 10)
    expect(query.mock.calls[0][1]).toEqual(expect.arrayContaining([['6419Z', '6202A']]))
  })

  it('un SIREN faux n’entre jamais ; un doublon de SIREN ne sort qu’une fois', async () => {
    const { service } = await build([
      row('12345', '2025-03-01'),
      row('700000001', '2025-03-01'),
      row('700000001', '2024-01-01'),
    ])
    const out = await service.commonBaseCandidates({ keywords: ['Java'] }, 10)
    expect(out.map(c => c.siren)).toEqual(['700000001'])
  })

  it('best-effort : une lecture en échec rend [] (Découvrir ne tombe jamais)', async () => {
    const { service } = await build([], true)
    expect(await service.commonBaseCandidates({ keywords: ['Java'] }, 10)).toEqual([])
  })
  // Cause de common_base=0 (lot R, 01/11) : la base ne porte que la VILLE (« Lille »), jamais « (59) » ; la requête
  // posait `%(59)%` pour une région/un département et ne rapprochait donc aucune ligne. Le département se tranche
  // maintenant en TypeScript par la table des communes (`cityInDepartments`).
  describe('lieu par région / département sur une base qui ne porte que la ville', () => {
    const cityRow = (siren: string, city: string) => ({ ...row(siren, '2025-03-01'), city })

    it('région 32 (Hauts-de-France) : Lille entre, Marseille jamais ; aucun motif « (59) » dans la requête', async () => {
      const { service, query } = await build([
        cityRow('700000001', 'Lille'),
        cityRow('700000002', 'Marseille'),
        cityRow('700000003', 'Lens'),
      ])
      const out = await service.commonBaseCandidates({ keywords: ['Java'], region: '32' }, 10)
      expect(out.map(c => c.siren)).toEqual(['700000001', '700000003'])
      const [, params] = query.mock.calls[0]
      expect(params[1]).toEqual([])
    })

    it('dix lignes compatibles ⇒ dix candidats (région 11)', async () => {
      const rows = Array.from({ length: 10 }, (_, i) => cityRow(`70000010${i}`, i % 2 ? 'Paris' : 'Nanterre'))
      const { service } = await build(rows)
      const out = await service.commonBaseCandidates({ keywords: ['Java'], region: '11' }, 50)
      expect(out).toHaveLength(10)
    })

    it('une ville sans département connu ne passe pas un filtre de département', async () => {
      const { service } = await build([cityRow('700000001', 'Villeinconnue')])
      expect(await service.commonBaseCandidates({ keywords: ['Java'], department: '59' }, 10)).toEqual([])
    })

    it('une ville libre (sans région) garde le rapprochement SQL', async () => {
      const { service, query } = await build([cityRow('700000001', 'Lille')])
      await service.commonBaseCandidates({ keywords: ['Java'], city: 'Lille' }, 10)
      expect(query.mock.calls[0][1][1]).toEqual(['%Lille%'])
    })
  })
})

/**
 * #5203 (lot 782) — période et nature des besoins : la requête les porte (aucune borne par défaut), la nature sort
 * quand la base la connaît, et les besoins passés de l'ESPACE ne sortent que du lecteur cloisonné.
 */
describe('#5203 — période et nature des besoins de la base commune', () => {
  it('par défaut : période « all », aucune nature — aucune borne d’âge', async () => {
    const { service, query } = await build([row('700000001', '2019-03-12')])
    await service.commonBaseCandidates({ keywords: ['Java'] }, 10)
    const params = query.mock.calls[0]![1] as unknown[]
    expect(params[5]).toBe('all')
    expect(params[7]).toEqual([])
  })

  it('« anciens » + nature mission : posées en paramètres, avec la borne de six mois', async () => {
    const { service, query } = await build([])
    await service.commonBaseCandidates(
      { keywords: ['Java'], needsPeriod: 'old', needsNature: ['mission'] },
      10,
      new Date('2026-11-03T00:00:00Z'),
    )
    const params = query.mock.calls[0]![1] as unknown[]
    expect(params[5]).toBe('old')
    expect(params[6]).toBe('2026-05-03')
    expect(params[7]).toEqual(['mission'])
  })

  it('la nature connue voyage avec le besoin ; aucun champ de personne ni de source', async () => {
    const { service } = await build([{ ...row('700000001', '2022-03-12'), need_nature: 'mission' }])
    const [candidate] = await service.commonBaseCandidates({ keywords: ['Java'] }, 10)
    expect(candidate?.observedNeed).toEqual({ label: 'Java', date: '2022-03-12', nature: 'mission' })
    expect(JSON.stringify(candidate)).not.toMatch(/dataforge|market|prescri|phone|email|linkedin/i)
  })

  it('besoins passés de l’espace : lus par le lecteur cloisonné avec L’ESPACE et le périmètre BU de l’appelant', async () => {
    const pastNeedsForWorkspace = jest.fn(async () => [
      {
        siren: '700000009',
        company_name: 'Compte Espace',
        headquarters: 'Lille',
        sector: null,
        lines: [{ type: 'besoin_passe', title: 'Dev Java', date: '2021-02-01' }],
      },
    ])
    const moduleRef = await Test.createTestingModule({
      providers: [
        DiscoverSourcesService,
        { provide: getRepositoryToken(AccountEntity), useValue: { manager: { query: jest.fn() } } },
        { provide: getRepositoryToken(ContactEntity), useValue: { createQueryBuilder: () => ({}) } },
        { provide: SPACE_PAST_NEEDS_SOURCE, useValue: { pastNeedsForWorkspace } },
      ],
    }).compile()
    const service = moduleRef.get(DiscoverSourcesService)
    const scope = { businessUnitIds: ['bu-1'] } as never
    const out = await service.spacePastNeedCandidates('ws-1', scope, { keywords: ['Java'] }, 10)
    expect(pastNeedsForWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: 'ws-1', businessUnitScope: scope }),
    )
    expect(out).toEqual([
      expect.objectContaining({
        siren: '700000009',
        fromSpace: true,
        observedNeed: { label: 'Dev Java', date: '2021-02-01', nature: 'mission' },
      }),
    ])
    // sans mot-clé : aucune lecture
    pastNeedsForWorkspace.mockClear()
    expect(await service.spacePastNeedCandidates('ws-1', scope, {}, 10)).toEqual([])
    expect(pastNeedsForWorkspace).not.toHaveBeenCalled()
  })

  it('lecture en échec : liste vide, jamais une panne', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        DiscoverSourcesService,
        { provide: getRepositoryToken(AccountEntity), useValue: { manager: { query: jest.fn() } } },
        { provide: getRepositoryToken(ContactEntity), useValue: { createQueryBuilder: () => ({}) } },
        {
          provide: SPACE_PAST_NEEDS_SOURCE,
          useValue: {
            pastNeedsForWorkspace: jest.fn(async () => {
              throw new Error('boom')
            }),
          },
        },
      ],
    }).compile()
    expect(
      await moduleRef
        .get(DiscoverSourcesService)
        .spacePastNeedCandidates('ws-1', null as never, { keywords: ['Java'] }, 5),
    ).toEqual([])
  })
})
