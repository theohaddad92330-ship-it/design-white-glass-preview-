import { BadRequestException, NotFoundException } from '@nestjs/common'
import { LegalContractService } from './legal-contract.service'

const WORKSPACE = 'w0000000-0000-4000-8000-000000000001'
const USER = 'u0000000-0000-4000-8000-000000000001'
const ACCOUNT = 'a0000000-0000-4000-8000-000000000001'
const CONTRACT = 'c0000000-0000-4000-8000-000000000001'

function makeService(routes: Record<string, unknown[]> = {}) {
  const queries: { sql: string; params: unknown[] }[] = []
  const manager = {
    query: jest.fn(async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params })
      for (const [needle, rows] of Object.entries(routes)) if (sql.includes(needle)) return rows
      return []
    }),
  }
  return { service: new LegalContractService({ manager } as never), queries }
}

const VIEWER = { userId: USER, canReadFinance: false }

const accountExists = { 'SELECT id FROM accounts': [{ id: ACCOUNT }] }

const fakeRow = (overrides: Record<string, unknown> = {}) => ({
  id: CONTRACT,
  workspace_id: WORKSPACE,
  account_id: ACCOUNT,
  type: 'framework',
  label: 'Contrat-cadre 2026',
  counterparty_name: 'Client SA',
  legal_entity_id: null,
  legal_entity_name: null,
  owner_id: null,
  owner_first_name: null,
  owner_last_name: null,
  owner_email: null,
  starts_on: '2026-01-01',
  ends_on: null,
  scope: null,
  tariff_note: null,
  volume_note: null,
  cap_amount_cents: null,
  payment_terms_days: null,
  payment_terms_basis: null,
  notice_days: null,
  auto_renew: false,
  documents: [],
  source: 'unknown',
  status: 'draft',
  confidential: false,
  created_at: '2026-09-27T08:00:00Z',
  updated_at: '2026-09-27T08:00:00Z',
  ...overrides,
})

describe('LegalContractService — #2422.4 lister les contrats d’un compte', () => {
  it('rend la liste avec le cycle de vie DÉRIVÉ', async () => {
    const { service } = makeService({
      ...accountExists,
      'FROM legal_contracts': [fakeRow({ status: 'signed', starts_on: '2020-01-01', ends_on: '2020-12-31' })],
    })
    const result = await service.list(WORKSPACE, ACCOUNT, VIEWER)
    expect(result).toHaveLength(1)
    expect(result[0].lifecycle).toBe('expired')
  })

  it('refuse un compte introuvable dans l’espace (404)', async () => {
    const { service } = makeService()
    await expect(service.list(WORKSPACE, ACCOUNT, VIEWER)).rejects.toBeInstanceOf(NotFoundException)
  })

  it('résout le nom du propriétaire depuis `profiles`, jamais un id brut', async () => {
    const { service } = makeService({
      ...accountExists,
      'FROM legal_contracts': [fakeRow({ owner_id: USER, owner_first_name: 'Ada', owner_last_name: 'Lovelace' })],
    })
    const [row] = await service.list(WORKSPACE, ACCOUNT, VIEWER)
    expect(row.ownerName).toBe('Ada Lovelace')
  })
})

describe('LegalContractService.list — #2422.11 NO-GO, croisé avec les missions du compte', () => {
  const MISSION = 'm0000000-0000-4000-8000-000000000001'
  const ENTITY_A = 'e0000000-0000-4000-8000-000000000001'
  const ENTITY_B = 'e0000000-0000-4000-8000-000000000002'

  it('signale `wrong_legal_entity` quand la mission facture sous une AUTRE société que le contrat', async () => {
    const { service } = makeService({
      ...accountExists,
      'FROM legal_contracts': [fakeRow({ legal_entity_id: ENTITY_A })],
      'FROM missions m': [{ id: MISSION, label: 'Mission A', legal_entity_id: ENTITY_B, channel: 'direct' }],
    })
    const [row] = await service.list(WORKSPACE, ACCOUNT, VIEWER)
    expect(row.noGo).toEqual([{ missionId: MISSION, missionLabel: 'Mission A', reason: 'wrong_legal_entity' }])
  })

  it('signale `partner_skipped` quand le contrat passe par un partenaire mais la mission facture en DIRECT', async () => {
    const { service } = makeService({
      ...accountExists,
      'FROM legal_contracts': [fakeRow({ source: 'partner' })],
      'FROM missions m': [{ id: MISSION, label: 'Mission A', legal_entity_id: null, channel: 'direct' }],
    })
    const [row] = await service.list(WORKSPACE, ACCOUNT, VIEWER)
    expect(row.noGo).toEqual([{ missionId: MISSION, missionLabel: 'Mission A', reason: 'partner_skipped' }])
  })

  it('TÉMOIN — ne signale RIEN quand rien ne cloche, ou que la donnée manque des deux côtés', async () => {
    const { service } = makeService({
      ...accountExists,
      'FROM legal_contracts': [fakeRow()],
      'FROM missions m': [{ id: MISSION, label: 'Mission A', legal_entity_id: null, channel: null }],
    })
    const [row] = await service.list(WORKSPACE, ACCOUNT, VIEWER)
    expect(row.noGo).toEqual([])
  })

  it('ne rend RIEN sur un compte sans mission — jamais une requête de plus pour rien', async () => {
    const { service, queries } = makeService({ ...accountExists, 'FROM legal_contracts': [] })
    const result = await service.list(WORKSPACE, ACCOUNT, VIEWER)
    expect(result).toEqual([])
    expect(queries.some(q => q.sql.includes('FROM missions m'))).toBe(false)
  })
})

describe('LegalContractService — #2422.4 créer un contrat', () => {
  it('insère le contrat, borné à l’espace et au compte, puis le relit avec ses jointures', async () => {
    const { service, queries } = makeService({
      ...accountExists,
      'INSERT INTO legal_contracts': [{ id: CONTRACT }],
      'FROM legal_contracts': [fakeRow()],
    })
    const result = await service.create(WORKSPACE, USER, ACCOUNT, {
      type: 'framework',
      label: 'Contrat-cadre 2026',
      counterpartyName: 'Client SA',
      legalEntityId: null,
      ownerId: null,
      startsOn: null,
      endsOn: null,
      scope: null,
      tariffNote: null,
      volumeNote: null,
      capAmountCents: null,
      paymentTermsDays: null,
      paymentTermsBasis: null,
      noticeDays: null,
      autoRenew: false,
      source: 'unknown',
      status: 'draft',
      confidential: false,
    })
    expect(result.label).toBe('Contrat-cadre 2026')
    const insert = queries.find(q => q.sql.includes('INSERT INTO legal_contracts'))
    expect(insert?.params[0]).toBe(WORKSPACE)
    expect(insert?.params[1]).toBe(ACCOUNT)
    expect(insert?.params.at(-1)).toBe(USER)
  })

  it('refuse un compte introuvable dans l’espace (404), sans écrire', async () => {
    const { service, queries } = makeService()
    await expect(
      service.create(WORKSPACE, USER, ACCOUNT, {
        type: 'framework',
        label: 'Contrat-cadre 2026',
        counterpartyName: 'Client SA',
        legalEntityId: null,
        ownerId: null,
        startsOn: null,
        endsOn: null,
        scope: null,
        tariffNote: null,
        volumeNote: null,
        capAmountCents: null,
        paymentTermsDays: null,
        paymentTermsBasis: null,
        noticeDays: null,
        autoRenew: false,
        source: 'unknown',
        status: 'draft',
        confidential: false,
      }),
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(queries.some(q => q.sql.includes('INSERT INTO legal_contracts'))).toBe(false)
  })
})

describe('LegalContractService.reassignOwner — #2422.5 chaîne contractuelle rang 2', () => {
  const NEW_OWNER = 'u0000000-0000-4000-8000-000000000002'

  it('réattribue le propriétaire quand il appartient à l’espace', async () => {
    const { service, queries } = makeService({
      ...accountExists,
      'FROM workspace_members': [{ user_id: NEW_OWNER }],
      'UPDATE legal_contracts': [{ id: CONTRACT }],
      'FROM legal_contracts': [fakeRow({ owner_id: NEW_OWNER, owner_first_name: 'Ada', owner_last_name: 'Lovelace' })],
    })
    const result = await service.reassignOwner(WORKSPACE, ACCOUNT, CONTRACT, NEW_OWNER, VIEWER)
    expect(result.ownerName).toBe('Ada Lovelace')
    const update = queries.find(q => q.sql.includes('UPDATE legal_contracts'))
    expect(update?.params).toEqual([NEW_OWNER, CONTRACT, ACCOUNT, WORKSPACE])
  })

  it('retire le propriétaire avec `ownerId: null` — jamais un état à part', async () => {
    const { service, queries } = makeService({
      ...accountExists,
      'UPDATE legal_contracts': [{ id: CONTRACT }],
      'FROM legal_contracts': [fakeRow({ owner_id: null })],
    })
    await service.reassignOwner(WORKSPACE, ACCOUNT, CONTRACT, null, VIEWER)
    // Aucune vérification d'appartenance à l'espace n'est tentée sur `null`.
    expect(queries.some(q => q.sql.includes('FROM workspace_members'))).toBe(false)
  })

  it('refuse un propriétaire qui n’appartient pas à l’espace — n’écrit RIEN', async () => {
    const { service, queries } = makeService({ ...accountExists, 'FROM workspace_members': [] })
    await expect(service.reassignOwner(WORKSPACE, ACCOUNT, CONTRACT, NEW_OWNER, VIEWER)).rejects.toBeInstanceOf(
      BadRequestException,
    )
    expect(queries.some(q => q.sql.includes('UPDATE legal_contracts'))).toBe(false)
  })

  it('refuse un contrat introuvable dans cet espace/compte (404)', async () => {
    const { service } = makeService({ ...accountExists, 'FROM workspace_members': [{ user_id: NEW_OWNER }] })
    await expect(service.reassignOwner(WORKSPACE, ACCOUNT, CONTRACT, NEW_OWNER, VIEWER)).rejects.toBeInstanceOf(
      NotFoundException,
    )
  })

  it('refuse un compte introuvable dans l’espace (404), sans écrire', async () => {
    const { service, queries } = makeService()
    await expect(service.reassignOwner(WORKSPACE, ACCOUNT, CONTRACT, NEW_OWNER, VIEWER)).rejects.toBeInstanceOf(
      NotFoundException,
    )
    expect(queries.some(q => q.sql.includes('UPDATE legal_contracts'))).toBe(false)
  })
})

describe('LegalContractService — #2422.10 pièces : permission par pièce et versions (lot X54)', () => {
  const doc = (label: string, visibility: string, version = 1) => ({
    label,
    url: null,
    version,
    signedAt: null,
    expiresOn: null,
    visibility,
  })
  const withDocs = {
    ...accountExists,
    'FROM legal_contracts': [
      fakeRow({
        owner_id: 'o0000000-0000-4000-8000-000000000009',
        documents: [doc('Cadre', 'workspace'), doc('Grille', 'finance'), doc('Clause', 'owner')],
      }),
    ],
  }

  it('la liste ne rend que les pièces ouvertes à CE lecteur', async () => {
    const { service } = makeService(withDocs)
    const [row] = await service.list(WORKSPACE, ACCOUNT, VIEWER)
    expect(row.documents.map(d => d.label)).toEqual(['Cadre'])
  })

  it('le droit finance voit toutes les pièces', async () => {
    const { service } = makeService(withDocs)
    const [row] = await service.list(WORKSPACE, ACCOUNT, { userId: USER, canReadFinance: true })
    expect(row.documents).toHaveLength(3)
  })

  it('le propriétaire du contrat voit sa pièce « propriétaire », pas la pièce finance', async () => {
    const { service } = makeService(withDocs)
    const [row] = await service.list(WORKSPACE, ACCOUNT, {
      userId: 'o0000000-0000-4000-8000-000000000009',
      canReadFinance: false,
    })
    expect(row.documents.map(d => d.label)).toEqual(['Cadre', 'Clause'])
  })

  it('déposer une pièce du même libellé ajoute la version suivante, bornée à l’espace et au compte', async () => {
    const { service, queries } = makeService({
      ...accountExists,
      'SELECT documents FROM legal_contracts': [{ documents: [doc('Cadre', 'workspace', 2)] }],
      'FROM legal_contracts c': [fakeRow({ documents: [doc('Cadre', 'workspace', 2), doc('Cadre', 'finance', 3)] })],
    })
    await service.addDocument(
      WORKSPACE,
      ACCOUNT,
      CONTRACT,
      { label: 'Cadre', url: null, signedAt: null, expiresOn: '2027-01-31', visibility: 'finance' },
      { userId: USER, canReadFinance: true },
    )
    const update = queries.find(q => q.sql.includes('UPDATE legal_contracts'))
    expect(update).toBeDefined()
    const written = JSON.parse(String(update?.params[0])) as { version: number; visibility: string }[]
    expect(written).toHaveLength(2)
    expect(written[1]).toMatchObject({ version: 3, visibility: 'finance', expiresOn: '2027-01-31' })
    expect(update?.params).toContain(WORKSPACE)
    expect(update?.params).toContain(ACCOUNT)
  })

  it('refuse un contrat introuvable (404) sans écrire', async () => {
    const { service, queries } = makeService(accountExists)
    await expect(
      service.addDocument(
        WORKSPACE,
        ACCOUNT,
        CONTRACT,
        { label: 'X', url: null, signedAt: null, expiresOn: null, visibility: 'workspace' },
        VIEWER,
      ),
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(queries.some(q => q.sql.includes('UPDATE'))).toBe(false)
  })

  it('la réponse de réattribution ne rend pas non plus une pièce que le lecteur ne peut pas voir', async () => {
    const { service } = makeService({
      ...accountExists,
      'UPDATE legal_contracts': [{ id: CONTRACT }],
      'FROM legal_contracts c': [fakeRow({ documents: [doc('Grille', 'finance')] })],
    })
    const result = await service.reassignOwner(WORKSPACE, ACCOUNT, CONTRACT, null, VIEWER)
    expect(result.documents).toEqual([])
  })
})

describe('LegalContractService — #2422.6 tarifs visibles selon le rôle (lot X54)', () => {
  const OWNER = 'o0000000-0000-4000-8000-000000000009'
  const priced = {
    ...accountExists,
    'FROM legal_contracts': [fakeRow({ owner_id: OWNER, tariff_note: 'TJM 650 € senior', cap_amount_cents: 12000000 })],
  }

  it('un membre sans finance:read ne reçoit NI la note tarifaire NI le plafond — présents et vides, jamais retirés', async () => {
    const { service } = makeService(priced)
    const [row] = await service.list(WORKSPACE, ACCOUNT, VIEWER)
    expect(row.tariffNote).toBeNull()
    expect(row.capAmountCents).toBeNull()
    expect('tariffNote' in row).toBe(true)
  })

  it('le droit finance les reçoit', async () => {
    const { service } = makeService(priced)
    const [row] = await service.list(WORKSPACE, ACCOUNT, { userId: USER, canReadFinance: true })
    expect(row.tariffNote).toBe('TJM 650 € senior')
    expect(row.capAmountCents).toBe(12000000)
  })

  it('le propriétaire du contrat — rôle contractuel — les reçoit sans finance:read', async () => {
    const { service } = makeService(priced)
    const [row] = await service.list(WORKSPACE, ACCOUNT, { userId: OWNER, canReadFinance: false })
    expect(row.tariffNote).toBe('TJM 650 € senior')
    expect(row.capAmountCents).toBe(12000000)
  })

  it('un contrat sans tarif reste sans tarif pour tous — rien n’est inventé', async () => {
    const { service } = makeService({ ...accountExists, 'FROM legal_contracts': [fakeRow()] })
    const [row] = await service.list(WORKSPACE, ACCOUNT, { userId: USER, canReadFinance: true })
    expect(row.tariffNote).toBeNull()
    expect(row.capAmountCents).toBeNull()
  })
})
