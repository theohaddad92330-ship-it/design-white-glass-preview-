import { BadRequestException, Logger, NotFoundException } from '@nestjs/common'
import { GovernanceService } from './governance.service'

const WORKSPACE = 'w0000000-0000-4000-8000-000000000001'
const USER = 'u0000000-0000-4000-8000-000000000001'
const FIELD = 'f0000000-0000-4000-8000-000000000001'
const ENTITY = 'e0000000-0000-4000-8000-000000000001'

function makeService(overrides: Record<string, unknown> = {}) {
  const queries: { sql: string; params: unknown[] }[] = []
  // GA-405 — les fiches se lisent par `ContactEntity`, jamais par un SQL brut de plus.
  const contactRepo = {
    count: jest.fn(async () => (overrides['keptMissing'] === true ? 0 : 1)),
    find: jest.fn(async () => (overrides['contactLabels'] as unknown[]) ?? []),
  }
  const manager = {
    getRepository: jest.fn(() => contactRepo),
    query: jest.fn(async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params })
      if (sql.includes('INSERT INTO custom_field_defs')) return overrides['keyTaken'] === true ? [] : [{ id: FIELD }]
      // #4016 L6 — la fusion automatique (UNE écriture), son annulation, sa liste.
      if (sql.includes('undone_at')) return (overrides['undoRows'] as unknown[]) ?? [{ undone: 1, restored: 1 }]
      if (sql.includes('UPDATE contacts') && sql.includes('auto_merged')) {
        return (overrides['autoMergeRows'] as unknown[]) ?? [{ id: 'p1' }]
      }
      if (sql.includes('FROM accounts WHERE id = ANY')) return (overrides['accountLabels'] as unknown[]) ?? []
      if (sql.includes("d.decision = 'auto_merged'")) return (overrides['autoMergedRows'] as unknown[]) ?? []
      if (sql.includes('INSERT INTO duplicate_pairs')) return overrides['pairExists'] === true ? [] : [{ id: 'p1' }]
      if (sql.includes('FROM saved_views v')) return (overrides['viewRows'] as unknown[]) ?? []
      if (sql.includes('UPDATE saved_views')) return (overrides['markRunRows'] as unknown[]) ?? [{ id: 'v1' }]
      if (sql.includes('FROM duplicate_pairs d')) return (overrides['pairRows'] as unknown[]) ?? []
      if (sql.includes('FROM custom_field_values v')) return (overrides['valueRows'] as unknown[]) ?? []
      return []
    }),
  }
  const views = {
    manager,
    count: jest.fn(async () => (overrides['viewCount'] as number) ?? 0),
    create: jest.fn((e: Record<string, unknown>) => e),
    save: jest.fn(async (e: Record<string, unknown>) => ({ id: 'v1', ...e })),
    delete: jest.fn(async () => ({ affected: overrides['viewMissing'] === true ? 0 : 1 })),
  }
  const defs = {
    manager,
    count: jest.fn(async () => (overrides['fieldCount'] as number) ?? 0),
    findOne: jest.fn(async () =>
      overrides['fieldMissing'] === true
        ? null
        : {
            id: FIELD,
            workspace_id: WORKSPACE,
            entity_type: 'account',
            key: 'segment',
            label: 'Segment',
            type: (overrides['fieldType'] as string) ?? 'select',
            options: ['A', 'B'],
            archived: overrides['archived'] === true,
            created_at: new Date(),
          },
    ),
    find: jest.fn(async () => []),
    update: jest.fn(async () => ({ affected: overrides['fieldMissing'] === true ? 0 : 1 })),
  }
  const values = { manager }
  const duplicates = {
    manager,
    update: jest.fn(async () => ({ affected: overrides['pairMissing'] === true ? 0 : 1 })),
  }
  const workspaceContext = { resolveActiveWorkspace: jest.fn(async () => ({ workspaceId: WORKSPACE })) }
  // #2875 — le registre canonique, best-effort : `record` est un jest.fn, jamais appelé à moins qu'un test ne le vérifie.
  const triggers = { recordOnceByDedupeKey: jest.fn(async () => undefined) }

  const service = new GovernanceService(
    views as never,
    defs as never,
    values as never,
    duplicates as never,
    workspaceContext as never,
    triggers as never,
  )
  return { service, views, defs, values, duplicates, queries, triggers, contactRepo }
}

describe('GovernanceService — vues sauvegardées', () => {
  it('BORNE à vingt vues par écran', async () => {
    // Au-delà on ne choisit plus : on refait le filtre à la main, ce que la
    // fonctionnalité était censée éviter.
    const { service } = makeService({ viewCount: 20 })
    await expect(
      service.createView(USER, {
        scope: 'accounts',
        name: 'Encore une',
        filters: { a: 1 },
        shared: false,
        objective: null,
        alertFrequency: 'manual',
        alertChannel: null,
        resultType: null,
      }),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('stocke les CRITÈRES, jamais des identifiants de résultat', async () => {
    const { service, views } = makeService()
    await service.createView(USER, {
      scope: 'accounts',
      name: 'Mes comptes',
      filters: { owner: 'me' },
      shared: false,
      objective: null,
      alertFrequency: 'manual',
      alertChannel: null,
      resultType: null,
    })
    expect(views.create).toHaveBeenCalledWith(expect.objectContaining({ filters: { owner: 'me' } }))
  })

  it('DATE le consentement quand un canal est choisi — un `true` seul ne prouve rien', async () => {
    // Le dépôt sait dire qu'une case vaut `true` ; il ne sait dire ni quand ni
    // comment elle y est passée (des lignes `weekly_digest = true` viennent
    // d'un DEFAULT Postgres). Une date ne s'écrit que sur le chemin d'un geste.
    const { service, views } = makeService()
    await service.createView(USER, {
      scope: 'discover',
      name: 'Industrie Rhône-Alpes',
      filters: { region: 'ara' },
      shared: false,
      objective: null,
      alertFrequency: 'weekly',
      alertChannel: 'email',
      resultType: null,
    })
    const written = views.create.mock.calls[0]?.[0] as { alert_consent_at: Date | null }
    expect(written.alert_consent_at).toBeInstanceOf(Date)
  })

  it('ne date RIEN quand aucun canal n’est choisi — « aucune alerte » n’est pas un consentement', async () => {
    const { service, views } = makeService()
    await service.createView(USER, {
      scope: 'discover',
      name: 'Sans alerte',
      filters: { region: 'ara' },
      shared: false,
      objective: null,
      alertFrequency: 'manual',
      alertChannel: null,
      resultType: null,
    })
    const written = views.create.mock.calls[0]?.[0] as { alert_consent_at: Date | null }
    expect(written.alert_consent_at).toBeNull()
  })

  it('ne laisse retirer QUE ses propres vues', async () => {
    const { service, views } = makeService()
    await service.removeView(USER, 'v1')
    expect(views.delete).toHaveBeenCalledWith(expect.objectContaining({ owner_id: USER }))
  })

  it('404 sur une vue qui n’appartient pas à l’appelant', async () => {
    const { service } = makeService({ viewMissing: true })
    await expect(service.removeView(USER, 'v1')).rejects.toBeInstanceOf(NotFoundException)
  })

  it('#3873 — « Rejouer » DATE l’exécution, sur sa propre vue ou une vue partagée', async () => {
    const { service, queries } = makeService()
    await service.markRun(USER, 'v1')
    const write = queries.find(q => q.sql.includes('UPDATE saved_views'))
    expect(write?.params).toEqual(['v1', WORKSPACE, USER])
  })

  it('#3873 — sait dire NON : une vue d’un autre espace, ni sienne ni partagée, ne se date pas', async () => {
    const { service } = makeService({ markRunRows: [] })
    await expect(service.markRun(USER, 'v1')).rejects.toBeInstanceOf(NotFoundException)
  })
})

describe('GovernanceService — champs personnalisés', () => {
  it('BORNE à dix champs par objet', async () => {
    // Un système illimité produit quarante colonnes non documentées en un an.
    const { service } = makeService({ fieldCount: 10 })
    await expect(
      service.createField(USER, { entityType: 'account', label: 'Onzième', type: 'text', options: [] }),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('ne compte QUE les champs actifs dans la borne', async () => {
    const { service, defs } = makeService()
    await service.createField(USER, { entityType: 'account', label: 'Segment', type: 'text', options: [] })
    expect(defs.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ archived: false }) }),
    )
  })

  it('dérive une clé ASCII stable du libellé', async () => {
    const { service, queries } = makeService()
    await service.createField(USER, { entityType: 'account', label: 'Référence marché', type: 'text', options: [] })
    const insert = queries.find(entry => entry.sql.includes('INSERT INTO custom_field_defs'))
    expect(insert?.params[2]).toBe('reference_marche')
  })

  it('REFUSE une clé déjà prise — deux colonnes du même nom sont illisibles', async () => {
    const { service } = makeService({ keyTaken: true })
    await expect(
      service.createField(USER, { entityType: 'account', label: 'Segment', type: 'text', options: [] }),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('ARCHIVE plutôt que de supprimer — les valeurs restent lisibles', async () => {
    const { service, defs } = makeService()
    await service.archiveField(USER, FIELD)
    expect(defs.update).toHaveBeenCalledWith(expect.anything(), { archived: true })
  })

  it('refuse une valeur hors des choix, en NOMMANT le champ', async () => {
    const { service } = makeService()
    await expect(service.writeValue(USER, FIELD, ENTITY, 'C')).rejects.toThrow(/Segment/)
  })

  it('accepte un choix déclaré', async () => {
    const { service, queries } = makeService()
    await service.writeValue(USER, FIELD, ENTITY, 'A')
    expect(queries.some(entry => entry.sql.includes('INSERT INTO custom_field_values'))).toBe(true)
  })

  it('accepte une valeur VIDE — effacer un champ est légitime', async () => {
    const { service, queries } = makeService()
    await service.writeValue(USER, FIELD, ENTITY, null)
    expect(queries.some(entry => entry.sql.includes('INSERT INTO custom_field_values'))).toBe(true)
  })

  it('refuse la saisie sur un champ ARCHIVÉ', async () => {
    const { service } = makeService({ archived: true })
    await expect(service.writeValue(USER, FIELD, ENTITY, 'A')).rejects.toBeInstanceOf(BadRequestException)
  })
})

describe('GovernanceService — doublons', () => {
  it('n’écrase PAS une paire déjà décidée', async () => {
    // Sans ça, chaque passage de détection ressusciterait ce qui a été écarté,
    // et la liste ne se viderait jamais.
    const { service, queries } = makeService({ pairExists: true })
    const inserted = await service.proposeDuplicates(WORKSPACE, [
      { entityType: 'contact', leftId: 'a', rightId: 'b', reason: 'Même adresse', confidence: 0.95 },
    ])
    expect(inserted).toBe(0)
    const insert = queries.find(entry => entry.sql.includes('INSERT INTO duplicate_pairs'))
    expect(insert?.sql).toContain('DO NOTHING')
  })

  it('utilise une clé de paire INDÉPENDANTE de l’ordre', async () => {
    const { service, queries } = makeService()
    await service.proposeDuplicates(WORKSPACE, [
      { entityType: 'contact', leftId: 'b', rightId: 'a', reason: 'Même adresse', confidence: 0.95 },
    ])
    const insert = queries.find(entry => entry.sql.includes('INSERT INTO duplicate_pairs'))
    expect(insert?.params[2]).toBe('a:b')
  })

  it('#2875/#2402.1 — une insertion RÉELLE construit un TriggerEvent canonique « duplicate_pair_detected »', async () => {
    const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)
    const { service } = makeService()
    await service.proposeDuplicates(WORKSPACE, [
      { entityType: 'contact', leftId: 'a', rightId: 'b', reason: 'Même adresse', confidence: 0.95 },
    ])
    const canonical = logSpy.mock.calls.find(call => String(call[0]).includes('duplicate_pair_detected'))
    expect(canonical).toBeDefined()
    logSpy.mockRestore()
  })

  it('#2875/#2402.1 — une paire déjà DÉCIDÉE (DO NOTHING) ne construit AUCUN événement canonique', async () => {
    const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)
    const { service } = makeService({ pairExists: true })
    await service.proposeDuplicates(WORKSPACE, [
      { entityType: 'contact', leftId: 'a', rightId: 'b', reason: 'Même adresse', confidence: 0.95 },
    ])
    const canonical = logSpy.mock.calls.find(call => String(call[0]).includes('duplicate_pair_detected'))
    expect(canonical).toBeUndefined()
    logSpy.mockRestore()
  })

  it('#2875 — une paire NEUVE écrit AUSSI au registre canonique, en plus de `duplicate_pairs`', async () => {
    const { service, triggers } = makeService()
    await service.proposeDuplicates(WORKSPACE, [
      { entityType: 'contact', leftId: 'a', rightId: 'b', reason: 'Même adresse', confidence: 0.95 },
    ])
    // Dédoublonnage 27/09 : le registre reçoit le MÊME TriggerEvent que celui
    // journalisé ci-dessus, jamais un second objet recalculé — un seul appel,
    // deux arguments : l'événement canonique, puis le module appelant.
    expect(triggers.recordOnceByDedupeKey).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'duplicate_pair_detected',
        scope: expect.objectContaining({ workspaceId: WORKSPACE }),
      }),
      'crm-core/governance.service',
    )
  })

  it('#2875 — une paire déjà DÉCIDÉE (DO NOTHING) n’écrit PAS au registre canonique', async () => {
    const { service, triggers } = makeService({ pairExists: true })
    await service.proposeDuplicates(WORKSPACE, [
      { entityType: 'contact', leftId: 'a', rightId: 'b', reason: 'Même adresse', confidence: 0.95 },
    ])
    expect(triggers.recordOnceByDedupeKey).not.toHaveBeenCalled()
  })

  it('enregistre la décision HUMAINE — Bellum ne fusionne rien', async () => {
    const { service, duplicates } = makeService()
    await service.decideDuplicate(USER, 'p1', { decision: 'merged' })
    expect(duplicates.update).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ decision: 'merged', decided_by: USER }),
    )
  })

  it('404 sur une paire d’un autre espace', async () => {
    const { service } = makeService({ pairMissing: true })
    await expect(service.decideDuplicate(USER, 'p1', { decision: 'dismissed' })).rejects.toBeInstanceOf(
      NotFoundException,
    )
  })

  it('ne remonte que les paires EN ATTENTE, les plus sûres d’abord', async () => {
    const { service, queries } = makeService()
    await service.listDuplicates(USER)
    const read = queries.find(entry => entry.sql.includes('FROM duplicate_pairs d'))
    expect(read?.sql).toContain("d.decision = 'pending'")
    expect(read?.sql).toContain('ORDER BY d.confidence DESC')
  })
})

/**
 * #4016 L6 — ⚠️⚠️ RENVERSEMENT DATÉ de c37 (Louis 11/10/2026) : la fusion
 * AUTOMATIQUE des doublons ≥ 0,99, dans Bellum SEULEMENT, réversible.
 */
describe('GovernanceService — fusion automatique (#4016 L6)', () => {
  const KEPT = 'k0000000-0000-4000-8000-000000000001'
  const ABSORBED = 'a0000000-0000-4000-8000-000000000001'
  const certain = (confidence = 0.99) => ({
    leftId: ABSORBED,
    rightId: KEPT,
    keptId: KEPT,
    absorbedId: ABSORBED,
    reason: 'Même adresse et même nom',
    confidence,
  })

  it('fusionne en UNE écriture : la fiche absorbée est mise de côté et pointe vers la survivante, la paire est journalisée', async () => {
    const { service, queries } = makeService()
    const merged = await service.autoMergeContacts(WORKSPACE, [certain()])
    expect(merged).toBe(1)
    const write = queries.find(entry => entry.sql.includes('UPDATE contacts'))
    expect(write?.sql).toContain('deleted_at = now()')
    expect(write?.sql).toContain('merged_into_id')
    expect(write?.sql).toContain("'auto_merged'")
    expect(write?.sql).toContain('INSERT INTO duplicate_pairs')
    // Jamais une fiche déjà mise de côté, jamais vers une survivante disparue.
    expect(write?.sql).toContain('deleted_at IS NULL')
    expect(write?.params).toEqual(expect.arrayContaining([WORKSPACE, KEPT, ABSORBED, 0.99]))
  })

  it('n’écrit QUE dans les tables de BellumAI — jamais dans le CRM du client', async () => {
    const { service, queries } = makeService()
    await service.autoMergeContacts(WORKSPACE, [certain()])
    const tables = queries.flatMap(entry =>
      [...entry.sql.matchAll(/(?:UPDATE|INSERT INTO)\s+(\w+)/g)].map(match => match[1]),
    )
    expect(new Set(tables)).toEqual(new Set(['contacts', 'duplicate_pairs']))
  })

  it('SAIT DIRE NON — une paire sous 0,99 n’est jamais fusionnée, même passée à cette méthode', async () => {
    const { service, queries } = makeService()
    const merged = await service.autoMergeContacts(WORKSPACE, [certain(0.95)])
    expect(merged).toBe(0)
    expect(queries.some(entry => entry.sql.includes('UPDATE contacts'))).toBe(false)
  })

  it('une survivante disparue (mise de côté, autre espace) ne reçoit rien — lue par ContactEntity', async () => {
    const { service, queries, contactRepo } = makeService({ keptMissing: true })
    await expect(service.autoMergeContacts(WORKSPACE, [certain()])).resolves.toBe(0)
    expect(contactRepo.count).toHaveBeenCalledWith({
      where: { id: KEPT, workspace_id: WORKSPACE, deleted_at: expect.anything() },
    })
    expect(queries.some(entry => entry.sql.includes('UPDATE contacts'))).toBe(false)
  })

  it('une paire déjà connue (tranchée ou fusionnée) ne fusionne rien', async () => {
    const { service } = makeService({ autoMergeRows: [] })
    await expect(service.autoMergeContacts(WORKSPACE, [certain()])).resolves.toBe(0)
  })

  it('ANNULER rend la fiche absorbée, et la paire devient « ce ne sont pas les mêmes » — elle ne revient plus', async () => {
    const { service, queries } = makeService({ undoRows: [{ undone: 1, restored: 1 }] })
    await expect(service.undoAutoMerge(USER, 'p1')).resolves.toEqual({ restored: true })
    const undo = queries.find(entry => entry.sql.includes('undone_at'))
    expect(undo?.sql).toContain("decision = 'dismissed'")
    expect(undo?.sql).toContain("decision = 'auto_merged'")
    expect(undo?.sql).toContain('deleted_at = NULL')
    expect(undo?.sql).toContain('merged_into_id = NULL')
    // Une fiche rattachée AILLEURS depuis n'est pas arrachée à sa nouvelle place.
    expect(undo?.sql).toContain('c.merged_into_id = pair.kept_id')
    expect(undo?.params).toEqual(['p1', WORKSPACE, USER])
  })

  it('404 sur une fusion introuvable, d’un autre espace, ou déjà annulée', async () => {
    const { service } = makeService({ undoRows: [{ undone: 0, restored: 0 }] })
    await expect(service.undoAutoMerge(USER, 'p1')).rejects.toBeInstanceOf(NotFoundException)
  })

  it('liste les fusions automatiques EN VIGUEUR, les plus récentes d’abord, survivante et absorbée nommées', async () => {
    const { service, queries } = makeService({
      autoMergedRows: [
        {
          id: 'p1',
          entity_type: 'contact',
          kept_id: KEPT,
          absorbed_id: ABSORBED,
          reason: 'Même adresse et même nom',
          confidence: '0.990',
          decided_at: new Date('2026-10-11T05:40:00Z'),
        },
      ],
      contactLabels: [
        { id: KEPT, full_name: 'Marie Dupont' },
        { id: ABSORBED, full_name: 'Marie Dupont' },
      ],
    })
    const items = await service.listAutoMerged(USER)
    expect(items).toEqual([
      {
        id: 'p1',
        entityType: 'contact',
        keptId: KEPT,
        keptLabel: 'Marie Dupont',
        absorbedId: ABSORBED,
        absorbedLabel: 'Marie Dupont',
        reason: 'Même adresse et même nom',
        confidence: 0.99,
        mergedAt: '2026-10-11T05:40:00.000Z',
      },
    ])
    const read = queries.find(entry => entry.sql.includes("d.decision = 'auto_merged'"))
    // Les noms viennent de `ContactEntity` : la lecture brute ne joint plus `contacts` (GA-405).
    expect(read?.sql).not.toMatch(/JOIN contacts/)
    expect(read?.sql).toContain("d.decision = 'auto_merged'")
    expect(read?.sql).toContain('ORDER BY d.decided_at DESC')
  })

  // #4016.61 — la fusion SIREN (comptes) déplace les contacts, et s'annule d'un bouton dédié.
  describe('#4016.61 — fusion de comptes au même SIREN : contacts déplacés, fusion annulable', () => {
    const account = (confidence = 0.99) => ({
      leftId: KEPT,
      rightId: ABSORBED,
      keptId: KEPT,
      absorbedId: ABSORBED,
      reason: 'Même SIREN',
      confidence,
    })

    it('les contacts du compte absorbé rejoignent le survivant, par une entité d’accueil, dans UNE instruction', async () => {
      const { service, queries } = makeService()
      await expect(service.autoMergeAccounts(WORKSPACE, [account()])).resolves.toBe(1)
      const sql = queries.find(entry => entry.sql.includes("'auto_merged'"))?.sql ?? ''
      expect(sql).toContain('INSERT INTO account_entities')
      expect(sql).toContain('UPDATE contacts')
      expect(sql).toContain('bellum_normalize_name')
      expect(sql).toContain('merged_entity_id')
    })

    it('ANNULER une fusion de comptes rend le compte, ses contacts et son statut d’avant', async () => {
      const { service, queries } = makeService({ undoRows: [{ undone: 1, restored: 1 }], pairRows: [] })
      queries.length = 0
      const original = (service as unknown as { duplicates: { manager: { query: jest.Mock } } }).duplicates.manager
        .query
      original.mockImplementationOnce(async (sql: string, params: unknown[] = []) => {
        queries.push({ sql, params })
        return [{ entity_type: 'account' }]
      })
      await expect(service.undoAutoMerge(USER, 'p1')).resolves.toEqual({ restored: true })
      const undo = queries.find(entry => entry.sql.includes('undone_at'))
      expect(undo?.sql).toContain("entity_type = 'account'")
      expect(undo?.sql).toContain('merged_previous_status')
      expect(undo?.sql).toContain('merged_entity_id')
      expect(undo?.sql).toContain('UPDATE contacts')
      expect(undo?.params).toEqual(['p1', WORKSPACE, USER])
    })

    it('la liste nomme les COMPTES fusionnés par leur raison sociale', async () => {
      const { service } = makeService({
        autoMergedRows: [
          {
            id: 'p2',
            entity_type: 'account',
            kept_id: KEPT,
            absorbed_id: ABSORBED,
            reason: 'Même SIREN',
            confidence: '0.990',
            decided_at: new Date('2026-10-17T05:40:00Z'),
          },
        ],
        accountLabels: [
          { id: KEPT, company_name: 'KLESIA' },
          { id: ABSORBED, company_name: 'KLESIA ADP' },
        ],
      })
      const [item] = await service.listAutoMerged(USER)
      expect(item?.keptLabel).toBe('KLESIA')
      expect(item?.absorbedLabel).toBe('KLESIA ADP')
    })
  })
})
