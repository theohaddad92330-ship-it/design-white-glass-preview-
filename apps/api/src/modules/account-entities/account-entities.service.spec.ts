import { BadRequestException, NotFoundException } from '@nestjs/common'
import { AccountEntitiesService } from './account-entities.service'

/**
 * Les entités et les sites d'un compte (PDF 2 §2).
 *
 * Quatre propriétés méritent un test, parce que chacune se paie sur le terrain
 * si elle manque : deux entités homonymes rendent le rattachement d'un contact
 * indéterministe ; un contact rattaché à l'entité d'un AUTRE compte apparaît
 * dans le comité d'une entreprise où il ne travaille pas ; supprimer ou
 * renommer le périmètre non déterminé laisse les contacts orphelins ; et un
 * effectif de site inconnu doit rester `null`, jamais 0.
 */
describe('AccountEntitiesService', () => {
  const entityRow = (over: Record<string, unknown> = {}) => ({
    id: 'e-1',
    workspace_id: 'w-1',
    account_id: 'a-1',
    name: 'DSI Groupe',
    kind: 'bu',
    siren: null,
    domain: null,
    is_default: false,
    rank1_incumbent: 'unknown',
    rank1_note: null,
    // Le dossier de facturation (26/08/2026). Toutes les valeurs par défaut
    // sont « personne n'a répondu » — c'est l'état d'une entité qu'on vient de
    // déclarer, et le point de départ des bloqueurs.
    is_billing: false,
    legal_name: null,
    payment_terms_days: null,
    contract_expires_on: null,
    billing_contact_id: null,
    created_at: new Date('2026-08-19T10:00:00.000Z'),
    updated_at: new Date('2026-08-19T10:00:00.000Z'),
    ...over,
  })

  const build = (
    over: {
      entityFound?: unknown
      clash?: unknown
      contact?: unknown
      entities?: unknown[]
      contactRows?: unknown[]
    } = {},
  ) => {
    const qb = {
      where: jest.fn(() => qb),
      andWhere: jest.fn(() => qb),
      getOne: jest.fn().mockResolvedValue(over.clash ?? null),
    }
    const entities = {
      find: jest.fn().mockResolvedValue(over.entities ?? [entityRow()]),
      findOne: jest.fn().mockResolvedValue(over.entityFound ?? null),
      create: jest.fn((value: unknown) => value),
      save: jest.fn(async (value: unknown) =>
        Array.isArray(value) ? value : { ...entityRow(), ...(value as object) },
      ),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
      createQueryBuilder: jest.fn(() => qb),
    }
    const sites = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((value: unknown) => value),
      save: jest.fn(async (value: Record<string, unknown>) => ({
        id: 's-1',
        workspace_id: 'w-1',
        account_id: 'a-1',
        entity_id: null,
        label: 'EDF Saclay',
        city: null,
        postal_code: null,
        country: null,
        siret: null,
        headcount: null,
        created_at: new Date('2026-08-19T10:00:00.000Z'),
        updated_at: new Date('2026-08-19T10:00:00.000Z'),
        ...value,
      })),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
      createQueryBuilder: jest.fn(() => qb),
    }
    const contacts = {
      find: jest.fn().mockResolvedValue(over.contactRows ?? []),
      findOne: jest.fn().mockResolvedValue(over.contact ?? null),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    }
    return {
      service: new AccountEntitiesService(entities as never, sites as never, contacts as never),
      entities,
      sites,
      contacts,
    }
  }

  it('refuse deux entités du même nom sur un compte, quelle que soit la casse', async () => {
    const { service } = build({ clash: entityRow() })
    await expect(service.createEntity('w-1', 'a-1', { name: 'dsi groupe' })).rejects.toBeInstanceOf(BadRequestException)
  })

  it('crée une entité en normalisant le domaine en minuscules', async () => {
    const { service } = build()
    const created = await service.createEntity('w-1', 'a-1', { name: '  EDF Renouvelables ', domain: 'EDF-EN.COM' })
    expect(created.name).toBe('EDF Renouvelables')
    expect(created.domain).toBe('edf-en.com')
    expect(created.rank1_incumbent).toBe('unknown')
  })

  it('refuse de supprimer le périmètre non déterminé — les contacts orphelins n’auraient plus de rattachement', async () => {
    const { service } = build({ entityFound: entityRow({ is_default: true }) })
    await expect(service.deleteEntity('w-1', 'e-1')).rejects.toBeInstanceOf(BadRequestException)
  })

  it('refuse de renommer le périmètre non déterminé', async () => {
    const { service } = build({ entityFound: entityRow({ is_default: true }) })
    await expect(service.updateEntity('w-1', 'e-1', { name: 'Divers' })).rejects.toBeInstanceOf(BadRequestException)
  })

  it('ne vide pas les champs absents d’un patch', async () => {
    const { service, entities } = build({
      entityFound: entityRow({ siren: '552081317', rank1_note: 'Sopra en place' }),
    })
    await service.updateEntity('w-1', 'e-1', { kind: 'subsidiary' })
    const saved = entities.save.mock.calls[0]?.[0] as Record<string, unknown>
    expect(saved['siren']).toBe('552081317')
    expect(saved['rank1_note']).toBe('Sopra en place')
    expect(saved['kind']).toBe('subsidiary')
  })

  it('refuse de rattacher un contact à l’entité d’un autre compte', async () => {
    const { service } = build({
      contact: { id: 'c-1', account_id: 'a-1', workspace_id: 'w-1' },
      entityFound: entityRow({ account_id: 'a-2' }),
    })
    await expect(service.attachContact('w-1', 'c-1', 'e-1')).rejects.toBeInstanceOf(BadRequestException)
  })

  it('renvoie au périmètre non déterminé plutôt que de laisser un contact sans entité', async () => {
    const { service, contacts, entities } = build({ contact: { id: 'c-1', account_id: 'a-1', workspace_id: 'w-1' } })
    entities.findOne.mockResolvedValueOnce(null) // pas de périmètre par défaut encore
    const result = await service.attachContact('w-1', 'c-1', null)
    expect(result.entity_id).toBeTruthy()
    const [, patch] = contacts.update.mock.calls[0] as [unknown, Record<string, unknown>]
    expect(patch['entity']).toBeNull()
  })

  it('rend 404 sur un contact d’un autre espace', async () => {
    const { service } = build()
    await expect(service.attachContact('w-1', 'c-9', null)).rejects.toBeInstanceOf(NotFoundException)
  })

  it('garde un effectif de site inconnu à null — 0 se lirait « site vide »', async () => {
    const { service } = build()
    const site = await service.createSite('w-1', 'a-1', { label: 'EDF Saclay', city: 'Saclay' })
    expect(site.headcount).toBeNull()
    expect(site.city).toBe('Saclay')
  })

  /**
   * Le contexte industriel du site (addendum Stelya §8) : six colonnes posées le
   * 24/08, LUES par `siteFit` dès le lendemain, et qu'aucun chemin ne pouvait
   * écrire. `siteFit` répondait « inconnu » sur tous les sites — ce qui
   * ressemble exactement à une base pas encore remplie.
   */
  it('persiste le contexte industriel — sans lui, siteFit répond « inconnu » pour toujours', async () => {
    const { service } = build()
    const site = await service.createSite('w-1', 'a-1', {
      label: 'Usine de Sochaux',
      site_type: 'usine',
      activity_sector_codes: ['automotive'],
      industrial_function_codes: ['methodes'],
      headcount: 320,
      headcount_confidence: 'high',
      headcount_source: 'entretien du 12/03 avec le directeur de site',
      headcount_observed_at: '2026-03-12T00:00:00.000Z',
    })
    expect(site.site_type).toBe('usine')
    expect(site.activity_sector_codes).toEqual(['automotive'])
    expect(site.industrial_function_codes).toEqual(['methodes'])
    expect(site.headcount_confidence).toBe('high')
    expect(site.headcount_source).toContain('entretien')
    // La DATE d'observation, pas celle de l'écriture.
    expect(site.headcount_observed_at).toBe('2026-03-12T00:00:00.000Z')
  })

  it('refuse une confiance d’effectif sans sa source — sinon c’est une opinion', async () => {
    const { service } = build()
    await expect(
      service.createSite('w-1', 'a-1', { label: 'Site A', headcount: 100, headcount_confidence: 'high' }),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('accepte une source SANS confiance — exiger les deux ferait renoncer à saisir la source', async () => {
    const { service } = build()
    const site = await service.createSite('w-1', 'a-1', {
      label: 'Site B',
      headcount: 100,
      headcount_source: 'registre INSEE',
    })
    expect(site.headcount_source).toBe('registre INSEE')
    expect(site.headcount_confidence).toBeNull()
  })

  it('un effectif sans date d’observation ne se date pas d’aujourd’hui', async () => {
    // Un effectif importé d'un registre date de ce registre, pas de l'import.
    const { service } = build()
    const site = await service.createSite('w-1', 'a-1', { label: 'Site C', headcount: 42 })
    expect(site.headcount_observed_at).toBeNull()
  })

  it('réconcilie : crée les divisions que les libellés nomment, et rattache les contacts orphelins', async () => {
    const { service, entities, contacts } = build({
      entities: [],
      contactRows: [
        { id: 'c-1', entity: 'DSI Groupe', entity_id: null },
        { id: 'c-2', entity: 'dsi  groupe', entity_id: null },
        { id: 'c-3', entity: null, entity_id: null },
      ],
    })
    entities.find.mockResolvedValueOnce([]) // aucune entité connue encore
    entities.save.mockResolvedValueOnce([entityRow({ id: 'e-new', name: 'DSI Groupe' })])
    entities.findOne.mockResolvedValueOnce(null) // pas de périmètre par défaut
    entities.save.mockResolvedValueOnce(entityRow({ id: 'e-def', name: 'Périmètre non déterminé', is_default: true }))
    await service.reconcileAccount('w-1', 'a-1')

    // Une seule division créée pour deux graphies du même nom.
    const createdNames = (entities.save.mock.calls[0]?.[0] as unknown as { name: string }[]).map(row => row.name)
    expect(createdNames).toEqual(['DSI Groupe'])
    // c-1 et c-2 portent la même division (une écriture), c-3 le périmètre par défaut.
    expect(contacts.update).toHaveBeenCalledTimes(2)
  })

  it('ne redéplace JAMAIS un contact déjà rattaché — une correction humaine ne s’écrase pas', async () => {
    const { service, contacts, entities } = build({
      contactRows: [{ id: 'c-1', entity: 'DSI Groupe', entity_id: 'e-choisie-a-la-main' }],
    })
    await service.reconcileAccount('w-1', 'a-1')
    expect(contacts.update).not.toHaveBeenCalled()
    expect(entities.save).not.toHaveBeenCalled()
  })

  it('range le périmètre non déterminé en dernier — c’est le fourre-tout, pas la première division à lire', async () => {
    const { service, entities } = build()
    await service.listEntities('w-1', 'a-1')
    const args = entities.find.mock.calls[0]?.[0] as { order?: Record<string, string> }
    expect(args.order?.['is_default']).toBe('ASC')
  })

  /**
   * LE DOSSIER DE FACTURATION (26/08/2026) — « peut-on facturer ce client ? ».
   *
   * Les quatre propriétés qui se paient si elles manquent : un délai de
   * règlement de 0 jour effacé par un `|| null` bloque un client qui paie
   * comptant ; deux entités payeuses sur un compte font gagner l'une des deux
   * au hasard ; désigner un payeur sans retirer l'ancien lève une violation
   * d'index en 500 ; et une entité non désignée ne doit apparaître dans AUCUN
   * dossier de facturation.
   */
  describe('dossier de facturation', () => {
    it("écrit le dossier à la création, sans rien deviner de ce qui n'est pas fourni", async () => {
      const { service } = build()
      const created = await service.createEntity('w-1', 'a-1', {
        name: 'CANAL+ Groupe SA',
        is_billing: true,
        legal_name: 'CANAL+ GROUPE SA',
        siren: '420624777',
        payment_terms_days: 45,
        contract_expires_on: '2027-01-31',
      })
      expect(created.is_billing).toBe(true)
      expect(created.legal_name).toBe('CANAL+ GROUPE SA')
      expect(created.payment_terms_days).toBe(45)
      expect(created.contract_expires_on).toBe('2027-01-31')
      // Non fourni ⇒ `null`, jamais une valeur de remplissage.
      expect(created.billing_contact_id).toBeNull()
    })

    /**
     * ⚠️ LE PIÈGE DU `|| null`. `0` est un délai SAISI — paiement comptant — et
     * `input.payment_terms_days || null` le transforme en `null`, c'est-à-dire
     * en « conditions de règlement inconnues » : le compte se met à afficher un
     * bloqueur que personne ne peut lever, puisque la valeur EST déjà saisie.
     * Le reste du fichier écrit `?.trim() || null` sur des chaînes, où le vide
     * et l'absence se valent — sur un nombre, ils ne se valent pas.
     */
    it('garde un délai de règlement de 0 jour — comptant est une réponse, pas un vide', async () => {
      const { service } = build()
      const created = await service.createEntity('w-1', 'a-1', { name: 'ACME', payment_terms_days: 0 })
      expect(created.payment_terms_days).toBe(0)

      const { service: updater } = build({ entityFound: entityRow({ payment_terms_days: 45 }) })
      const patched = await updater.updateEntity('w-1', 'e-1', { payment_terms_days: 0 })
      expect(patched.payment_terms_days).toBe(0)
    })

    it('ne touche PAS au dossier quand le corps n’en parle pas — patch présent-seulement', async () => {
      const { service } = build({
        entityFound: entityRow({ is_billing: true, payment_terms_days: 30, legal_name: 'ACME SAS' }),
      })
      const patched = await service.updateEntity('w-1', 'e-1', { rank1_note: 'note' })
      expect(patched.is_billing).toBe(true)
      expect(patched.payment_terms_days).toBe(30)
      expect(patched.legal_name).toBe('ACME SAS')
    })

    /**
     * L'index partiel unique tient l'invariant en base ; sans ce retrait, il le
     * tiendrait en LEVANT une erreur — l'utilisateur qui change de payeur
     * recevrait un 500 au lieu de voir son choix appliqué.
     */
    it("retire la désignation de l'ancienne payeuse avant d'en désigner une nouvelle", async () => {
      const { service, entities } = build({ entityFound: entityRow({ id: 'e-2', is_billing: false }) })
      await service.updateEntity('w-1', 'e-2', { is_billing: true })
      expect(entities.update).toHaveBeenCalledWith(expect.objectContaining({ account_id: 'a-1', is_billing: true }), {
        is_billing: false,
      })
    })

    it("ne retire rien quand on RETIRE une désignation — il n'y a pas de payeur à déloger", async () => {
      const { service, entities } = build({ entityFound: entityRow({ is_billing: true }) })
      await service.updateEntity('w-1', 'e-1', { is_billing: false })
      expect(entities.update).not.toHaveBeenCalled()
    })

    it('ne rend QUE les entités désignées payeuses, et le SIREN avec', async () => {
      const { service } = build({
        entities: [
          entityRow({ id: 'e-1', account_id: 'a-1', is_billing: true, siren: '420624777', legal_name: 'CANAL+ SA' }),
        ],
      })
      const { items } = await service.listBillingProfiles('w-1')
      expect(items).toEqual([
        expect.objectContaining({ entityId: 'e-1', accountId: 'a-1', siren: '420624777', legalName: 'CANAL+ SA' }),
      ])
    })

    it("interroge la base sur is_billing — un compte sans payeur ne doit ressortir d'AUCUN dossier", async () => {
      const { service, entities } = build({ entities: [] })
      const { items } = await service.listBillingProfiles('w-1')
      expect(items).toEqual([])
      expect(entities.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ workspace_id: 'w-1', is_billing: true }) }),
      )
    })

    it('porte le SIRET et la preuve d’identité jusqu’à la carte', async () => {
      const { service } = build({
        entities: [
          entityRow({
            is_billing: true,
            siren: '420624777',
            siret: '42062477700034',
            identity_source: 'public_registry',
            // Une colonne `date` remonte en `Date` avec certains pilotes : la
            // carte ne doit pas afficher « 2026-04-15T00:00:00.000Z ».
            identity_checked_on: new Date('2026-04-15T00:00:00.000Z'),
          }),
        ],
      })
      const { items } = await service.listBillingProfiles('w-1')
      expect(items[0]).toMatchObject({
        siret: '42062477700034',
        identitySource: 'public_registry',
        identityCheckedOn: '2026-04-15',
      })
    })

    it('rend `null` sur une identité jamais saisie — jamais une date d’époque', async () => {
      const { service } = build({ entities: [entityRow({ is_billing: true })] })
      const { items } = await service.listBillingProfiles('w-1')
      expect(items[0]).toMatchObject({ siret: null, identitySource: null, identityCheckedOn: null })
    })
  })

  /* ────────────────────────────────────────────────────────────────────────── */
  /*  L'IDENTITÉ LÉGALE — refusée plutôt que rattrapée (31/08/2026)             */
  /* ────────────────────────────────────────────────────────────────────────── */

  describe('createEntity — le SIRET se saisit, il ne se devine pas', () => {
    it('stocke le SIRET sans ses séparateurs de saisie', async () => {
      const { service, entities } = build()
      await service.createEntity('w-1', 'a-1', { name: 'CANAL+ SA', siren: '420624777', siret: '420 624 777 00034' })
      expect(entities.create).toHaveBeenCalledWith(expect.objectContaining({ siret: '42062477700034' }))
    })

    it('REFUSE un SIRET incomplet plutôt que de le compléter', async () => {
      const { service } = build()
      await expect(
        service.createEntity('w-1', 'a-1', { name: 'CANAL+ SA', siret: '4206247770003' }),
      ).rejects.toBeInstanceOf(BadRequestException)
    })

    it('REFUSE un SIRET qui appartient à une autre société que le SIREN saisi', async () => {
      const { service } = build()
      await expect(
        service.createEntity('w-1', 'a-1', { name: 'CANAL+ SA', siren: '420624777', siret: '39305182600017' }),
      ).rejects.toBeInstanceOf(BadRequestException)
    })

    it('REFUSE une vérification sans sa date — « vérifié » sans dire quand ne vérifie rien', async () => {
      const { service } = build()
      await expect(
        service.createEntity('w-1', 'a-1', { name: 'CANAL+ SA', identity_source: 'public_registry' }),
      ).rejects.toBeInstanceOf(BadRequestException)
    })

    it('accepte le couple complet et l’écrit tel quel', async () => {
      const { service, entities } = build()
      await service.createEntity('w-1', 'a-1', {
        name: 'CANAL+ SA',
        identity_source: 'human_declared',
        identity_checked_on: '2026-04-15',
      })
      expect(entities.create).toHaveBeenCalledWith(
        expect.objectContaining({ identity_source: 'human_declared', identity_checked_on: '2026-04-15' }),
      )
    })
  })

  describe('updateEntity — le SIREN comparé est celui que le patch POSE', () => {
    it('accepte « nouveau SIREN + son SIRET » en un seul geste', async () => {
      // Sans cette précaution, le SIRET neuf serait comparé à l'ANCIEN SIREN et
      // le geste échouerait — obligeant à deux enregistrements pour une saisie
      // que personne ne pense à couper en deux.
      const { service, entities } = build({ entityFound: entityRow({ siren: '999999999' }) })
      await service.updateEntity('w-1', 'e-1', { siren: '420624777', siret: '42062477700034' })
      expect(entities.save).toHaveBeenCalledWith(
        expect.objectContaining({ siren: '420624777', siret: '42062477700034' }),
      )
    })

    it('refuse un SIRET qui ne correspond pas au SIREN DÉJÀ en base', async () => {
      const { service } = build({ entityFound: entityRow({ siren: '420624777' }) })
      await expect(service.updateEntity('w-1', 'e-1', { siret: '39305182600017' })).rejects.toBeInstanceOf(
        BadRequestException,
      )
    })

    it('ne touche à rien quand le patch ne parle pas d’identité', async () => {
      const { service, entities } = build({
        entityFound: entityRow({ siret: '42062477700034', identity_source: 'public_registry' }),
      })
      await service.updateEntity('w-1', 'e-1', { rank1_note: 'Intégrateur en place' })
      expect(entities.save).toHaveBeenCalledWith(expect.objectContaining({ siret: '42062477700034' }))
    })
  })
})
