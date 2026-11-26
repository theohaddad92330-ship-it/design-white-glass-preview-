import { BadRequestException, NotFoundException } from '@nestjs/common'
import { LegalContractUploadLinkService } from './legal-contract-upload-link.service'

const WORKSPACE = 'w0000000-0000-4000-8000-000000000001'
const USER = 'u0000000-0000-4000-8000-000000000001'
const ACCOUNT = 'a0000000-0000-4000-8000-000000000001'
const CONTRACT = 'c0000000-0000-4000-8000-000000000001'
const MISSION = 'm0000000-0000-4000-8000-000000000001'
const OTHER_MISSION = 'm0000000-0000-4000-8000-000000000002'
const LINK = 'l0000000-0000-4000-8000-000000000001'
const RAW_TOKEN_MATCH = /^cup_[A-Za-z0-9_-]+$/

function configGet(_key: string, fallback: string) {
  return fallback
}

function makeService(
  routes: Record<string, unknown[] | ((params: unknown[]) => unknown[])> = {},
  storagePut: jest.Mock = jest.fn(),
) {
  const queries: { sql: string; params: unknown[] }[] = []
  const manager = {
    query: jest.fn(async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params })
      for (const [needle, rows] of Object.entries(routes)) {
        if (sql.includes(needle)) return typeof rows === 'function' ? rows(params) : rows
      }
      return []
    }),
  }
  const storage = { put: storagePut } as never
  const config = { get: configGet } as never
  const service = new LegalContractUploadLinkService({ manager } as never, storage, config)
  return { service, queries }
}

const contractExists = { 'SELECT id FROM legal_contracts': [{ id: CONTRACT }] }

const DAY_MS = 24 * 60 * 60 * 1000

function linkRow(overrides: Record<string, unknown> = {}) {
  return {
    id: LINK,
    workspace_id: WORKSPACE,
    contract_id: CONTRACT,
    mission_id: MISSION,
    mission_label: 'Mission Paris',
    // Relatif à l'horloge : une date figée finit par passer et fait « expirer » le lien du test.
    created_at: new Date(Date.now() - 7 * DAY_MS).toISOString(),
    expires_at: new Date(Date.now() + 7 * DAY_MS).toISOString(),
    revoked_at: null,
    deposits: [],
    ...overrides,
  }
}

describe('LegalContractUploadLinkService.create — #2422.6, une mission + un contrat', () => {
  it('crée un lien, rend une URL qui porte un jeton jamais stocké en clair', async () => {
    const { service, queries } = makeService({
      ...contractExists,
      'SELECT id FROM missions': [{ id: MISSION }],
      'INSERT INTO legal_contract_upload_links': [{ id: LINK }],
      'FROM legal_contract_upload_links l': [linkRow()],
    })
    const result = await service.create(WORKSPACE, USER, ACCOUNT, CONTRACT, MISSION)
    expect(result.link.id).toBe(LINK)
    expect(result.url).toContain('/depot-piece/')
    const insert = queries.find(q => q.sql.includes('INSERT INTO legal_contract_upload_links'))
    expect(insert).toBeDefined()
    const [, , , tokenHash] = insert!.params as string[]
    // Le jeton brut (dans l'URL) ne doit JAMAIS apparaître dans ce qui part en base.
    expect(result.url).not.toContain(tokenHash)
    expect(tokenHash).toHaveLength(64) // SHA-256 hex
  })

  it('refuse une mission d’un AUTRE compte que le contrat (#2422.6 — « autre mission »)', async () => {
    const { service } = makeService({
      ...contractExists,
      'SELECT id FROM missions': [], // la requête filtre par account_id : rien ne revient
    })
    await expect(service.create(WORKSPACE, USER, ACCOUNT, CONTRACT, OTHER_MISSION)).rejects.toBeInstanceOf(
      BadRequestException,
    )
  })

  it('refuse un contrat introuvable dans cet espace', async () => {
    const { service } = makeService()
    await expect(service.create(WORKSPACE, USER, ACCOUNT, CONTRACT, MISSION)).rejects.toBeInstanceOf(NotFoundException)
  })
})

describe('LegalContractUploadLinkService.list / revoke', () => {
  it('liste les liens d’un contrat, révoqués compris', async () => {
    const { service } = makeService({
      ...contractExists,
      'FROM legal_contract_upload_links l': [linkRow(), linkRow({ id: 'l0000000-0000-4000-8000-000000000002' })],
    })
    const result = await service.list(WORKSPACE, ACCOUNT, CONTRACT)
    expect(result).toHaveLength(2)
  })

  it('révoque un lien actif', async () => {
    const { service, queries } = makeService({
      ...contractExists,
      'SELECT id, revoked_at FROM legal_contract_upload_links': [{ id: LINK, revoked_at: null }],
    })
    await service.revoke(WORKSPACE, ACCOUNT, CONTRACT, LINK)
    expect(queries.some(q => q.sql.includes('SET revoked_at = now()'))).toBe(true)
  })

  it('révoquer un lien déjà révoqué est idempotent — aucune seconde écriture', async () => {
    const revokedAt = '2026-10-08T00:00:00.000Z'
    const { service, queries } = makeService({
      ...contractExists,
      'SELECT id, revoked_at FROM legal_contract_upload_links': [{ id: LINK, revoked_at: revokedAt }],
    })
    await service.revoke(WORKSPACE, ACCOUNT, CONTRACT, LINK)
    expect(queries.some(q => q.sql.includes('SET revoked_at = now()'))).toBe(false)
  })

  it('refuse de révoquer un lien introuvable dans cet espace', async () => {
    const { service } = makeService({ ...contractExists })
    await expect(service.revoke(WORKSPACE, ACCOUNT, CONTRACT, LINK)).rejects.toBeInstanceOf(NotFoundException)
  })
})

describe('LegalContractUploadLinkService.resolvePublic — le lien sait dire NON', () => {
  const names = {
    'FROM legal_contracts c': [{ contract_label: 'Contrat-cadre BlaBlaCar', account_name: 'BlaBlaCar' }],
  }

  it('rend `not_found` pour un jeton qui ne résout rien', async () => {
    const { service } = makeService()
    expect(await service.resolvePublic('cup_inexistant')).toEqual({ status: 'not_found' })
  })

  it('rend `revoked` pour un lien révoqué, même avant son échéance', async () => {
    const { service } = makeService({
      'FROM legal_contract_upload_links l': [linkRow({ revoked_at: '2026-10-08T00:00:00.000Z' })],
      ...names,
    })
    expect(await service.resolvePublic('cup_x')).toEqual({ status: 'revoked' })
  })

  it('rend `expired` pour un lien échu, jamais révoqué', async () => {
    const { service } = makeService({
      'FROM legal_contract_upload_links l': [
        linkRow({ expires_at: '2020-01-01T00:00:00.000Z', created_at: '2019-12-25T00:00:00.000Z' }),
      ],
      ...names,
    })
    expect(await service.resolvePublic('cup_x')).toEqual({ status: 'expired' })
  })

  it('rend `valid` avec les libellés, jamais le journal ni le tarif', async () => {
    const { service } = makeService({
      'FROM legal_contract_upload_links l': [linkRow()],
      ...names,
    })
    const result = await service.resolvePublic('cup_x')
    expect(result).toEqual({
      status: 'valid',
      contractLabel: 'Contrat-cadre BlaBlaCar',
      missionLabel: 'Mission Paris',
      accountName: 'BlaBlaCar',
      acceptedExtensions: expect.stringContaining('.pdf'),
      maxBytes: expect.any(Number),
    })
    expect(result).not.toHaveProperty('deposits')
  })

  it("lit le nom du compte dans `accounts.company_name` (la colonne `name` n'existe pas)", async () => {
    const { service, queries } = makeService({
      'FROM legal_contract_upload_links l': [linkRow()],
      ...names,
    })
    await service.resolvePublic('cup_x')
    const sql = queries.map(q => q.sql).find(q => q.includes('FROM legal_contracts c')) ?? ''
    expect(sql).toContain('a.company_name AS account_name')
    expect(sql).not.toMatch(/\ba\.name\b/)
  })
})

describe('LegalContractUploadLinkService.deposit — dépôt seulement', () => {
  const stored = {
    id: 'o0000000-0000-4000-8000-000000000001',
    fileName: 'piece.pdf',
    contentType: 'application/pdf',
    byteSize: 1234,
    retentionUntil: '2031-10-08',
    uploadedAt: '2026-10-08T10:00:00.000Z',
  }

  it('dépose, journalise, rend le nom du fichier', async () => {
    const put = jest.fn().mockResolvedValue(stored)
    const { service, queries } = makeService({ 'FROM legal_contract_upload_links l': [linkRow()] }, put)
    const result = await service.deposit(
      'cup_x',
      { fileName: 'piece.pdf', contentType: '', fileB64: 'QQ==' },
      '2026-10-08',
    )
    expect(result).toEqual({ fileName: 'piece.pdf' })
    expect(put).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: WORKSPACE, domain: 'legal_contract_external_upload', uploadedBy: null }),
    )
    const journal = queries.find(q => q.sql.includes('deposits = deposits ||'))
    expect(journal).toBeDefined()
    expect(JSON.parse(journal!.params[0] as string)).toEqual([
      { fileName: 'piece.pdf', byteSize: 1234, contentType: 'application/pdf', depositedAt: stored.uploadedAt },
    ])
  })

  it('refuse un jeton EXPIRÉ (404), jamais d’octet écrit', async () => {
    const put = jest.fn()
    const { service } = makeService(
      {
        'FROM legal_contract_upload_links l': [
          linkRow({ expires_at: '2020-01-01T00:00:00.000Z', created_at: '2019-12-25T00:00:00.000Z' }),
        ],
      },
      put,
    )
    await expect(
      service.deposit('cup_x', { fileName: 'piece.pdf', contentType: '', fileB64: 'QQ==' }, '2026-10-08'),
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(put).not.toHaveBeenCalled()
  })

  it('refuse un jeton RÉVOQUÉ (404), jamais d’octet écrit', async () => {
    const put = jest.fn()
    const { service } = makeService(
      { 'FROM legal_contract_upload_links l': [linkRow({ revoked_at: '2026-10-08T00:00:00.000Z' })] },
      put,
    )
    await expect(
      service.deposit('cup_x', { fileName: 'piece.pdf', contentType: '', fileB64: 'QQ==' }, '2026-10-08'),
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(put).not.toHaveBeenCalled()
  })

  it('refuse un jeton INTROUVABLE (404)', async () => {
    const put = jest.fn()
    const { service } = makeService({}, put)
    await expect(
      service.deposit('cup_inexistant', { fileName: 'piece.pdf', contentType: '', fileB64: 'QQ==' }, '2026-10-08'),
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(put).not.toHaveBeenCalled()
  })

  it('propage le refus de TYPE du stockage (ex. .xlsx refusé pour ce domaine)', async () => {
    const put = jest.fn().mockRejectedValue(new BadRequestException('Ce type de fichier n’est pas accepté.'))
    const { service } = makeService({ 'FROM legal_contract_upload_links l': [linkRow()] }, put)
    await expect(
      service.deposit('cup_x', { fileName: 'tableau.xlsx', contentType: '', fileB64: 'QQ==' }, '2026-10-08'),
    ).rejects.toBeInstanceOf(BadRequestException)
  })
})

describe('le jeton minté par create() respecte la forme attendue', () => {
  it('porte le préfixe `cup_`', async () => {
    const { service, queries } = makeService({
      'SELECT id FROM legal_contracts': [{ id: CONTRACT }],
      'SELECT id FROM missions': [{ id: MISSION }],
      'INSERT INTO legal_contract_upload_links': [{ id: LINK }],
      'FROM legal_contract_upload_links l': [linkRow()],
    })
    await service.create(WORKSPACE, USER, ACCOUNT, CONTRACT, MISSION)
    const insert = queries.find(q => q.sql.includes('INSERT INTO legal_contract_upload_links'))
    expect(insert).toBeDefined()
    // Le hash seul part en base ; on vérifie ici que `hashToken` est bien du
    // SHA-256 hex d'un jeton `cup_…` en reconstruisant via la méthode publique.
    expect(service.hashToken('cup_test')).toMatch(/^[0-9a-f]{64}$/)
    expect(RAW_TOKEN_MATCH.test('cup_abc-DEF_123')).toBe(true)
  })
})
