import { CrmSyncService } from './crm-sync.service'

const OLD_ENV = process.env

function contact(over: Record<string, unknown> = {}) {
  return { id: 'c-1', user_id: 'u-1', email: 'a@bellum.fr', phone: null, crm_synced_at: null, ...over }
}

function build(
  opts: {
    rows?: Record<string, unknown>[]
    snapshot?: Record<string, unknown> | null
    connections?: Record<string, unknown>[]
    /** Les contacts qui ont demandé qu'on cesse. */
    stopped?: string[]
    /** #2261.13 (19/09) — `false` simule le dépôt d'observations absent (best-effort). */
    withLatencyRepo?: boolean
    /** #4714.3 — la porte d'écriture absente (`@Optional`). */
    withGate?: boolean
  } = {},
) {
  const update = jest.fn().mockResolvedValue(undefined)
  const contacts = {
    update,
    createQueryBuilder: jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(opts.rows ?? []),
    })),
  }
  const connections = { find: jest.fn().mockResolvedValue(opts.connections ?? [{ workspace_id: 'ws-1' }]) }
  const crm = {
    findContactRecord: jest.fn().mockResolvedValue(opts.snapshot ?? null),
    pushContactField: jest.fn().mockResolvedValue(true),
  }
  // La porte « ne me contactez plus ». Vide par défaut : personne n'est arrêté,
  // donc le passage reste exactement celui d'avant pour tous les tests
  // existants — c'est ce qui rend le nouveau contrôle lisible.
  const contactStops = { stoppedAmong: jest.fn().mockResolvedValue(new Set<string>(opts.stopped ?? [])) }
  const insert = jest.fn().mockResolvedValue(undefined)
  const latencyObservations = opts.withLatencyRepo === false ? undefined : { insert }
  // #4714.3 — LA porte d'écriture CRM existante (`OutboundWriteService.request`).
  const gate = { request: jest.fn().mockResolvedValue({ decision: 'pending', request: { id: 'req-1' } }) }
  const service = new CrmSyncService(
    contacts as never,
    connections as never,
    contactStops as never,
    crm as never,
    latencyObservations as never,
    (opts.withGate === false ? undefined : gate) as never,
  )
  return { service, crm, update, contacts, connections, contactStops, insert, gate }
}

describe('CrmSyncService — la synchronisation dans les deux sens (§58, P1-07)', () => {
  beforeEach(() => {
    process.env = { ...OLD_ENV }
    delete process.env['CRM_SYNC_DISABLED']
    delete process.env['CRM_SYNC_OVERWRITE']
  })
  afterEach(() => {
    process.env = { ...OLD_ENV }
    jest.restoreAllMocks()
  })

  it('sans CRM connecté : aucun appel réseau', async () => {
    // La boucle ne doit rien coûter à ceux qui n'ont pas branché de CRM.
    const { service, crm } = build({ connections: [] })
    await expect(service.syncAll()).resolves.toEqual({
      scanned: 0,
      linked: 0,
      filled: 0,
      divergent: 0,
      overwritten: 0,
    })
    expect(crm.findContactRecord).not.toHaveBeenCalled()
  })

  it('le kill-switch coupe tout, sans appel', async () => {
    // Cette boucle ÉCRIT chez un tiers, et une écriture chez un tiers est la
    // seule chose qu'on ne peut pas annuler depuis ici. Pouvoir l'arrêter sans
    // redéploiement est la condition pour l'activer.
    process.env['CRM_SYNC_DISABLED'] = 'true'
    const { service, crm, connections } = build({ rows: [contact()] })

    await service.syncAll()

    expect(connections.find).not.toHaveBeenCalled()
    expect(crm.findContactRecord).not.toHaveBeenCalled()
  })

  it('apprend qu’une fiche existe — c’est ce qui rend « déjà connu » vrai', async () => {
    // Un contact ajouté à la main par un collègue restait invisible : Bellum
    // proposait d'aller contacter quelqu'un que l'équipe travaillait déjà.
    const { service, update } = build({
      rows: [contact()],
      snapshot: { recordId: 'h-9', provider: 'hubspot', email: 'a@bellum.fr' },
    })

    const out = await service.syncAll()

    expect(out.linked).toBe(1)
    expect(update).toHaveBeenCalledWith({ id: 'c-1' }, expect.objectContaining({ crm_synced_at: expect.any(Date) }))
  })

  // #2261.13 (décision Louis 19/09) — CHAQUE synchro réelle avec un horodatage
  // SOURCE devient une observation gardée, pour mesurer la latence probable de
  // l'outil sur les synchronisations RÉELLES de l'espace (jamais une moyenne
  // inventée).
  describe('observations de latence (#2261.13)', () => {
    it('enregistre une observation quand la fiche CRM porte un horodatage SOURCE', async () => {
      const { service, insert } = build({
        rows: [contact({ workspace_id: 'ws-1' })],
        snapshot: {
          recordId: 'h-9',
          provider: 'hubspot',
          email: 'a@bellum.fr',
          lastActivityAt: '2026-09-19T08:00:00Z',
        },
      })

      await service.syncAll()

      expect(insert).toHaveBeenCalledWith(
        expect.objectContaining({
          workspace_id: 'ws-1',
          provider: 'hubspot',
          source_at: new Date('2026-09-19T08:00:00Z'),
        }),
      )
    })

    it('n’enregistre rien sans horodatage SOURCE — jamais une observation devinée', async () => {
      const { service, insert } = build({
        rows: [contact({ workspace_id: 'ws-1' })],
        snapshot: { recordId: 'h-9', provider: 'hubspot', email: 'a@bellum.fr' },
      })

      await service.syncAll()

      expect(insert).not.toHaveBeenCalled()
    })

    it('n’enregistre rien sans `workspace_id` sur le contact — la table l’exige NOT NULL', async () => {
      const { service, insert } = build({
        rows: [contact({ workspace_id: null })],
        snapshot: {
          recordId: 'h-9',
          provider: 'hubspot',
          email: 'a@bellum.fr',
          lastActivityAt: '2026-09-19T08:00:00Z',
        },
      })

      await service.syncAll()

      expect(insert).not.toHaveBeenCalled()
    })

    it('une écriture d’observation qui échoue ne fait PAS échouer le passage (best-effort)', async () => {
      const { service, insert } = build({
        rows: [contact({ workspace_id: 'ws-1' })],
        snapshot: {
          recordId: 'h-9',
          provider: 'hubspot',
          email: 'a@bellum.fr',
          lastActivityAt: '2026-09-19T08:00:00Z',
        },
      })
      insert.mockRejectedValue(new Error('pg down'))

      const out = await service.syncAll()

      expect(out.scanned).toBe(1)
    })

    it('sans dépôt d’observations câblé (best-effort), le passage continue sans lever', async () => {
      const { service } = build({
        rows: [contact({ workspace_id: 'ws-1' })],
        snapshot: {
          recordId: 'h-9',
          provider: 'hubspot',
          email: 'a@bellum.fr',
          lastActivityAt: '2026-09-19T08:00:00Z',
        },
        withLatencyRepo: false,
      })

      await expect(service.syncAll()).resolves.toMatchObject({ scanned: 1 })
    })
  })

  it('remplit un champ VIDE côté CRM — gain net, aucune perte', async () => {
    const { service, crm } = build({
      rows: [contact({ phone: '0600000000' })],
      snapshot: { recordId: 'h-9', provider: 'hubspot', email: 'a@bellum.fr', phone: null },
    })

    const out = await service.syncAll()

    expect(out.filled).toBe(1)
    expect(crm.pushContactField).toHaveBeenCalledWith('u-1', 'h-9', 'phone', '0600000000')
  })

  it('n’ÉCRASE PAS une valeur non vide par défaut — elle la signale', async () => {
    // L'arbitrage « Bellum fait foi » porte sur ce que le produit AFFICHE.
    // Écraser automatiquement modifie l'outil d'un client : les conséquences
    // d'une erreur se lisent chez lui, et personne ne saura dire quelle valeur
    // a été perdue.
    const { service, crm } = build({
      rows: [contact({ email: 'neuf@bellum.fr' })],
      snapshot: { recordId: 'h-9', provider: 'hubspot', email: 'ancien@crm.fr' },
    })

    const out = await service.syncAll()

    expect(out.divergent).toBe(1)
    expect(out.overwritten).toBe(0)
    expect(crm.pushContactField).not.toHaveBeenCalled()
  })

  it('#4714.3 — OVERWRITE=true + valeur non vide : aucune écriture au connecteur, une prévisualisation créée', async () => {
    process.env['CRM_SYNC_OVERWRITE'] = 'true'
    const { service, crm, gate } = build({
      rows: [contact({ email: 'neuf@bellum.fr', workspace_id: 'ws-1' })],
      snapshot: { recordId: 'h-9', provider: 'hubspot', email: 'ancien@crm.fr' },
    })

    const out = await service.syncAll()

    expect(crm.pushContactField).not.toHaveBeenCalled()
    expect(gate.request).toHaveBeenCalledTimes(1)
    expect(gate.request).toHaveBeenCalledWith(
      expect.objectContaining({
        origin: 'system',
        provider: 'hubspot',
        kind: 'export_contact',
        workspaceId: 'ws-1',
        payload: expect.objectContaining({ email: 'neuf@bellum.fr' }),
        previous: { email: 'ancien@crm.fr' },
      }),
    )
    // Rien n'est écrit tant que personne n'a validé : le compteur d'écrasements reste à zéro.
    expect(out.overwritten).toBe(0)
  })

  it('#4714.3 — sait dire NON : sans le réglage, ni écriture ni prévisualisation', async () => {
    const { service, crm, gate } = build({
      rows: [contact({ email: 'neuf@bellum.fr', workspace_id: 'ws-1' })],
      snapshot: { recordId: 'h-9', provider: 'hubspot', email: 'ancien@crm.fr' },
    })
    await service.syncAll()
    expect(crm.pushContactField).not.toHaveBeenCalled()
    expect(gate.request).not.toHaveBeenCalled()
  })

  it('#4714.3 — champ VIDE côté CRM : inchangé, écrit directement même avec le réglage', async () => {
    process.env['CRM_SYNC_OVERWRITE'] = 'true'
    const { service, crm, gate } = build({
      rows: [contact({ email: 'neuf@bellum.fr', workspace_id: 'ws-1' })],
      snapshot: { recordId: 'h-9', provider: 'hubspot', email: null },
    })
    const out = await service.syncAll()
    expect(out.filled).toBe(1)
    expect(crm.pushContactField).toHaveBeenCalledWith('u-1', 'h-9', 'email', 'neuf@bellum.fr')
    expect(gate.request).not.toHaveBeenCalled()
  })

  it('#4714.3 — porte absente : rien ne part (jamais d’écrasement hors porte)', async () => {
    process.env['CRM_SYNC_OVERWRITE'] = 'true'
    const { service, crm } = build({
      withGate: false,
      rows: [contact({ email: 'neuf@bellum.fr', workspace_id: 'ws-1' })],
      snapshot: { recordId: 'h-9', provider: 'hubspot', email: 'ancien@crm.fr' },
    })
    await service.syncAll()
    expect(crm.pushContactField).not.toHaveBeenCalled()
  })

  it('un contact en échec n’arrête pas le passage', async () => {
    // Deux cents contacts par espace : un jeton périmé sur le premier ne doit
    // pas priver les autres de leur synchronisation.
    const { service, crm } = build({
      rows: [contact({ id: 'c-1' }), contact({ id: 'c-2' })],
      snapshot: { recordId: 'h-9', provider: 'hubspot', email: 'a@bellum.fr' },
    })
    crm.findContactRecord.mockRejectedValueOnce(new Error('token expired'))

    const out = await service.syncAll()

    expect(out.scanned).toBe(2)
    expect(crm.findContactRecord).toHaveBeenCalledTimes(2)
  })

  it('ne pousse RIEN sur quelqu’un qui a demandé qu’on cesse', async () => {
    // T-169 : ce passage recopiait chaque nuit `email` et `phone` vers le CRM
    // du client, sans consulter aucun verdict d'arrêt. Le numéro de quelqu'un
    // qui a demandé qu'on cesse de l'appeler atterrissait dans l'outil qui sert
    // justement à l'appeler — retirer la permission sans retirer le MOYEN.
    const { service, crm, update } = build({
      rows: [contact({ id: 'c-1' }), contact({ id: 'c-2', email: 'b@bellum.fr' })],
      snapshot: { recordId: 'h-9', provider: 'hubspot', email: null },
      stopped: ['c-1'],
    })

    const out = await service.syncAll()

    // Les deux fiches ont été VUES — `scanned` ne ment pas sur le travail fait.
    expect(out.scanned).toBe(2)
    // Une seule est partie chez le fournisseur : ni lecture, ni écriture sur
    // l'autre.
    expect(crm.findContactRecord).toHaveBeenCalledTimes(1)
    expect(crm.findContactRecord).toHaveBeenCalledWith('u-1', 'b@bellum.fr')
    expect(update).toHaveBeenCalledTimes(1)
  })

  it('demande les arrêts UNE fois pour tout le lot', async () => {
    // Une lecture par contact rendrait le contrôle assez cher pour qu'on
    // finisse par le retirer — et un contrôle retiré ne protège personne.
    const { service, contactStops } = build({
      rows: [contact({ id: 'c-1' }), contact({ id: 'c-2' }), contact({ id: 'c-3' })],
      snapshot: null,
    })

    await service.syncAll()

    expect(contactStops.stoppedAmong).toHaveBeenCalledTimes(1)
    expect(contactStops.stoppedAmong).toHaveBeenCalledWith('ws-1', ['c-1', 'c-2', 'c-3'])
  })

  it('aucune fiche côté CRM : on n’écrit rien, ni ici ni là-bas', async () => {
    const { service, crm, update } = build({ rows: [contact()], snapshot: null })

    const out = await service.syncAll()

    expect(out).toMatchObject({ scanned: 1, linked: 0, filled: 0 })
    expect(crm.pushContactField).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })
})
