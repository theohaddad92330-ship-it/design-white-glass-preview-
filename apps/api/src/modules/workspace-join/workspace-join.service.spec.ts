import { randomUUID } from 'node:crypto'
import { ConflictException, NotFoundException } from '@nestjs/common'
import { FindOperator } from 'typeorm'
import { WORKSPACE_JOIN_SILENCE_HOURS } from '@bellum/contracts'
import { WorkspaceJoinService } from './workspace-join.service'

type Row = Record<string, unknown>

/** `ILike('%@comet.fr')` → vrai si la valeur finit par `@comet.fr`, sans casse (`%` seul simulé). */
function likeMatches(pattern: string, value: unknown): boolean {
  if (typeof value !== 'string') return false
  const source = pattern
    .split('%')
    .map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*')
  return new RegExp(`^${source}$`, 'i').test(value)
}

function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, expected]) => {
    if (expected instanceof FindOperator) {
      if (expected.type === 'in') return (expected.value as unknown[]).includes(row[key])
      if (expected.type === 'ilike') return likeMatches(expected.value as string, row[key])
      throw new Error(`opérateur non simulé : ${expected.type}`)
    }
    return row[key] === expected
  })
}

function fakeRepo(rows: Row[]) {
  return {
    rows,
    find: jest.fn(async (opts?: { where?: Row }) => rows.filter(r => matches(r, opts?.where ?? {}))),
    findOne: jest.fn(async (opts: { where: Row }) => rows.find(r => matches(r, opts.where)) ?? null),
    create: jest.fn((input: Row) => ({ ...input })),
    save: jest.fn(async (input: Row) => {
      if (!input.id) input.id = randomUUID()
      if (!input.created_at) input.created_at = new Date()
      if (!rows.includes(input)) rows.push(input)
      return input
    }),
  }
}

const COMET = '11111111-1111-4111-8111-111111111111'
const PERSONAL = '22222222-2222-4222-8222-222222222222'
const OTHER = '33333333-3333-4333-8333-333333333333'
const ADMIN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const NEWCOMER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const OUTSIDER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

function build() {
  const requests = fakeRepo([])
  const workspaces = fakeRepo([
    { id: COMET, name: 'Mon espace', brand_name: null },
    { id: PERSONAL, name: 'Mon espace', brand_name: null },
    { id: OTHER, name: 'Autre', brand_name: null },
  ])
  const members = fakeRepo([
    { workspace_id: COMET, user_id: ADMIN, role: 'owner', created_at: new Date('2026-01-01') },
    { workspace_id: PERSONAL, user_id: NEWCOMER, role: 'owner', created_at: new Date('2026-09-17') },
    { workspace_id: OTHER, user_id: OUTSIDER, role: 'owner', created_at: new Date('2026-01-01') },
  ])
  const profiles = fakeRepo([
    {
      user_id: ADMIN,
      email: 'louis.schlegel@comet.fr',
      first_name: 'Louis',
      last_name: 'Schlegel',
      phone: '+33612345678',
    },
    { user_id: NEWCOMER, email: 'lea@comet.fr', first_name: 'Léa', last_name: 'Martin' },
    { user_id: OUTSIDER, email: 'paul@ailleurs.fr', first_name: 'Paul', last_name: 'Durand' },
  ])
  const esnProfiles = fakeRepo([
    { workspace_id: COMET, is_workspace_canonical: true, is_current: true, esn_name: 'Comet Conseil' },
    { workspace_id: OTHER, is_workspace_canonical: true, is_current: true, esn_name: 'Ailleurs' },
  ])
  // L'entrée dans l'équipe, fournie par le contrôleur (GA-07).
  const admit = jest.fn(async (_requester: string): Promise<unknown> => undefined)
  const service = new WorkspaceJoinService(
    requests as never,
    workspaces as never,
    members as never,
    profiles as never,
    esnProfiles as never,
  )
  return { service, requests, profiles, members, workspaces, admit }
}

const NOW = new Date('2026-09-17T12:00:00.000Z')

describe('WorkspaceJoinService — détection (#2016.1 / #2016.3)', () => {
  it('détecte l’espace de l’entreprise par le domaine professionnel, et le NOMME par son profil', async () => {
    const { service } = build()
    const overview = await service.overview(NEWCOMER, 'lea@comet.fr', NOW)
    expect(overview.candidates).toHaveLength(1)
    expect(overview.candidates[0]).toMatchObject({ workspaceId: COMET, workspaceName: 'Comet Conseil', request: null })
    // #2016.2 — aucun doublon automatique : sans demande, on ne crée pas son espace.
    expect(overview.canCreateOwnWorkspace).toBe(false)
  })

  it('ne détecte JAMAIS sur un domaine de messagerie grand public (aucune lecture des profils)', async () => {
    const { service, profiles } = build()
    const overview = await service.overview(NEWCOMER, 'lea@gmail.com', NOW)
    expect(overview).toEqual({ candidates: [], canCreateOwnWorkspace: true })
    expect(profiles.find).not.toHaveBeenCalled()
  })

  it('ignore un espace dont on est déjà membre', async () => {
    const { service, members } = build()
    members.rows.push({ workspace_id: COMET, user_id: NEWCOMER, role: 'member', created_at: new Date() })
    expect((await service.overview(NEWCOMER, 'lea@comet.fr', NOW)).candidates).toEqual([])
  })

  it('ignore un espace SANS profil d’entreprise (l’espace personnel vide d’un collègue)', async () => {
    const { service, members } = build()
    members.rows.push({ workspace_id: PERSONAL, user_id: ADMIN, role: 'member', created_at: new Date() })
    const ids = (await service.overview(OUTSIDER, 'paul@comet.fr', NOW)).candidates.map(c => c.workspaceId)
    expect(ids).toEqual([COMET])
  })

  it('un domaine sans collègue : aucun espace, rien ne bloque', async () => {
    const { service } = build()
    expect(await service.overview(NEWCOMER, 'lea@inconnu.fr', NOW)).toEqual({
      candidates: [],
      canCreateOwnWorkspace: true,
    })
  })
})

describe('WorkspaceJoinService — un NON-membre ne reçoit aucune coordonnée (#2016.5)', () => {
  it('les administrateurs sont nommés par prénom + initiale, sans e-mail, téléphone ni nom complet', async () => {
    const { service } = build()
    const overview = await service.overview(NEWCOMER, 'lea@comet.fr', NOW)
    expect(overview.candidates[0]!.admins).toEqual([{ firstName: 'Louis', lastInitial: 'S' }])
    const wire = JSON.stringify(overview)
    expect(wire).not.toContain('@')
    expect(wire).not.toContain('Schlegel')
    expect(wire).not.toContain('+33')
    expect(wire).not.toContain(ADMIN)
  })

  it('sait dire NON : un profil sans prénom n’est pas remplacé par son adresse', async () => {
    const { service, profiles } = build()
    profiles.rows[0]!.first_name = null
    const overview = await service.overview(NEWCOMER, 'lea@comet.fr', NOW)
    expect(overview.candidates[0]!.admins).toEqual([])
    expect(JSON.stringify(overview)).not.toContain('louis.schlegel')
  })
})

describe('WorkspaceJoinService — la demande (#2016.4 / #2016.10)', () => {
  it('crée une demande en attente, une seule à la fois', async () => {
    const { service, requests } = build()
    const first = await service.requestAccess(NEWCOMER, 'lea@comet.fr', COMET)
    const again = await service.requestAccess(NEWCOMER, 'lea@comet.fr', COMET)
    expect(first.status).toBe('pending')
    expect(again.id).toBe(first.id)
    expect(requests.rows).toHaveLength(1)
    expect(requests.rows[0]).toMatchObject({ workspace_id: COMET, user_id: NEWCOMER, status: 'pending' })
  })

  // #2086.35 — « ne pas créer de doublon » : une demande NON approuvée ne
  // rend membre de personne (pas d'accès anticipé aux données de l'espace),
  // et le parcours entier (détecter → demander → accepter) n'ouvre JAMAIS un
  // second espace pour la même entreprise — la porte d'entrée reste la même
  // ligne `workspace_members`, jamais une nouvelle ligne `workspaces`.
  it('#2086.35 — une demande EN ATTENTE ne rend membre de personne (aucun accès avant approbation)', async () => {
    const { service, members } = build()
    await service.requestAccess(NEWCOMER, 'lea@comet.fr', COMET)
    expect(members.save).not.toHaveBeenCalled()
    expect(members.rows.some(m => m.workspace_id === COMET && m.user_id === NEWCOMER)).toBe(false)
  })

  it('#2086.35 — accepter une demande n’ouvre jamais un second espace pour la même entreprise', async () => {
    const { service, workspaces, admit } = build()
    const request = await service.requestAccess(NEWCOMER, 'lea@comet.fr', COMET)
    await service.decide(ADMIN, COMET, request.id, 'accept', admit)
    // Aucun doublon : ce module n'écrit jamais dans `workspaces`, l'entrée
    // passe par l'équipe EXISTANTE (`admit`, #2016.7), jamais par la création
    // d'un espace.
    expect(workspaces.save).not.toHaveBeenCalled()
  })

  it('REFUSE un espace qui n’a pas été détecté pour ce domaine — 404, pas d’oracle', async () => {
    const { service, requests } = build()
    await expect(service.requestAccess(NEWCOMER, 'lea@comet.fr', OTHER)).rejects.toBeInstanceOf(NotFoundException)
    await expect(service.requestAccess(NEWCOMER, 'lea@gmail.com', COMET)).rejects.toBeInstanceOf(NotFoundException)
    expect(requests.rows).toHaveLength(0)
  })

  it('72 h sans réponse débloquent « Créer mon propre espace »', async () => {
    const { service, requests } = build()
    await service.requestAccess(NEWCOMER, 'lea@comet.fr', COMET)
    requests.rows[0]!.created_at = new Date(NOW.getTime() - WORKSPACE_JOIN_SILENCE_HOURS * 3_600_000)
    expect((await service.overview(NEWCOMER, 'lea@comet.fr', NOW)).canCreateOwnWorkspace).toBe(true)
  })

  it('« ce n’est pas mon entreprise » débloque tout de suite, et reste écrit', async () => {
    const { service, requests } = build()
    await service.dismiss(NEWCOMER, 'lea@comet.fr', COMET)
    const overview = await service.overview(NEWCOMER, 'lea@comet.fr', NOW)
    expect(overview.canCreateOwnWorkspace).toBe(true)
    expect(overview.candidates[0]!.request?.status).toBe('dismissed')
    expect(requests.rows[0]).toMatchObject({ status: 'dismissed', decided_by: null })
  })
})

describe('WorkspaceJoinService — la décision de l’administrateur (geste d’utilisateur)', () => {
  async function pendingRequest() {
    const ctx = build()
    const request = await ctx.service.requestAccess(NEWCOMER, 'lea@comet.fr', COMET)
    return { ...ctx, request }
  }

  it('l’administrateur voit les demandes de SON espace, avec qui les fait — et rien d’un autre espace', async () => {
    const { service, request } = await pendingRequest()
    expect(await service.listPending(COMET)).toEqual([
      { id: request.id, requesterName: 'Léa Martin', requesterEmail: 'lea@comet.fr', createdAt: request.createdAt },
    ])
    expect(await service.listPending(OTHER)).toEqual([])
  })

  it('une entrée refusée (sièges) laisse la demande EN ATTENTE', async () => {
    const { service, request, admit, requests } = await pendingRequest()
    admit.mockRejectedValueOnce(new Error('Sièges épuisés'))
    await expect(service.decide(ADMIN, COMET, request.id, 'accept', admit)).rejects.toThrow('Sièges épuisés')
    expect(requests.rows[0]!.status).toBe('pending')
  })

  it('accepter fait entrer la personne — et son profil hérite de celui de l’entreprise (#2016.7)', async () => {
    const { service, request, admit, requests } = await pendingRequest()
    const decided = await service.decide(ADMIN, COMET, request.id, 'accept', admit)
    expect(admit).toHaveBeenCalledWith(NEWCOMER)
    expect(decided).toEqual({ id: request.id, status: 'accepted' })
    expect(requests.rows[0]).toMatchObject({ status: 'accepted', decided_by: ADMIN })
    expect(requests.rows[0]!.decided_at).toBeInstanceOf(Date)
  })

  it('refuser ne fait entrer personne', async () => {
    const { service, request, admit, requests } = await pendingRequest()
    expect(await service.decide(ADMIN, COMET, request.id, 'refuse', admit)).toEqual({
      id: request.id,
      status: 'refused',
    })
    expect(admit).not.toHaveBeenCalled()
    expect(requests.rows[0]).toMatchObject({ status: 'refused', decided_by: ADMIN })
  })

  it('une demande d’un AUTRE espace est introuvable, même par son identifiant', async () => {
    const { service, request, requests, admit } = await pendingRequest()
    await expect(service.decide(OUTSIDER, OTHER, request.id, 'accept', admit)).rejects.toBeInstanceOf(NotFoundException)
    expect(admit).not.toHaveBeenCalled()
    expect(requests.rows[0]!.status).toBe('pending')
  })

  it('une demande déjà tranchée ne se retranche pas', async () => {
    const { service, request, admit } = await pendingRequest()
    await service.decide(ADMIN, COMET, request.id, 'refuse', admit)
    await expect(service.decide(ADMIN, COMET, request.id, 'accept', admit)).rejects.toBeInstanceOf(ConflictException)
    expect(admit).not.toHaveBeenCalled()
  })
})
