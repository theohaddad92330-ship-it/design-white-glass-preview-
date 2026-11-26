import { HttpException, NotFoundException } from '@nestjs/common'
import { orgGraphSchema, type OrgCorrectionRequest, type OrgGraph } from '@bellum/contracts'
import type { Repository } from 'typeorm'
import type { AccountEntity } from '../../database/entities/account.entity'
import type { OrgGraphCorrectionEntity } from '../../database/entities/org-graph-correction.entity'
import { OrgGraphCorrectionService } from './org-graph-correction.service'

const WS = '11111111-1111-1111-1111-111111111111'
const ACCOUNT = '22222222-2222-2222-2222-222222222222'
const ALICE = '33333333-3333-3333-3333-333333333333'
const BOB = '44444444-4444-4444-4444-444444444444'

const graph = (): OrgGraph =>
  orgGraphSchema.parse({
    graphVersion: 4,
    entities: [{ id: 'e-dsi', name: 'DSI', type: 'bu', parentId: null, confidence: 90 }],
    people: [
      {
        id: 'p-julien-nicolas',
        fullName: 'Julien Nicolas',
        title: 'DSI',
        entityId: 'e-dsi',
        hierarchyLevel: 'L1',
        decisionRoles: ['economic_buyer'],
        identityStatus: 'classified',
        confidence: 80,
        sources: [],
      },
    ],
    hierarchyEdges: [],
    influenceEdges: [],
    buyingCommittee: [],
    uncoveredZones: [],
    recommendedPath: [],
    rejectedItems: [],
  })

const request = (over: Partial<OrgCorrectionRequest> = {}): OrgCorrectionRequest =>
  ({
    expectedGraphVersion: 4,
    objectType: 'person',
    objectId: 'p-julien-nicolas',
    claims: [
      {
        field: 'title',
        value: 'Directeur des Systèmes d’Information',
        reason: 'Page « gouvernance » du site officiel',
        evidence: { kind: 'official_site', ref: 'https://acme.fr/gouvernance', claim: 'title' },
      },
    ],
    ...over,
  }) as OrgCorrectionRequest

/* ------------------------------------------------------------------------- */
/*  Une base FEINTE qui applique la sémantique de PostgreSQL                  */
/*                                                                           */
/*  Elle n'applique la garde de version QUE si le SQL la porte : un           */
/*  `UPDATE … WHERE id = $1` sans `org_graph_version = $n` passe TOUJOURS.    */
/*  C'est ce qui fait que ce banc SAIT DIRE NON — retirer la clause du        */
/*  service fait tomber le test de concurrence, et lui seul.                  */
/* ------------------------------------------------------------------------- */
type LedgerRow = {
  id: string
  object_type: string
  object_id: string
  field: string
  old_value: unknown
  new_value: unknown
  reason: string
  evidence: unknown
  graph_version_before: number
  graph_version_after: number
  user_id: string
  created_at: string
  reverted_at: string | null
  motive?: string
  scope?: string
  visibility?: string
}

function buildDatabase(initial: { graph?: OrgGraph | null } = {}) {
  const state = {
    version: 4,
    graph: initial.graph === undefined ? graph() : initial.graph,
    ledger: [] as LedgerRow[],
    /** Combien d'UPDATE ont trouvé leur ligne. Le compte des écritures gagnantes. */
    winners: 0,
    /** Quand faux, la jointure de profil ne rend aucun nom (utilisateur effacé). */
    profileKnown: true,
    /** #3423.7 — les contacts du compte (la colonne `decision_role` qu'Contacts lit). */
    contacts: [{ id: 'c-julien', full_name: 'Julien Nicolas', decision_role: 'economic' as string | null }],
  }

  const query = jest.fn(async (sql: string, params: unknown[] = []): Promise<unknown> => {
    const flat = sql.replace(/\s+/g, ' ').trim()

    if (flat.startsWith('UPDATE accounts')) {
      const guard = /COALESCE\(org_graph_version,\s*1\)\s*=\s*\$(\d+)/.exec(flat)
      if (guard) {
        const expected = Number(params[Number(guard[1]) - 1])
        if (state.version !== expected) return [[], 0]
      }
      const versionParam = /SET org_graph_version = \$(\d+)/.exec(flat)
      state.version = versionParam ? Number(params[Number(versionParam[1]) - 1]) : state.version + 1
      const graphParam = /jsonb_build_object\('orgGraph', \$(\d+)::jsonb\)/.exec(flat)
      if (graphParam) {
        const raw = params[Number(graphParam[1]) - 1]
        if (typeof raw === 'string') state.graph = JSON.parse(raw) as OrgGraph
      }
      state.winners += 1
      return [[{ org_graph_version: state.version }], 1]
    }

    if (flat.startsWith('INSERT INTO org_graph_corrections')) {
      // Une ligne par lot de 12 paramètres, dans l'ordre de la requête.
      const row: LedgerRow = {
        id: `c-${state.ledger.length}`,
        object_type: String(params[3]),
        object_id: String(params[4]),
        field: String(params[5]),
        old_value: JSON.parse(String(params[6])),
        new_value: JSON.parse(String(params[7])),
        reason: String(params[10]),
        evidence: JSON.parse(String(params[11])),
        graph_version_before: Number(params[8]),
        graph_version_after: Number(params[9]),
        user_id: String(params[2]),
        created_at: new Date().toISOString(),
        reverted_at: null,
        // #2126.36 / .37 / .39 — absents du SQL = la colonne prend son défaut.
        motive: params[12] === undefined ? 'corrected' : String(params[12]),
        scope: params[13] === undefined ? 'account' : String(params[13]),
        visibility: params[14] === undefined ? 'workspace' : String(params[14]),
      }
      state.ledger.push(row)
      return [[{ id: row.id }], 1]
    }

    if (flat.startsWith('SELECT id, full_name FROM contacts')) {
      return state.contacts.map(c => ({ id: c.id, full_name: c.full_name }))
    }

    if (flat.startsWith('UPDATE contacts SET decision_role')) {
      const contact = state.contacts.find(c => c.id === String(params[0]))
      if (contact) contact.decision_role = (params[2] as string | null) ?? null
      return [[], contact ? 1 : 0]
    }

    if (flat.startsWith('UPDATE org_graph_corrections')) {
      const row = state.ledger.find(r => r.id === String(params[2]))
      if (!row || row.reverted_at) return [[], 0]
      row.reverted_at = new Date().toISOString()
      return [[{ id: row.id }], 1]
    }

    if (flat.startsWith('SELECT') && flat.includes('FROM org_graph_corrections')) {
      const yours = Number(params[2] ?? 0)
      if (flat.includes('c.id = $3')) {
        const found = state.ledger.find(r => r.id === String(params[2]))
        return found ? [found] : []
      }
      // #2126.44 — la base feinte n'applique le filtre de visibilité QUE si le
      // SQL le porte : retirer la clause du service fait tomber le test.
      if (flat.includes("c.scope <> 'personal' OR c.user_id = $3")) {
        return state.ledger.filter(row => row.scope !== 'personal' || row.user_id === String(params[2]))
      }
      const hidesPersonal = flat.includes("c.scope <> 'personal'")
      return state.ledger
        .filter(row => row.graph_version_after > yours)
        .filter(row => !hidesPersonal || row.scope !== 'personal')
        .map(row => ({
          ...row,
          first_name: state.profileKnown ? 'Louis' : null,
          last_name: state.profileKnown ? 'Schlegel' : null,
        }))
    }

    return []
  })

  const accounts = {
    findOne: jest.fn(async () =>
      state.graph === null
        ? { id: ACCOUNT, workspace_id: WS, company_name: 'Acme', org_graph_version: state.version, raw_analysis: {} }
        : {
            id: ACCOUNT,
            workspace_id: WS,
            company_name: 'Acme',
            org_graph_version: state.version,
            raw_analysis: { org: { orgGraph: state.graph } },
          },
    ),
    manager: {
      query,
      transaction: async <T>(fn: (trx: unknown) => Promise<T>): Promise<T> => fn({ query }),
    },
  } as unknown as Repository<AccountEntity>

  const corrections = { manager: { query } } as unknown as Repository<OrgGraphCorrectionEntity>

  return { state, query, service: new OrgGraphCorrectionService(accounts, corrections) }
}

describe('poser une correction', () => {
  it('écrit le graphe, bump la version et dépose UNE ligne de ledger par champ', async () => {
    const { service, state } = buildDatabase()
    const result = await service.applyCorrection({
      workspaceId: WS,
      accountId: ACCOUNT,
      userId: ALICE,
      request: request(),
    })
    expect(result.graphVersion).toBe(5)
    expect(result.applied).toBe(true)
    expect(state.version).toBe(5)
    expect(state.graph!.people[0]!.title).toBe('Directeur des Systèmes d’Information')
    expect(state.ledger).toHaveLength(1)
    expect(state.ledger[0]).toMatchObject({
      field: 'title',
      old_value: 'DSI',
      new_value: 'Directeur des Systèmes d’Information',
      graph_version_before: 4,
      graph_version_after: 5,
      user_id: ALICE,
      reverted_at: null,
    })
  })

  it('écrit DEUX lignes pour deux champs — une preuve par claim, pas une preuve globale', async () => {
    const { service, state } = buildDatabase()
    await service.applyCorrection({
      workspaceId: WS,
      accountId: ACCOUNT,
      userId: ALICE,
      request: request({
        claims: [
          request().claims[0]!,
          {
            field: 'hierarchyLevel',
            value: 'L2',
            reason: 'Il n’est pas au comité exécutif',
            evidence: { kind: 'workspace_user', claim: 'level' },
          },
        ],
      }),
    })
    expect(state.ledger.map(r => r.field)).toEqual(['title', 'hierarchyLevel'])
    // Une seule version pour la correction entière : c'est UN geste.
    expect(new Set(state.ledger.map(r => r.graph_version_after))).toEqual(new Set([5]))
  })

  it('n’écrit RIEN quand la valeur est déjà celle-là — pas de version fantôme', async () => {
    const { service, state } = buildDatabase()
    const result = await service.applyCorrection({
      workspaceId: WS,
      accountId: ACCOUNT,
      userId: ALICE,
      request: request({ claims: [{ ...request().claims[0]!, value: 'DSI' }] }),
    })
    expect(result.applied).toBe(false)
    expect(result.graphVersion).toBe(4)
    expect(state.version).toBe(4)
    expect(state.ledger).toHaveLength(0)
  })

  it('404 sur un dossier qui n’est pas dans l’espace de l’appelant', async () => {
    const accounts = { findOne: jest.fn(async () => null), manager: { query: jest.fn() } }
    const isolated = new OrgGraphCorrectionService(accounts as never, { manager: { query: jest.fn() } } as never)
    await expect(
      isolated.applyCorrection({ workspaceId: WS, accountId: ACCOUNT, userId: ALICE, request: request() }),
    ).rejects.toBeInstanceOf(NotFoundException)
  })

  it('refuse EXPLICITEMENT une correction qui ne s’applique pas — jamais un « enregistré » qui ment', async () => {
    const { service, state } = buildDatabase()
    await expect(
      service.applyCorrection({
        workspaceId: WS,
        accountId: ACCOUNT,
        userId: ALICE,
        request: request({ objectId: 'p-fantome' }),
      }),
    ).rejects.toBeInstanceOf(HttpException)
    expect(state.version).toBe(4)
    expect(state.ledger).toHaveLength(0)
  })

  it('refuse une correction sur un dossier sans organigramme, plutôt que d’en inventer un', async () => {
    const { service } = buildDatabase({ graph: null })
    await expect(
      service.applyCorrection({ workspaceId: WS, accountId: ACCOUNT, userId: ALICE, request: request() }),
    ).rejects.toMatchObject({ status: 422 })
  })
})

describe('LE VERROU — deux corrections concurrentes sur la MÊME version', () => {
  it('la seconde reçoit un 409, et le graphe ne porte QUE la première', async () => {
    const { service, state } = buildDatabase()

    // Alice et Bob ont tous les deux chargé la version 4 et corrigent le même
    // champ de la même personne. Rien ne les sépare que l'ordre d'arrivée.
    const alice = service.applyCorrection({
      workspaceId: WS,
      accountId: ACCOUNT,
      userId: ALICE,
      request: request({ claims: [{ ...request().claims[0]!, value: 'Directeur du numérique' }] }),
    })
    const bob = service.applyCorrection({
      workspaceId: WS,
      accountId: ACCOUNT,
      userId: BOB,
      request: request({ claims: [{ ...request().claims[0]!, value: 'DSI Groupe' }] }),
    })

    const outcomes = await Promise.allSettled([alice, bob])
    const fulfilled = outcomes.filter(o => o.status === 'fulfilled')
    const rejected = outcomes.filter(o => o.status === 'rejected')

    // EXACTEMENT une gagne. C'est cela, l'absence de lost update.
    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    expect(state.winners).toBe(1)
    expect(state.version).toBe(5)

    const conflict = (rejected[0] as PromiseRejectedResult).reason as HttpException
    expect(conflict).toBeInstanceOf(HttpException)
    expect(conflict.getStatus()).toBe(409)
    const body = conflict.getResponse() as Record<string, unknown>
    expect(body.code).toBe('graph_version_mismatch')
    expect(body.yours).toBe(4)
    expect(body.current).toBe(5)

    // Le graphe porte le titre du GAGNANT, jamais un mélange des deux.
    expect(['Directeur du numérique', 'DSI Groupe']).toContain(state.graph!.people[0]!.title)
    // Et le ledger ne garde QUE le geste qui a eu lieu.
    expect(state.ledger).toHaveLength(1)
  })

  it('le 409 dit CE QUI s’est intercalé, pas seulement qu’il y a conflit', async () => {
    const { service } = buildDatabase()
    await service.applyCorrection({ workspaceId: WS, accountId: ACCOUNT, userId: ALICE, request: request() })

    const conflict = await service
      .applyCorrection({ workspaceId: WS, accountId: ACCOUNT, userId: BOB, request: request() })
      .then(() => null)
      .catch((err: unknown) => err)

    expect(conflict).toBeInstanceOf(HttpException)
    const body = (conflict as HttpException).getResponse() as Record<string, unknown>
    expect(body.yours).toBe(4)
    expect(body.current).toBe(5)
    const intervening = body.intervening as Array<Record<string, unknown>>
    expect(intervening).toHaveLength(1)
    expect(intervening[0]).toMatchObject({ field: 'title', objectId: 'p-julien-nicolas', by: 'Louis Schlegel' })
    // La phrase de repli NOMME la personne et le champ.
    expect(String(body.diffSummary)).toContain('Julien Nicolas')
    expect(String(body.message)).toMatch(/organigramme/i)
  })

  it('ne nomme pas un auteur qu’on ne connaît pas — jamais « undefined a modifié »', async () => {
    const { service, state } = buildDatabase()
    await service.applyCorrection({ workspaceId: WS, accountId: ACCOUNT, userId: ALICE, request: request() })
    state.profileKnown = false

    const conflict = await service
      .applyCorrection({ workspaceId: WS, accountId: ACCOUNT, userId: BOB, request: request() })
      .catch((err: unknown) => err)
    const body = (conflict as HttpException).getResponse() as Record<string, unknown>
    expect((body.intervening as Array<Record<string, unknown>>)[0]!.by).toBeNull()
    expect(String(body.diffSummary)).not.toContain('undefined')
    expect(String(body.diffSummary)).not.toContain('null')
  })

  it('la garde de version est DANS le SQL, pas seulement dans une comparaison JavaScript', async () => {
    // Preuve que le verrou est celui de la BASE : sans cette clause, deux
    // écritures concurrentes passeraient toutes les deux.
    const { service, query } = buildDatabase()
    await service.applyCorrection({ workspaceId: WS, accountId: ACCOUNT, userId: ALICE, request: request() })
    const update = query.mock.calls
      .map(call => String(call[0]).replace(/\s+/g, ' ').trim())
      .find(sql => sql.startsWith('UPDATE accounts'))
    expect(update).toBeDefined()
    expect(update).toContain('COALESCE(org_graph_version, 1) = $')
    expect(update).toContain('workspace_id = $')
  })
})

describe('annuler une correction', () => {
  it('remet la valeur d’avant, pose la pierre tombale et garde la ligne', async () => {
    const { service, state } = buildDatabase()
    await service.applyCorrection({ workspaceId: WS, accountId: ACCOUNT, userId: ALICE, request: request() })
    expect(state.graph!.people[0]!.title).toBe('Directeur des Systèmes d’Information')

    const reverted = await service.revertCorrection({
      workspaceId: WS,
      accountId: ACCOUNT,
      userId: BOB,
      correctionId: state.ledger[0]!.id,
      expectedGraphVersion: 5,
    })

    expect(reverted.graphVersion).toBe(6)
    expect(state.graph!.people[0]!.title).toBe('DSI')
    // La ligne d'origine EXISTE toujours, avec sa pierre tombale.
    expect(state.ledger[0]!.field).toBe('title')
    expect(state.ledger[0]!.reverted_at).not.toBeNull()
    // Et l'annulation est elle-même une entrée : l'histoire se lit dans un sens.
    expect(state.ledger).toHaveLength(2)
    expect(state.ledger[1]).toMatchObject({ new_value: 'DSI', graph_version_after: 6 })
  })

  it('exige le MÊME verrou qu’une correction — annuler est une écriture', async () => {
    const { service, state } = buildDatabase()
    await service.applyCorrection({ workspaceId: WS, accountId: ACCOUNT, userId: ALICE, request: request() })
    await expect(
      service.revertCorrection({
        workspaceId: WS,
        accountId: ACCOUNT,
        userId: BOB,
        correctionId: state.ledger[0]!.id,
        expectedGraphVersion: 4, // périmée
      }),
    ).rejects.toMatchObject({ status: 409 })
    // Rien n'a bougé : ni le graphe, ni la pierre tombale.
    expect(state.graph!.people[0]!.title).toBe('Directeur des Systèmes d’Information')
    expect(state.ledger[0]!.reverted_at).toBeNull()
  })

  it('refuse d’annuler deux fois — la seconde n’a plus rien à annuler', async () => {
    const { service, state } = buildDatabase()
    await service.applyCorrection({ workspaceId: WS, accountId: ACCOUNT, userId: ALICE, request: request() })
    const id = state.ledger[0]!.id
    await service.revertCorrection({
      workspaceId: WS,
      accountId: ACCOUNT,
      userId: BOB,
      correctionId: id,
      expectedGraphVersion: 5,
    })
    await expect(
      service.revertCorrection({
        workspaceId: WS,
        accountId: ACCOUNT,
        userId: BOB,
        correctionId: id,
        expectedGraphVersion: 6,
      }),
    ).rejects.toMatchObject({ status: 409 })
  })

  it('404 sur une correction qui n’est pas celle de ce dossier', async () => {
    const { service } = buildDatabase()
    await expect(
      service.revertCorrection({
        workspaceId: WS,
        accountId: ACCOUNT,
        userId: BOB,
        correctionId: 'c-inconnue',
        expectedGraphVersion: 4,
      }),
    ).rejects.toBeInstanceOf(NotFoundException)
  })
})

describe('l’historique des corrections', () => {
  it('rend les corrections du dossier, annulées comprises', async () => {
    const { service, state } = buildDatabase()
    await service.applyCorrection({ workspaceId: WS, accountId: ACCOUNT, userId: ALICE, request: request() })
    const history = await service.listCorrections({ workspaceId: WS, accountId: ACCOUNT, userId: ALICE })
    expect(history).toHaveLength(state.ledger.length)
    expect(history[0]).toMatchObject({ field: 'title', objectId: 'p-julien-nicolas' })
  })
})

describe('#2126.26-.30 / .36 — un motif qui ne réécrit pas le graphe', () => {
  it('« confirmer » dépose une ligne SANS réécrire le graphe ni avancer la version', async () => {
    const { service, state } = buildDatabase()
    const result = await service.applyCorrection({
      workspaceId: WS,
      accountId: ACCOUNT,
      userId: ALICE,
      request: request({
        motive: 'confirmed',
        claims: [
          {
            field: 'title',
            value: 'DSI',
            reason: 'Revu en rendez-vous le 12/09',
            evidence: { kind: 'workspace_user', claim: 'title' },
          },
        ],
      }),
    })
    expect(result.applied).toBe(false)
    expect(result.corrections).toHaveLength(1)
    expect(result.graphVersion).toBe(4)
    expect(state.version).toBe(4)
    expect(state.winners).toBe(0)
    expect(state.ledger[0]).toMatchObject({
      motive: 'confirmed',
      scope: 'account',
      visibility: 'workspace',
      old_value: 'DSI',
      new_value: 'DSI',
      graph_version_before: 4,
      graph_version_after: 4,
    })
  })

  it('« je ne sais pas » garde la valeur d’avant, même si l’écran en envoie une autre', async () => {
    const { service, state } = buildDatabase()
    await service.applyCorrection({
      workspaceId: WS,
      accountId: ACCOUNT,
      userId: ALICE,
      request: request({ motive: 'unknown' }),
    })
    expect(state.graph!.people[0]!.title).toBe('DSI')
    expect(state.ledger[0]).toMatchObject({ motive: 'unknown', old_value: 'DSI', new_value: 'DSI' })
  })

  it('« obsolète » rend le fait INCONNU et avance la version — on archive, la valeur d’avant reste au ledger', async () => {
    const { service, state } = buildDatabase()
    const result = await service.applyCorrection({
      workspaceId: WS,
      accountId: ACCOUNT,
      userId: ALICE,
      request: request({
        motive: 'obsolete',
        claims: [
          {
            field: 'title',
            value: null,
            reason: 'Parti en juin',
            evidence: { kind: 'workspace_user', claim: 'title' },
          },
        ],
      }),
    })
    expect(result.applied).toBe(true)
    expect(state.version).toBe(5)
    expect(state.graph!.people[0]!.title ?? null).toBeNull()
    expect(state.ledger[0]).toMatchObject({ motive: 'obsolete', old_value: 'DSI', new_value: null })
  })

  it('annuler une ligne qui n’a rien réécrit pose la pierre tombale, sans toucher au graphe ni à la version', async () => {
    const { service, state } = buildDatabase()
    await service.applyCorrection({
      workspaceId: WS,
      accountId: ACCOUNT,
      userId: ALICE,
      request: request({ motive: 'source_added' }),
    })
    const result = await service.revertCorrection({
      workspaceId: WS,
      accountId: ACCOUNT,
      userId: ALICE,
      correctionId: 'c-0',
      expectedGraphVersion: 4,
    })
    expect(result.applied).toBe(false)
    expect(state.version).toBe(4)
    expect(state.ledger).toHaveLength(1)
    expect(state.ledger[0]!.reverted_at).not.toBeNull()
  })

  // La pierre tombale est un UPDATE CONDITIONNEL (`AND reverted_at IS NULL`) :
  // il peut ne toucher AUCUNE ligne. Entre la lecture de l'entrée et l'écriture,
  // une autre annulation peut passer — la lecture n'est pas dans la transaction
  // de l'écriture. Son `RETURNING id` est là pour le dire ; ne pas le lire rend
  // « c'est fait » à quelqu'un dont l'écriture n'a rien fait.
  it('une annulation qui ne touche AUCUNE ligne le DIT — jamais un « fait » qui ment', async () => {
    const { service, state, query } = buildDatabase()
    await service.applyCorrection({
      workspaceId: WS,
      accountId: ACCOUNT,
      userId: ALICE,
      request: request({ motive: 'source_added' }),
    })

    // La course : quelqu'un d'autre a posé la pierre tombale entre notre lecture
    // et notre écriture. Postgres rend alors `[[], 0]` — la ligne existe, la
    // clause `AND reverted_at IS NULL` ne la retient plus. Rien d'autre n'est
    // feint : c'est le SEUL fait que le service ne peut pas deviner autrement.
    const real = query.getMockImplementation()!
    query.mockImplementation(async (sql: string, params: unknown[] = []) => {
      if (sql.replace(/\s+/g, ' ').trim().startsWith('UPDATE org_graph_corrections')) {
        const row = state.ledger[0]
        if (row) row.reverted_at = new Date().toISOString()
        return [[], 0]
      }
      return real(sql, params)
    })

    await expect(
      service.revertCorrection({
        workspaceId: WS,
        accountId: ACCOUNT,
        userId: ALICE,
        correctionId: 'c-0',
        expectedGraphVersion: 4,
      }),
    ).rejects.toMatchObject({ status: 409 })
  })
})

describe('#2126.44 — une correction PERSONNELLE ne modifie jamais la base partagée', () => {
  const personal = () =>
    request({
      scope: 'personal',
      claims: [
        {
          field: 'title',
          value: 'Directeur de la transformation',
          reason: 'Mon hypothèse avant le rendez-vous',
          evidence: { kind: 'workspace_user', claim: 'title' },
        },
      ],
    })

  it('écrit la ligne en PRIVÉ, avec sa valeur, sans réécrire le graphe ni avancer la version', async () => {
    const { service, state } = buildDatabase()
    const result = await service.applyCorrection({
      workspaceId: WS,
      accountId: ACCOUNT,
      userId: ALICE,
      request: personal(),
    })
    expect(result.applied).toBe(false)
    expect(state.version).toBe(4)
    expect(state.winners).toBe(0)
    expect(state.graph!.people[0]!.title).toBe('DSI')
    expect(state.ledger[0]).toMatchObject({
      scope: 'personal',
      visibility: 'private',
      old_value: 'DSI',
      new_value: 'Directeur de la transformation',
    })
  })

  it('n’apparaît que dans l’historique de son auteur', async () => {
    const { service } = buildDatabase()
    await service.applyCorrection({ workspaceId: WS, accountId: ACCOUNT, userId: ALICE, request: personal() })
    expect(await service.listCorrections({ workspaceId: WS, accountId: ACCOUNT, userId: ALICE })).toHaveLength(1)
    expect(await service.listCorrections({ workspaceId: WS, accountId: ACCOUNT, userId: BOB })).toHaveLength(0)
  })

  it('un autre membre ne peut pas l’annuler — elle n’existe pas pour lui', async () => {
    const { service } = buildDatabase()
    await service.applyCorrection({ workspaceId: WS, accountId: ACCOUNT, userId: ALICE, request: personal() })
    await expect(
      service.revertCorrection({
        workspaceId: WS,
        accountId: ACCOUNT,
        userId: BOB,
        correctionId: 'c-0',
        expectedGraphVersion: 4,
      }),
    ).rejects.toBeInstanceOf(NotFoundException)
  })
})

describe('#3423.7 — une correction de rôle gagne aussi dans Contacts', () => {
  const roleRequest = (value: string[]) =>
    request({
      claims: [
        {
          field: 'decisionRoles',
          value,
          reason: 'Il porte le budget côté technique',
          evidence: { kind: 'workspace_user', claim: 'roles' },
        },
      ],
    } as Partial<OrgCorrectionRequest>)

  it('corriger le rôle dans l’organigramme met à jour la colonne que lit l’onglet Contacts', async () => {
    const { service, state } = buildDatabase()
    await service.applyCorrection({
      workspaceId: WS,
      accountId: ACCOUNT,
      userId: ALICE,
      request: roleRequest(['technical_buyer']),
    })
    expect(state.contacts[0]?.decision_role).toBe('technical')
  })

  it('le premier rôle corrigé devient le rôle du contact ; aucun rôle (unknown) le vide — jamais un rôle inventé', async () => {
    const { service, state } = buildDatabase()
    await service.applyCorrection({
      workspaceId: WS,
      accountId: ACCOUNT,
      userId: ALICE,
      request: roleRequest(['unknown']),
    })
    expect(state.contacts[0]?.decision_role).toBeNull()
  })

  it('NON — deux contacts du compte au même nom : aucune écriture, on ne devine pas lequel', async () => {
    const { service, state } = buildDatabase()
    state.contacts.push({ id: 'c-julien-bis', full_name: 'JULIEN  nicolas', decision_role: 'user' })
    await service.applyCorrection({
      workspaceId: WS,
      accountId: ACCOUNT,
      userId: ALICE,
      request: roleRequest(['technical_buyer']),
    })
    expect(state.contacts.map(c => c.decision_role)).toEqual(['economic', 'user'])
  })

  it('NON — aucun contact de ce nom : le graphe est corrigé, Contacts reste intact', async () => {
    const { service, state } = buildDatabase()
    state.contacts[0]!.full_name = 'Quelqu’un d’autre'
    await service.applyCorrection({
      workspaceId: WS,
      accountId: ACCOUNT,
      userId: ALICE,
      request: roleRequest(['technical_buyer']),
    })
    expect(state.contacts[0]?.decision_role).toBe('economic')
    expect(state.graph?.people[0]?.decisionRoles).toEqual(['technical_buyer'])
  })

  it('une correction d’un AUTRE champ ne touche pas Contacts', async () => {
    const { service, state } = buildDatabase()
    await service.applyCorrection({ workspaceId: WS, accountId: ACCOUNT, userId: ALICE, request: request() })
    expect(state.contacts[0]?.decision_role).toBe('economic')
  })
})
