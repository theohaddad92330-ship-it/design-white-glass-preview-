import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import type { Repository } from 'typeorm'
import type { OutboundWriteRequestEntity } from '../../database/entities/outbound-write-request.entity'
import { buildOutboundPreview, isOutboundExpired, MISSING, OUTBOUND_WRITE_EXPIRY_MS } from './outbound-write-preview'
import { OutboundWriteService } from './outbound-write.service'

/**
 * BEL-INT-603 — l'écriture CRM gouvernée.
 *
 * Deux tests que le ticket nomme explicitement : une prévisualisation de six
 * champs dont deux vides doit AFFICHER « non renseigné », et une approbation à
 * J+22 doit être refusée avec son explication. Le second est ici à J+4 : le
 * dépôt expire à 3 jours et non 21, parce que le PDF se contredit — il demande
 * 21 jours au §8 et écrit au §4.4 qu'« approuvée trois semaines plus tard, elle
 * écrirait un état que plus personne n'a en tête ».
 */

const WS = 'ws-1'
const USER = 'u-1'

function makeService(rows: Partial<OutboundWriteRequestEntity>[] = []) {
  const stored = [...rows]
  const repo = {
    findOne: jest.fn(
      async ({ where }: { where: Record<string, unknown> }) =>
        stored.find(row => Object.entries(where).every(([key, value]) => (row as never)[key] === value)) ?? null,
    ),
    create: jest.fn((value: unknown) => value),
    save: jest.fn(async (value: Partial<OutboundWriteRequestEntity>) => {
      const saved = { id: `owr-${stored.length + 1}`, ...value }
      stored.push(saved)
      return saved
    }),
    find: jest.fn(async (options?: { where?: Record<string, unknown> }) => {
      const where = options?.where ?? { state: 'pending' }
      return stored.filter(row => Object.entries(where).every(([key, value]) => (row as never)[key] === value))
    }),
    update: jest.fn(async () => undefined),
  } as unknown as Repository<OutboundWriteRequestEntity>
  return { service: new OutboundWriteService(repo), repo, stored }
}

describe('la prévisualisation, champ par champ', () => {
  it('NOMME une valeur absente plutôt que de laisser un blanc', () => {
    // Une ligne vide se lit comme un bug d'affichage, et on la survole.
    const preview = buildOutboundPreview('export_contact', {
      email: 'theo@acme.fr',
      firstName: 'Théo',
      lastName: 'Martin',
      company: 'ACME',
      jobTitle: '',
      phone: null,
    })
    expect(preview).toHaveLength(6)
    expect(preview.find(line => line.field === 'Fonction')?.value).toBe(MISSING)
    expect(preview.find(line => line.field === 'Téléphone')?.value).toBe(MISSING)
    expect(preview.find(line => line.field === 'Adresse e-mail')?.value).toBe('theo@acme.fr')
  })

  it('garde un ordre STABLE — relire deux fois ne doit pas demander de tout recommencer', () => {
    const a = buildOutboundPreview('export_contact', { phone: '0102', email: 'a@b.fr' })
    const b = buildOutboundPreview('export_contact', { email: 'a@b.fr', phone: '0102' })
    expect(a).toEqual(b)
  })
})

describe('la porte d’écriture', () => {
  it('auto-approuve un geste d’UTILISATEUR — le clic EST la décision', async () => {
    // L'écran vient de montrer champ par champ ce qui sera écrit, et un CRM est
    // le carnet d'adresses de celui qui demande, pas la paie de l'ESN.
    const { service } = makeService()
    const outcome = await service.request({
      workspaceId: WS,
      userId: USER,
      provider: 'hubspot',
      kind: 'export_contact',
      payload: { email: 'a@b.fr' },
      origin: 'user',
    })
    expect(outcome.decision).toBe('write_now')
    expect(outcome.request.state).toBe('approved')
  })

  it('RETIENT un geste de SYSTÈME — personne n’a rien vu', async () => {
    // C'est la conséquence assumée de « toutes les écritures CRM » : poser une
    // note en fond demande désormais une approbation.
    const { service } = makeService()
    const outcome = await service.request({
      workspaceId: WS,
      userId: USER,
      provider: 'hubspot',
      kind: 'create_note',
      payload: { note: 'Appel du 21/08' },
      origin: 'system',
    })
    expect(outcome.decision).toBe('pending')
    expect(outcome.request.state).toBe('pending')
  })

  it('FIGE la prévisualisation à la création', async () => {
    // Recalculer au moment d'approuver montrerait autre chose que ce qui a été
    // relu, et personne ne relit deux fois.
    const { service } = makeService()
    const { request } = await service.request({
      workspaceId: WS,
      userId: USER,
      provider: 'hubspot',
      kind: 'export_contact',
      payload: { email: 'a@b.fr', phone: null },
      origin: 'user',
    })
    expect(request.preview.find(line => line.field === 'Téléphone')?.value).toBe(MISSING)
  })

  it('ne dépose pas deux fois la même note — l’idempotence est vérifiée AVANT', async () => {
    // Sauter une écriture se répare ; en déposer deux dans un CRM, non.
    const { service } = makeService()
    const first = await service.request({
      workspaceId: WS,
      userId: USER,
      provider: 'hubspot',
      kind: 'create_note',
      payload: { note: 'x' },
      origin: 'system',
      idempotencyKey: 'telephony:aircall:42',
    })
    const second = await service.request({
      workspaceId: WS,
      userId: USER,
      provider: 'hubspot',
      kind: 'create_note',
      payload: { note: 'x' },
      origin: 'system',
      idempotencyKey: 'telephony:aircall:42',
    })
    expect(first.decision).toBe('pending')
    expect(second.decision).toBe('already_done')
  })

  // #2855 — la PROVENANCE : quel compte rendu, quel appel, quelle routine a
  // composé la proposition. Portée par l'appelant, jamais recalculée ici.
  it('porte la provenance donnée par l’appelant', async () => {
    const { service } = makeService()
    const { request } = await service.request({
      workspaceId: WS,
      userId: USER,
      provider: 'hubspot',
      kind: 'create_note',
      payload: { note: 'x' },
      origin: 'system',
      source: { kind: 'call', ref: 'aircall:42' },
    })
    expect(request.source).toEqual({ kind: 'call', ref: 'aircall:42' })
  })

  it('sans provenance donnée, reste `null` — jamais devinée', async () => {
    const { service } = makeService()
    const { request } = await service.request({
      workspaceId: WS,
      userId: USER,
      provider: 'hubspot',
      kind: 'export_contact',
      payload: { email: 'a@b.fr' },
      origin: 'user',
    })
    expect(request.source).toBeNull()
  })
})

describe('l’expiration — 3 jours, pas 21', () => {
  const created = new Date('2026-08-21T09:00:00Z')
  const expires = new Date(created.getTime() + OUTBOUND_WRITE_EXPIRY_MS)

  it('reconnaît une demande périmée', () => {
    expect(isOutboundExpired({ state: 'pending', expires_at: expires }, new Date('2026-08-25T09:00:00Z'))).toBe(true)
    expect(isOutboundExpired({ state: 'pending', expires_at: expires }, new Date('2026-08-22T09:00:00Z'))).toBe(false)
    // Une demande déjà tranchée n'expire pas : elle est tranchée.
    expect(isOutboundExpired({ state: 'approved', expires_at: expires }, new Date('2026-09-01T00:00:00Z'))).toBe(false)
  })

  it('REFUSE d’approuver une demande périmée, en disant pourquoi', async () => {
    const { service } = makeService([{ id: 'owr-1', workspace_id: WS, state: 'pending', expires_at: expires }])
    await expect(
      service.decide({
        workspaceId: WS,
        userId: USER,
        requestId: 'owr-1',
        approve: true,
        now: new Date('2026-08-26T09:00:00Z'),
      }),
    ).rejects.toThrow(/plus personne n’a en tête/)
  })

  it('ne montre PAS une demande périmée comme « en attente »', async () => {
    // La laisser dans la liste fait croire qu'on peut encore y décider quelque
    // chose.
    const { service } = makeService([{ id: 'owr-1', workspace_id: WS, state: 'pending', expires_at: expires }])
    expect(await service.pending(WS, new Date('2026-08-26T09:00:00Z'))).toEqual([])
  })

  it('refuse un identifiant vide AVANT de lire', async () => {
    // TypeORM IGNORE une condition `undefined` : `findOne({ id: undefined })`
    // rendrait la demande de quelqu'un d'autre.
    const { service, repo } = makeService()
    await expect(
      service.decide({ workspaceId: WS, userId: USER, requestId: '', approve: true }),
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(repo.findOne).not.toHaveBeenCalled()
  })
})

/**
 * #2854 (#2201.32) — « Annuler le lot ».
 *
 * Pas un système neuf : la SÉLECTION est un geste de l'écran (checkboxes sur
 * des lignes déjà réelles), `bulkReject` ne fait qu'appliquer `decide()` —
 * la MÊME porte qu'un refus individuel, GA-26 — à chaque identifiant reçu.
 * Chaque refus est ATOMIQUE et son issue est rendue séparément : jamais un
 * « tout annulé » qui couvrirait un échec partiel (doctrine — pas de donnée
 * inventée).
 */
describe('annuler un lot de demandes en attente (#2854 / #2201.32)', () => {
  const future = new Date(Date.now() + OUTBOUND_WRITE_EXPIRY_MS)

  it('refuse chaque demande du lot, et rend le sort de CHACUNE', async () => {
    const { service } = makeService([
      { id: 'owr-1', workspace_id: WS, state: 'pending', expires_at: future },
      { id: 'owr-2', workspace_id: WS, state: 'pending', expires_at: future },
    ])
    const result = await service.bulkReject({ workspaceId: WS, userId: USER, requestIds: ['owr-1', 'owr-2'] })
    expect(result.succeeded).toEqual(['owr-1', 'owr-2'])
    expect(result.failed).toEqual([])
  })

  it('un échec sur UNE demande ne bloque pas les autres, et se NOMME — jamais un « tout annulé » inventé', async () => {
    const { service } = makeService([
      { id: 'owr-1', workspace_id: WS, state: 'pending', expires_at: future },
      { id: 'owr-2', workspace_id: WS, state: 'written', expires_at: future },
    ])
    const result = await service.bulkReject({ workspaceId: WS, userId: USER, requestIds: ['owr-1', 'owr-2'] })
    expect(result.succeeded).toEqual(['owr-1'])
    expect(result.failed).toEqual([{ id: 'owr-2', reason: 'Cette demande a déjà été tranchée.' }])
  })

  it('un identifiant introuvable se NOMME aussi comme un échec, jamais silencieux', async () => {
    const { service } = makeService([{ id: 'owr-1', workspace_id: WS, state: 'pending', expires_at: future }])
    const result = await service.bulkReject({ workspaceId: WS, userId: USER, requestIds: ['owr-1', 'ghost'] })
    expect(result.succeeded).toEqual(['owr-1'])
    expect(result.failed).toEqual([{ id: 'ghost', reason: 'Demande d’écriture introuvable.' }])
  })

  it('un lot vide ne refuse rien — jamais une erreur sur « aucune sélection »', async () => {
    const { service } = makeService()
    const result = await service.bulkReject({ workspaceId: WS, userId: USER, requestIds: [] })
    expect(result).toEqual({ succeeded: [], failed: [] })
  })
})

/**
 * #2854 (#2201.9) — « actions en masse » : une seule demande qui dépose
 * PLUSIEURS écritures, groupées par `batch_id`.
 *
 * Pas un moteur neuf : chaque élément passe par `request()` ci-dessus, LA
 * MÊME porte qu'une demande seule (GA-26). Ce qui est neuf, c'est le
 * `batch_id` PARTAGÉ que cette méthode pose sur chacune — la fusion que le
 * retour #2201 demandait pour les actions en masse, sans laquelle rien ne
 * regroupait jamais plusieurs écritures en une seule demande.
 */
describe('déposer un lot d’écritures en une seule demande (#2854 / #2201.9)', () => {
  it('pose le MÊME batch_id sur chaque écriture du lot', async () => {
    const { service, stored } = makeService()
    const { batchId, results } = await service.requestBatch({
      workspaceId: WS,
      userId: USER,
      origin: 'system',
      items: [
        { provider: 'hubspot', kind: 'create_note', payload: { note: 'A' } },
        { provider: 'hubspot', kind: 'create_note', payload: { note: 'B' } },
      ],
    })

    expect(batchId).toBeTruthy()
    expect(results).toHaveLength(2)
    expect(stored.every(row => row.batch_id === batchId)).toBe(true)
    // Deux lignes RÉELLES, pas une carte qui prétendrait être « une » décision
    // sur deux écritures indépendantes — chacune garde son propre état.
    expect(new Set(stored.map(row => row.id)).size).toBe(2)
  })

  it('un lot VIDE n’invente aucun identifiant — rien à regrouper', async () => {
    const { service, stored } = makeService()
    const { batchId, results } = await service.requestBatch({
      workspaceId: WS,
      userId: USER,
      origin: 'system',
      items: [],
    })

    expect(batchId).toBeNull()
    expect(results).toEqual([])
    expect(stored).toHaveLength(0)
  })

  it('une demande déposée SEULE (hors lot) garde `batch_id: null`', async () => {
    const { service, stored } = makeService()
    await service.request({
      workspaceId: WS,
      userId: USER,
      provider: 'hubspot',
      kind: 'create_note',
      payload: {},
      origin: 'system',
    })

    expect(stored[0]?.batch_id ?? null).toBeNull()
  })

  it('retrouve toutes les écritures d’un lot, jamais celles d’un AUTRE lot', async () => {
    const { service } = makeService([
      { id: 'owr-1', workspace_id: WS, batch_id: 'lot-a' },
      { id: 'owr-2', workspace_id: WS, batch_id: 'lot-a' },
      { id: 'owr-3', workspace_id: WS, batch_id: 'lot-b' },
    ])
    const found = await service.findByBatch(WS, 'lot-a')
    expect(found.map(row => row.id).sort()).toEqual(['owr-1', 'owr-2'])
  })
})

describe('l’écriture ne part que sur une approbation vivante', () => {
  const future = new Date(Date.now() + OUTBOUND_WRITE_EXPIRY_MS)

  it('refuse une demande NON approuvée', async () => {
    const { service } = makeService([{ id: 'owr-1', workspace_id: WS, state: 'pending', expires_at: future }])
    await expect(service.requireApproved(WS, 'owr-1')).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('refuse de réécrire ce qui est DÉJÀ écrit', async () => {
    const { service } = makeService([{ id: 'owr-1', workspace_id: WS, state: 'written', expires_at: future }])
    await expect(service.requireApproved(WS, 'owr-1')).rejects.toBeInstanceOf(ConflictException)
  })
})

/**
 * #1498 — « ANCIENNE VALEUR → NOUVELLE VALEUR », ET « MODIFIER ».
 *
 * Deux décisions de Louis du 05/09, prises ensemble parce qu'elles se tiennent :
 * l'ancienne valeur est figée AVEC le reste, et « modifier » crée une demande
 * neuve plutôt que d'altérer une prévisualisation qu'on a déjà relue.
 */
describe('l’ancienne valeur, figée au même instant', () => {
  it('rend l’ancienne à côté de la nouvelle', () => {
    const lines = buildOutboundPreview('export_contact', { phone: '0600000000' }, { phone: '0611111111' })
    expect(lines[0]).toMatchObject({ field: 'Téléphone', key: 'phone', value: '0600000000', previous: '0611111111' })
  })

  /**
   * ⚠️ LA DISTINCTION QUI COMPTE. Un champ ABSENT du dictionnaire est une
   * absence de CONNAISSANCE ; un champ présent à `null` est une information
   * (« il est vide »). Les confondre écrirait « non renseigné → … » sur un champ
   * qu'on n'a jamais lu.
   */
  it('ne dit RIEN de l’ancienne valeur quand on ne la connaît pas', () => {
    const lines = buildOutboundPreview('export_contact', { phone: '0600000000' }, {})
    expect(lines[0]).not.toHaveProperty('previous')
  })

  it('dit « non renseigné » quand on SAIT que le champ était vide', () => {
    const lines = buildOutboundPreview('export_contact', { phone: '0600000000' }, { phone: null })
    expect(lines[0]?.previous).toBe(MISSING)
  })

  /** Sans dictionnaire du tout, aucune ligne ne prétend connaître un passé. */
  it('n’invente aucune ancienne valeur quand aucun état n’est fourni', () => {
    const lines = buildOutboundPreview('export_contact', { phone: '06', email: 'a@b.c' })
    expect(lines.every(line => !('previous' in line))).toBe(true)
  })

  /** La CLÉ voyage avec le libellé : sans elle, une ligne modifiée à l'écran
   *  n'a aucun moyen de retrouver le champ qu'elle écrit. */
  it('porte la clé de charge utile à côté du libellé', () => {
    const lines = buildOutboundPreview('create_note', { note: 'Appel du 12/08' })
    expect(lines[0]).toMatchObject({ field: 'Note', key: 'note' })
  })
})

describe('modifier une demande — c’est en créer une nouvelle', () => {
  const pending = () => ({
    id: 'owr-1',
    workspace_id: WS,
    requested_by: 'u-9',
    provider: 'un-crm',
    kind: 'create_note' as const,
    payload: { note: 'Appel du 12/08' },
    preview: [{ field: 'Note', key: 'note', value: 'Appel du 12/08' }],
    origin: 'system' as const,
    state: 'pending' as const,
    expires_at: new Date(Date.now() + OUTBOUND_WRITE_EXPIRY_MS),
    created_at: new Date(),
  })

  it('crée une demande NEUVE, figée, et marque l’ancienne « remplacée »', async () => {
    const { service, stored } = makeService([pending()])

    const revised = await service.revise({
      workspaceId: WS,
      userId: USER,
      requestId: 'owr-1',
      changes: { note: 'Appel du 12/08 — RDV fixé au 20/09' },
    })

    expect(revised.state).toBe('pending')
    expect(revised.payload).toEqual({ note: 'Appel du 12/08 — RDV fixé au 20/09' })
    // ⚠️ « remplacée », pas « refusée » : personne n'a dit non.
    expect(stored.find(row => row.id === 'owr-1')?.state).toBe('superseded')
  })

  /**
   * ⚠️ Le diff de la révision montre ce que la PERSONNE avait sous les yeux
   * quand elle a corrigé — pas l'état du fournisseur, qu'on n'a pas relu.
   */
  it('montre l’ancienne valeur de la demande d’origine dans la nouvelle', async () => {
    const { service } = makeService([pending()])

    const revised = await service.revise({
      workspaceId: WS,
      userId: USER,
      requestId: 'owr-1',
      changes: { note: 'Corrigé' },
    })

    expect(revised.preview[0]).toMatchObject({ value: 'Corrigé', previous: 'Appel du 12/08' })
  })

  /**
   * ⚠️ Une clé NEUVE écrirait un champ que personne n'a relu dans la demande
   * d'origine — et la révision deviendrait un moyen de faire passer autre chose.
   */
  it('refuse d’introduire un champ qui n’était pas dans la demande', async () => {
    const { service } = makeService([pending()])

    const revised = await service.revise({
      workspaceId: WS,
      userId: USER,
      requestId: 'owr-1',
      changes: { note: 'Corrigé', email: 'exfiltration@ailleurs.fr' },
    })

    expect(revised.payload).toEqual({ note: 'Corrigé' })
  })

  /**
   * ⚠️ Deux demandes qui partagent une clé d'idempotence se dédupliquent : la
   * révision disparaîtrait en silence.
   */
  it('ne reprend PAS la clé d’idempotence de l’originale', async () => {
    const { service } = makeService([{ ...pending(), idempotency_key: 'k-1' }])

    const revised = await service.revise({ workspaceId: WS, userId: USER, requestId: 'owr-1', changes: {} })

    expect(revised.idempotency_key).toBeNull()
  })

  it('refuse de réviser une demande déjà tranchée', async () => {
    const { service } = makeService([{ ...pending(), state: 'approved' as never }])

    await expect(
      service.revise({ workspaceId: WS, userId: USER, requestId: 'owr-1', changes: {} }),
    ).rejects.toBeInstanceOf(ConflictException)
  })

  it('refuse de réviser une demande EXPIRÉE — elle décrit un monde périmé', async () => {
    const { service } = makeService([{ ...pending(), expires_at: new Date(Date.now() - 1000) }])

    await expect(
      service.revise({ workspaceId: WS, userId: USER, requestId: 'owr-1', changes: {} }),
    ).rejects.toBeInstanceOf(ConflictException)
  })

  it('refuse une demande d’un AUTRE espace', async () => {
    const { service } = makeService([pending()])

    await expect(
      service.revise({ workspaceId: 'ws-autre', userId: USER, requestId: 'owr-1', changes: {} }),
    ).rejects.toBeInstanceOf(NotFoundException)
  })
})

// #2864 — reste du lot précédent : la délégation (`assigned_to`) ne couvrait
// que `approval_requests`. Même colonne, même moteur — MAIS pas la même règle
// de « qui peut trancher » : voir le docblock d'`OutboundWriteService.assign`.
describe('confier une écriture CRM à un collègue (#2864 reste)', () => {
  const pending = () => ({
    id: 'owr-1',
    workspace_id: WS,
    requested_by: 'u-9',
    provider: 'un-crm',
    kind: 'create_note' as const,
    payload: { note: 'Appel du 12/08' },
    preview: [{ field: 'Note', key: 'note', value: 'Appel du 12/08' }],
    origin: 'system' as const,
    state: 'pending' as const,
    assigned_to: null,
    expires_at: new Date(Date.now() + OUTBOUND_WRITE_EXPIRY_MS),
    created_at: new Date(),
  })

  function build(rows: Partial<OutboundWriteRequestEntity>[] = [pending()]) {
    const built = makeService(rows)
    ;(built.repo.update as jest.Mock).mockResolvedValue({ affected: 1 })
    return built
  }

  it('confie la demande à un collègue qui peut réellement la trancher (`data:export`)', async () => {
    const { service } = build()

    const assigned = await service.assign({
      workspaceId: WS,
      requestId: 'owr-1',
      assignerId: 'u-9',
      assignerRole: 'member',
      assigneeId: 'u-collegue',
      assigneeRole: 'member',
    })

    expect(assigned.assigned_to).toBe('u-collegue')
  })

  it('refuse un destinataire qui n’est PAS membre de cet espace', async () => {
    const { service } = build()

    await expect(
      service.assign({
        workspaceId: WS,
        requestId: 'owr-1',
        assignerId: 'u-9',
        assignerRole: 'member',
        assigneeId: 'u-dehors',
        assigneeRole: null,
      }),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('refuse un destinataire qui ne peut PAS trancher une écriture CRM (lecture seule)', async () => {
    const { service } = build()

    await expect(
      service.assign({
        workspaceId: WS,
        requestId: 'owr-1',
        assignerId: 'u-9',
        assignerRole: 'member',
        assigneeId: 'u-lecteur',
        assigneeRole: 'viewer',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('un tiers sans responsabilité sur ce circuit ne peut pas s’attribuer la demande d’un autre', async () => {
    const { service } = build()

    await expect(
      service.assign({
        workspaceId: WS,
        requestId: 'owr-1',
        assignerId: 'u-tiers',
        assignerRole: 'member',
        assigneeId: 'u-collegue',
        assigneeRole: 'member',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('`null` retire la délégation — le circuit d’origine reprend la main', async () => {
    const { service } = build([{ ...pending(), assigned_to: 'u-collegue' }])

    const assigned = await service.assign({
      workspaceId: WS,
      requestId: 'owr-1',
      assignerId: 'u-collegue',
      assignerRole: 'member',
      assigneeId: null,
      assigneeRole: null,
    })

    expect(assigned.assigned_to).toBeNull()
  })
})

// #2856 — reste du lot précédent : le report (`snoozed_until`) ne couvrait
// que `approval_requests`. Même moteur (`canSnooze`, réutilisé tel quel).
describe('reporter une écriture CRM en attente (#2856 reste)', () => {
  const pending = (): Partial<OutboundWriteRequestEntity> => ({
    id: 'owr-1',
    workspace_id: WS,
    requested_by: 'u-9',
    provider: 'un-crm',
    kind: 'create_note' as const,
    payload: { note: 'Appel du 12/08' },
    preview: [{ field: 'Note', key: 'note', value: 'Appel du 12/08' }],
    origin: 'system' as const,
    state: 'pending' as const,
    assigned_to: null,
    snoozed_until: null,
    expires_at: new Date(Date.now() + OUTBOUND_WRITE_EXPIRY_MS),
    created_at: new Date(),
  })

  function build(rows: Partial<OutboundWriteRequestEntity>[] = [pending()]) {
    const built = makeService(rows)
    ;(built.repo.update as jest.Mock).mockResolvedValue({ affected: 1 })
    return built
  }

  it('reporte la demande — elle reste `pending`, rien n’est décidé', async () => {
    const { service } = build()
    const until = new Date(Date.now() + 3600_000)

    const snoozed = await service.snooze({
      workspaceId: WS,
      requestId: 'owr-1',
      actorId: 'u-9',
      actorRole: 'member',
      until,
    })

    expect(snoozed.snoozed_until).toEqual(until)
    expect(snoozed.state).toBe('pending')
  })

  it('`null` réveille la demande', async () => {
    const { service } = build([{ ...pending(), snoozed_until: new Date(Date.now() + 3600_000) }])

    const snoozed = await service.snooze({
      workspaceId: WS,
      requestId: 'owr-1',
      actorId: 'u-9',
      actorRole: 'member',
      until: null,
    })

    expect(snoozed.snoozed_until).toBeNull()
  })

  it('refuse un report qui dépasse l’expiration de la demande', async () => {
    const { service } = build()

    await expect(
      service.snooze({
        workspaceId: WS,
        requestId: 'owr-1',
        actorId: 'u-9',
        actorRole: 'member',
        until: new Date(Date.now() + OUTBOUND_WRITE_EXPIRY_MS + 3600_000),
      }),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('un tiers sans responsabilité sur ce circuit ne peut pas reporter la demande d’un autre', async () => {
    const { service } = build()

    await expect(
      service.snooze({
        workspaceId: WS,
        requestId: 'owr-1',
        actorId: 'u-tiers',
        actorRole: 'member',
        until: new Date(Date.now() + 3600_000),
      }),
    ).rejects.toBeInstanceOf(ForbiddenException)
  })
})
