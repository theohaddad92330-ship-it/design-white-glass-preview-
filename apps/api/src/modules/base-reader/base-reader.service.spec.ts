import type { Repository } from 'typeorm'
import type { BaseReaderCriteria } from '@bellum/contracts'
import type { AccountEntity } from '../../database/entities/account.entity'
import { BASE_READER_DEFAULT_LIMIT, BASE_READER_MAX_LIMIT } from './base-reader.limits'
import { BaseReaderService, type BaseReaderScope } from './base-reader.service'

/**
 * #4792 — le lecteur commun de la base, et surtout ce qu'il REFUSE.
 *
 * ⚠️ « Un paramètre d'API inconnu est avalé par Zod sans erreur, et la liste revient entière » : chaque
 * filtre est donc prouvé par DEUX valeurs différentes ET un cas vide — un filtre qui ne filtre rien
 * rendrait la base entière sous un libellé qui promet le contraire.
 */

const WS = 'ws-1'
const OTHER_WS = 'ws-2'
const ACCOUNT = '11111111-1111-4111-8111-111111111111'
const CONSULTANT = '22222222-2222-4222-8222-222222222222'
const BU = '33333333-3333-4333-8333-333333333333'

const criteria = (over: Partial<BaseReaderCriteria> = {}): BaseReaderCriteria => ({
  terms: [],
  city: null,
  departments: [],
  regions: [],
  from: null,
  to: null,
  families: [],
  accountIds: [],
  limit: BASE_READER_DEFAULT_LIMIT,
  offset: 0,
  ...over,
})

const scope = (over: Partial<BaseReaderScope> = {}): BaseReaderScope => ({
  workspaceId: WS,
  businessUnitScope: null,
  ...over,
})

/**
 * Le double de base. Il ne REJOUE pas le SQL — c'est la requête qui filtre, et c'est elle qu'on
 * inspecte : le texte envoyé et ses paramètres. Ce que la base rend est fourni par le test.
 */
function serviceOf(answers: unknown[][] = [[], [], []]) {
  const query = jest.fn()
  for (const answer of answers) query.mockResolvedValueOnce(answer)
  query.mockResolvedValue([])
  const repo = { manager: { query } } as unknown as Repository<AccountEntity>
  const service = new BaseReaderService(repo)
  jest.spyOn(service['logger'], 'log').mockImplementation()
  return { service, query }
}

/** Les requêtes envoyées, par famille (l'ordre des trois lectures parallèles est celui de `read`). */
const sqlOf = (query: jest.Mock, index: number): string => String(query.mock.calls[index]?.[0] ?? '')
const paramsOf = (query: jest.Mock, index: number): unknown[] => (query.mock.calls[index]?.[1] ?? []) as unknown[]

// ── Le cloisonnement : le REFUS ───────────────────────────────────────────────

describe('#4792 — le périmètre', () => {
  it('sans espace, le lecteur LÈVE : il ne lit jamais sans borne (GA-380)', async () => {
    const { service, query } = serviceOf()
    await expect(service.read(scope({ workspaceId: '' }), criteria())).rejects.toThrow('base_reader_requires_workspace')
    expect(query).not.toHaveBeenCalled()
  })

  it('CHAQUE requête des trois familles porte workspace_id = $1, avec l’espace du demandeur', async () => {
    const { service, query } = serviceOf()
    await service.read(scope(), criteria())
    expect(query).toHaveBeenCalledTimes(3)
    for (let index = 0; index < 3; index += 1) {
      expect(sqlOf(query, index)).toContain('workspace_id = $1')
      expect(paramsOf(query, index)[0]).toBe(WS)
    }
  })

  it('les critères d’un AUTRE espace rendent zéro ligne : la borne part avec l’espace demandé', async () => {
    const { service, query } = serviceOf()
    const result = await service.read(scope({ workspaceId: OTHER_WS }), criteria({ terms: ['Java'], city: 'Lille' }))
    for (let index = 0; index < 3; index += 1) expect(paramsOf(query, index)[0]).toBe(OTHER_WS)
    expect(result.accounts?.total).toBe(0)
    expect(result.accounts?.rows).toEqual([])
    expect(result.needs?.rows).toEqual([])
    expect(result.consultants?.rows).toEqual([])
  })

  it('le périmètre de BU s’AJOUTE à la borne d’espace, il ne la remplace jamais', async () => {
    const { service, query } = serviceOf()
    await service.read(scope({ businessUnitScope: { businessUnitIds: [BU], includeUnassigned: true } }), criteria())
    const sql = sqlOf(query, 0)
    expect(sql).toContain('workspace_id = $1')
    expect(sql).toContain('a.business_unit_id IN (SELECT unnest(')
    expect(sql).toContain('a.business_unit_id IS NULL')
    expect(paramsOf(query, 0)).toEqual(expect.arrayContaining([[BU]]))
  })

  it('aucun périmètre porté n’est pas « voit tout » : la clause devient IS NULL', async () => {
    const { service, query } = serviceOf()
    await service.read(scope({ businessUnitScope: { businessUnitIds: [], includeUnassigned: true } }), criteria())
    expect(sqlOf(query, 0)).toContain('a.business_unit_id IS NULL')
    expect(sqlOf(query, 0)).not.toContain('a.business_unit_id IN (')
  })

  it('les consultants ne portent AUCUNE colonne de périmètre : aucune clause de BU n’est simulée', async () => {
    const { service, query } = serviceOf()
    await service.read(scope({ businessUnitScope: { businessUnitIds: [BU], includeUnassigned: true } }), criteria())
    expect(sqlOf(query, 2)).toContain('c.workspace_id = $1')
    expect(sqlOf(query, 2)).not.toContain('business_unit_id')
  })
})

// ── Chaque filtre : deux valeurs, et un cas vide ──────────────────────────────

describe('#4792 — chaque filtre filtre vraiment', () => {
  it('le TERME part en motif échappé, deux valeurs font deux motifs, aucune n’en fait aucun', async () => {
    const { service, query } = serviceOf()
    await service.read(scope(), criteria({ terms: ['Java', 'Kubernetes'] }))
    expect(paramsOf(query, 1)).toEqual(expect.arrayContaining([['%Java%', '%Kubernetes%']]))
    expect(sqlOf(query, 1)).toContain('n.title ILIKE ANY(')

    const empty = serviceOf()
    await empty.service.read(scope(), criteria({ terms: [] }))
    expect(sqlOf(empty.query, 1)).not.toContain('ILIKE ANY(')
  })

  it('un joker tapé par une personne n’est jamais un joker SQL', async () => {
    const { service, query } = serviceOf()
    await service.read(scope(), criteria({ terms: ['100%_java'] }))
    expect(paramsOf(query, 1)).toEqual(expect.arrayContaining([['%100\\%\\_java%']]))
  })

  it('un terme d’un seul caractère est écarté : « a » n’est pas une réponse', async () => {
    const { service, query } = serviceOf()
    await service.read(scope(), criteria({ terms: ['a'] }))
    expect(sqlOf(query, 1)).not.toContain('ILIKE ANY(')
  })

  it('le LIEU : une ville part en texte, un département CODE part parenthésé, deux lieux font deux motifs', async () => {
    const { service, query } = serviceOf()
    await service.read(scope(), criteria({ city: 'Lille', departments: ['59'], regions: ['Hauts-de-France'] }))
    expect(paramsOf(query, 0)).toEqual(expect.arrayContaining([['%Lille%', '%(59)%', '%Hauts-de-France%']]))
    expect(sqlOf(query, 0)).toContain('a.headquarters')

    const empty = serviceOf()
    await empty.service.read(scope(), criteria())
    expect(sqlOf(empty.query, 0)).not.toContain("a.headquarters,'') ILIKE ANY(")
  })

  it('la PÉRIODE borne la date de COLLECTE, des deux côtés, et sans période aucune fenêtre n’est posée', async () => {
    const { service, query } = serviceOf()
    await service.read(scope(), criteria({ from: '2026-01-01', to: '2026-06-30' }))
    expect(sqlOf(query, 1)).toContain('>= $')
    expect(sqlOf(query, 1)).toContain('<= $')
    expect(paramsOf(query, 1)).toContain('2026-01-01T00:00:00.000Z')

    const empty = serviceOf()
    await empty.service.read(scope(), criteria())
    // Aucune fenêtre par défaut : c'est le défaut de Découvrir que ce lot répare.
    expect(sqlOf(empty.query, 1)).not.toContain('timestamptz')
  })

  it('une date illisible est IGNORÉE, jamais transformée en « maintenant »', async () => {
    const { service, query } = serviceOf()
    await service.read(scope(), criteria({ from: 'hier matin' }))
    expect(sqlOf(query, 1)).not.toContain('timestamptz')
  })

  it('les comptes demandés bornent la lecture ; aucun compte demandé ne borne rien', async () => {
    const { service, query } = serviceOf()
    await service.read(scope(), criteria({ accountIds: [ACCOUNT] }))
    expect(sqlOf(query, 0)).toContain('a.id = ANY(')
    expect(paramsOf(query, 0)).toEqual(expect.arrayContaining([[ACCOUNT]]))

    const empty = serviceOf()
    await empty.service.read(scope(), criteria())
    expect(sqlOf(empty.query, 0)).not.toContain('a.id = ANY(')
  })

  it('une famille non demandée est ABSENTE de la réponse — jamais une famille vide', async () => {
    const { service, query } = serviceOf()
    const result = await service.read(scope(), criteria({ families: ['needs'] }))
    expect(query).toHaveBeenCalledTimes(1)
    expect(result.needs).toBeDefined()
    expect(result.accounts).toBeUndefined()
    expect(result.consultants).toBeUndefined()
  })
})

// ── La pagination : vraie ─────────────────────────────────────────────────────

describe('#4792 — la pagination', () => {
  const needRow = (index: number) => ({
    need_id: `need-${index}`,
    account_id: ACCOUNT,
    account_name: 'Client Exemple',
    title: `Développeur Java ${index}`,
    skills: ['Java'],
    place: 'Lille (59)',
    status: 'to_qualify',
    source: 'registered_need',
    collected_at: new Date('2026-05-01T10:00:00.000Z'),
    total: 3_600,
  })

  it('`total` vient de la base, pas de la page : 80 lignes rendues sur 3 600 le disent', async () => {
    const rows = Array.from({ length: 80 }, (_, index) => needRow(index))
    const { service } = serviceOf([rows])
    const result = await service.read(scope(), criteria({ families: ['needs'], limit: 80 }))
    expect(result.needs?.total).toBe(3_600)
    expect(result.needs?.rows).toHaveLength(80)
    expect(result.needs?.hasMore).toBe(true)
  })

  it('la 501e ligne est atteignable sans réécrire la requête : l’offset voyage jusqu’au SQL', async () => {
    const { service, query } = serviceOf([[needRow(0)]])
    const result = await service.read(scope(), criteria({ families: ['needs'], limit: 100, offset: 500 }))
    expect(sqlOf(query, 0)).toContain('OFFSET $')
    expect(paramsOf(query, 0)).toContain(500)
    expect(result.needs?.offset).toBe(500)
  })

  it('une limite absurde est RAMENÉE au plafond nommé, jamais acceptée', async () => {
    const { service, query } = serviceOf([[needRow(0)]])
    const result = await service.read(scope(), criteria({ families: ['needs'], limit: 10_000 }))
    expect(paramsOf(query, 0)).toContain(BASE_READER_MAX_LIMIT)
    expect(result.needs?.limit).toBe(BASE_READER_MAX_LIMIT)
  })

  it('la dernière page dit qu’il ne reste rien', async () => {
    const rows = [
      { ...needRow(0), total: 2 },
      { ...needRow(1), total: 2 },
    ]
    const { service } = serviceOf([rows])
    const result = await service.read(scope(), criteria({ families: ['needs'] }))
    expect(result.needs?.hasMore).toBe(false)
  })
})

// ── Chaque ligne porte sa source et sa date de collecte ───────────────────────

describe('#4792 — source et date de collecte sur chaque ligne', () => {
  it('un besoin ENREGISTRÉ et une offre COLLECTÉE ne se confondent pas, et chacun date', async () => {
    const rows = [
      {
        need_id: 'need-1',
        account_id: ACCOUNT,
        account_name: 'Client Exemple',
        title: 'Architecte de plateforme',
        skills: ['Kubernetes', 'Terraform'],
        place: 'Lyon',
        status: 'to_match',
        source: 'registered_need',
        collected_at: new Date('2026-04-02T08:00:00.000Z'),
        total: 2,
      },
      {
        need_id: null,
        account_id: ACCOUNT,
        account_name: 'Client Exemple',
        title: 'Recrutement : 3 développeurs Java',
        skills: [],
        place: 'Lille (59)',
        status: null,
        source: 'collected_offer',
        collected_at: new Date('2026-03-01T08:00:00.000Z'),
        total: 2,
      },
    ]
    const { service } = serviceOf([rows])
    const result = await service.read(scope(), criteria({ families: ['needs'] }))
    expect(result.needs?.rows[0]).toMatchObject({
      source: 'registered_need',
      collectedAt: '2026-04-02T08:00:00.000Z',
      needId: 'need-1',
      skills: ['Kubernetes', 'Terraform'],
      status: 'to_match',
    })
    expect(result.needs?.rows[1]).toMatchObject({
      source: 'collected_offer',
      collectedAt: '2026-03-01T08:00:00.000Z',
      needId: null,
      status: null,
    })
  })

  it('une valeur absente vaut `null`, jamais « 0 » ni une chaîne vide (GA-18 / GA-19)', async () => {
    const rows = [
      {
        id: ACCOUNT,
        company_name: 'Client Exemple',
        sector: '   ',
        place: null,
        siren: null,
        business_unit_id: null,
        collected_at: null,
        total: 1,
      },
    ]
    const { service } = serviceOf([rows])
    const result = await service.read(scope(), criteria({ families: ['accounts'] }))
    expect(result.accounts?.rows[0]).toMatchObject({
      sector: null,
      place: null,
      siren: null,
      businessUnitId: null,
      collectedAt: null,
      source: 'account_record',
    })
  })

  it('un consultant trouvé PAR UNE EXPÉRIENCE le dit, et nomme laquelle', async () => {
    const rows = [
      {
        id: CONSULTANT,
        full_name: 'Nom Exemple',
        title: 'Data engineer',
        place: 'Lille',
        zones: ['59', 'Hauts-de-France'],
        skills: ['Java'],
        source: 'consultant_experience',
        experience_client: 'Client Exemple',
        experience_role: 'Développeur Java',
        experience_from: '2023-01-01',
        experience_to: '2024-06-30',
        collected_at: new Date('2026-02-01T08:00:00.000Z'),
        total: 1,
      },
    ]
    const { service } = serviceOf([rows])
    const result = await service.read(scope(), criteria({ families: ['consultants'], terms: ['Java'] }))
    expect(result.consultants?.rows[0]).toMatchObject({
      source: 'consultant_experience',
      collectedAt: '2026-02-01T08:00:00.000Z',
      experience: { client: 'Client Exemple', role: 'Développeur Java', from: '2023-01-01', to: '2024-06-30' },
    })
  })
})

// ── Le consentement borne les personnes ──────────────────────────────────────

describe('#4792 — les personnes', () => {
  it('une fiche archivée, sans consentement ou expiré ne fait AUCUNE ligne', async () => {
    const { service, query } = serviceOf()
    await service.read(scope(), criteria({ families: ['consultants'] }))
    const sql = sqlOf(query, 0)
    expect(sql).toContain('c.archived_at IS NULL')
    expect(sql).toContain('c.consent_given_at IS NOT NULL')
    expect(sql).toContain('c.consent_expires_at IS NULL OR c.consent_expires_at > now()')
  })

  it('une expérience dont le client est masqué n’est jamais rapprochée', async () => {
    const { service, query } = serviceOf()
    await service.read(scope(), criteria({ families: ['consultants'], terms: ['Java'] }))
    expect(sqlOf(query, 0)).toContain('e.client_masked = false')
  })

  it('sans terme demandé, aucune expérience n’est jointe — rien ne se dit « trouvé par expérience »', async () => {
    const { service, query } = serviceOf()
    await service.read(scope(), criteria({ families: ['consultants'] }))
    expect(sqlOf(query, 0)).not.toContain('consultant_experiences')
  })
})

// ── Le journal ne fuit rien ──────────────────────────────────────────────────

describe('#4792 — le journal', () => {
  it('journalise des NOMBRES, jamais un nom de compte ni un intitulé de besoin', async () => {
    const rows = [
      {
        need_id: 'need-1',
        account_id: ACCOUNT,
        account_name: 'Client Confidentiel',
        title: 'Architecte secret',
        skills: [],
        place: null,
        status: null,
        source: 'registered_need',
        collected_at: null,
        total: 1,
      },
    ]
    const { service } = serviceOf([rows])
    const log = jest.spyOn(service['logger'], 'log')
    await service.read(scope(), criteria({ families: ['needs'], terms: ['architecte'] }))
    const line = String(log.mock.calls.at(-1)?.[0])
    expect(line).toContain('base_reader.read')
    expect(line).toContain('needs=1')
    expect(line).not.toContain('Client Confidentiel')
    expect(line).not.toContain('Architecte secret')
    expect(line).not.toContain('architecte')
  })
})

describe('#4792 — le lieu sous ses deux formes', () => {
  it('un code de département rapproche la PHRASE et le JETON — « Lyon (69) » comme « 69 »', async () => {
    const { service, query } = serviceOf()
    await service.read(scope(), criteria({ families: ['consultants'], departments: ['69'] }))
    const sql = sqlOf(query, 0)
    // La phrase : le motif parenthésé, celui que le dépôt écrit (« Lyon (69) »).
    expect(sql).toContain("COALESCE(c.location,'') ILIKE ANY(")
    // Le jeton : l'égalité, parce que `zones` porte « 69 » tout court.
    expect(sql).toContain('upper(z) = ANY(')
    expect(paramsOf(query, 0)).toEqual(expect.arrayContaining([['%(69)%'], ['69']]))
  })

  it('une ville n’invente aucun code : la liste de jetons part vide', async () => {
    const { service, query } = serviceOf()
    await service.read(scope(), criteria({ families: ['consultants'], city: 'Lille' }))
    expect(paramsOf(query, 0)).toEqual(expect.arrayContaining([['%Lille%'], []]))
  })
})

describe('#4792 — « qui a bossé à Lille ? » : le lieu d’une MISSION réalisée', () => {
  it('le lieu demandé rapproche aussi une mission réalisée, et la ligne dit laquelle', async () => {
    const { service, query } = serviceOf()
    await service.read(scope(), criteria({ families: ['consultants'], city: 'Lille' }))
    const sql = sqlOf(query, 0)
    // La mission la plus récente qui correspond, par le lieu de l'affectation puis celui de la mission.
    expect(sql).toContain('FROM mission_assignments ma')
    expect(sql).toContain('JOIN missions mi ON mi.id = ma.mission_id AND mi.workspace_id = $1')
    expect(sql).toContain('ma.work_location')
    expect(sql).toContain('mp.place IS NOT NULL')
  })

  it('sans lieu demandé, aucune mission n’est jointe et la ligne ne prétend rien', async () => {
    const { service, query } = serviceOf()
    await service.read(scope(), criteria({ families: ['consultants'], terms: ['Java'] }))
    expect(sqlOf(query, 0)).not.toContain('mission_assignments')
  })

  it('une mobilité DÉCLARÉE n’est pas une mission faite : `missionPlace` reste `null`', async () => {
    const rows = [
      {
        id: CONSULTANT,
        full_name: 'Nom Exemple',
        title: 'Développeur',
        place: 'Paris',
        zones: ['59'],
        skills: ['Java'],
        source: 'consultant_record',
        experience_client: null,
        experience_role: null,
        experience_from: null,
        experience_to: null,
        mission_place: null,
        collected_at: new Date('2026-02-01T08:00:00.000Z'),
        total: 1,
      },
    ]
    const { service } = serviceOf([rows])
    const result = await service.read(scope(), criteria({ families: ['consultants'], departments: ['59'] }))
    expect(result.consultants?.rows[0]?.missionPlace).toBeNull()
    expect(result.consultants?.rows[0]?.zones).toEqual(['59'])
  })

  it('…et quand elle vient d’une mission, le lieu de la mission est NOMMÉ', async () => {
    const rows = [
      {
        id: CONSULTANT,
        full_name: 'Nom Exemple',
        title: 'Développeur Java',
        place: 'Paris',
        zones: [],
        skills: ['Java'],
        source: 'consultant_record',
        experience_client: null,
        experience_role: null,
        experience_from: null,
        experience_to: null,
        mission_place: 'Lille (59)',
        collected_at: new Date('2026-02-01T08:00:00.000Z'),
        total: 1,
      },
    ]
    const { service } = serviceOf([rows])
    const result = await service.read(scope(), criteria({ families: ['consultants'], city: 'Lille' }))
    expect(result.consultants?.rows[0]?.missionPlace).toBe('Lille (59)')
  })
})

// ── #4793.3 — AUCUN paramètre poussé et non référencé ────────────────────────

describe('#4793.3 — chaque paramètre envoyé est référencé par le SQL', () => {
  // Postgres refuse « could not determine data type of parameter $n » pour un paramètre qui n'apparaît
  // dans aucune expression : c'est ce qui rendait la source `base_reader` illisible en production.
  const scopes: Array<[string, BaseReaderScope]> = [
    ['sans périmètre de BU', scope()],
    ['BU sans aucune unité', scope({ businessUnitScope: { businessUnitIds: [], includeUnassigned: true } })],
    ['BU avec unités', scope({ businessUnitScope: { businessUnitIds: [BU], includeUnassigned: true } })],
  ]
  it.each(scopes)('%s', async (_label, s) => {
    const { service, query } = serviceOf()
    await service.read(s, criteria({ terms: ['Java'], city: 'Lyon', from: '2026-01-01', to: '2026-02-01' }))
    expect(query).toHaveBeenCalled()
    for (let i = 0; i < query.mock.calls.length; i++) {
      const sql = sqlOf(query, i)
      paramsOf(query, i).forEach((_v, n) => {
        expect(sql).toMatch(new RegExp(`\\$${n + 1}(?![0-9])`))
      })
    }
  })
})

// ── #4794 — « comptes qui prennent des développeurs » : les ESN ne sont pas des utilisateurs ──────────

describe('#4794 — excludeEsn écarte les ESN franches des comptes ET des besoins', () => {
  it('sans le critère, aucune requête ne regarde le code d’activité', async () => {
    const { service, query } = serviceOf()
    await service.read(scope(), criteria())
    for (let index = 0; index < 3; index += 1) expect(sqlOf(query, index)).not.toContain('naf_code')
  })

  it('avec le critère, comptes et besoins excluent l’ESN franche ; les consultants ne sont pas touchés', async () => {
    const { service, query } = serviceOf()
    await service.read(scope(), criteria({ excludeEsn: true }))
    expect(sqlOf(query, 0)).toContain('a.naf_code')
    expect(sqlOf(query, 1)).toContain('a.naf_code')
    expect(sqlOf(query, 2)).not.toContain('naf_code')
  })

  it('un code absent ne fait pas une ESN : la clause garde les comptes sans code', async () => {
    const { service, query } = serviceOf()
    await service.read(scope(), criteria({ excludeEsn: true, families: ['accounts'] }))
    expect(sqlOf(query, 0)).toMatch(/a\.naf_code IS NULL/)
  })
})
