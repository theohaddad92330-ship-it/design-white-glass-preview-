import { NotFoundException } from '@nestjs/common'
import { AdvService, type AdvMissionSource } from './adv.service'

const WORKSPACE = 'a0000000-0000-4000-8000-000000000001'
const USER = 'a0000000-0000-4000-8000-000000000002'
const START_MISSION = 'a0000000-0000-4000-8000-000000000010'
const RENEWAL_MISSION = 'a0000000-0000-4000-8000-000000000011'
const ACCOUNT = 'a0000000-0000-4000-8000-000000000020'
const ENTITY = 'a0000000-0000-4000-8000-000000000030'

const NOW = new Date('2026-08-31T09:00:00.000Z')

type Overrides = {
  startMissions?: AdvMissionSource[]
  renewalMissions?: AdvMissionSource[]
  missionMissing?: boolean
  records?: unknown[]
  terms?: unknown[]
  accountEntities?: unknown[]
  readiness?: unknown[]
  /** Les démarrages du mois PRÉCÉDENT. `'throw'` simule une lecture en échec. */
  previousStarts?: number | 'throw'
}

function makeService(overrides: Overrides = {}) {
  const startMission = {
    id: START_MISSION,
    workspace_id: WORKSPACE,
    account_id: ACCOUNT,
    label: 'Ingénieur DevOps',
    status: 'onboarding',
    started_on: '2026-08-03',
    ends_on: null,
  }
  const renewalMission = {
    id: RENEWAL_MISSION,
    account_id: ACCOUNT,
    label: 'Chef de projet IT',
    status: 'active',
    started_on: '2025-04-21',
    ends_on: '2026-09-30',
  }

  const missions = {
    find: jest.fn(async () => overrides.startMissions ?? [startMission]),
    // Le mois de RÉFÉRENCE du delta de démarrages (31/08/2026). Non défini =
    // aucun démarrage le mois d'avant, ce qui est une mesure et non une absence.
    // ⚠️ Le paramètre est DÉCLARÉ même s'il n'est pas lu : sans lui, TypeScript
    // infère un tuple d'arguments VIDE, et le test qui vérifie sur quel mois la
    // référence est comptée ne compilerait pas.
    count: jest.fn(async (_options?: unknown) => {
      if (overrides.previousStarts === 'throw') throw new Error('base injoignable')
      return overrides.previousStarts ?? 0
    }),
    findOne: jest.fn(
      async (): Promise<AdvMissionSource | null> => (overrides.missionMissing === true ? null : startMission),
    ),
  }
  const records = {
    find: jest.fn(async () => overrides.records ?? []),
    findOne: jest.fn(async () => (overrides.records ?? [])[0] ?? null),
    create: jest.fn((row: Record<string, unknown>) => ({ id: 'new-record', ...row })),
    save: jest.fn(async (row: Record<string, unknown>) => row),
  }
  const accounts = { find: jest.fn(async () => [{ id: ACCOUNT, company_name: 'Lacoste' }]) }
  const accountEntities = {
    find: jest.fn(
      async () => overrides.accountEntities ?? [{ id: ENTITY, name: 'Lacoste Operations', siren: '552081317' }],
    ),
  }
  const terms = { find: jest.fn(async () => overrides.terms ?? []) }
  const readiness = { find: jest.fn(async () => overrides.readiness ?? []) }
  const delivery = {
    renewalsToAct: jest.fn(
      async (): Promise<{ missions: AdvMissionSource[] }> => ({
        missions: overrides.renewalMissions ?? [renewalMission],
      }),
    ),
  }
  const workspaceContext = {
    resolveActiveWorkspace: jest.fn(async () => ({ workspaceId: WORKSPACE, role: 'owner' })),
  }

  const service = new AdvService(
    missions as never,
    records as never,
    accounts as never,
    accountEntities as never,
    terms as never,
    readiness as never,
  )
  // Les renouvellements ARRIVENT du contrôleur : c'est lui qui appelle
  // `DeliveryService.renewalsToAct`. Le mock reproduit ce trajet.
  const renewals = async () => (await delivery.renewalsToAct()).missions
  return { service, missions, records, accounts, accountEntities, terms, readiness, delivery, renewals }
}

describe('AdvService.dossiers — la file de travail', () => {
  it('ouvre un dossier de DÉMARRAGE par mission commencée dans le mois', async () => {
    const { service, renewals } = makeService()
    const { items } = await service.dossiers(WORKSPACE, await renewals(), { month: '2026-08' }, NOW)
    const start = items.find(item => item.kind === 'start')
    expect(start?.missionId).toBe(START_MISSION)
    expect(start?.openedOn).toBe('2026-08-03')
  })

  it('BRANCHE la source existante des renouvellements au lieu d’en recoder une', async () => {
    const { service, renewals } = makeService()
    const source = await renewals()
    const { items } = await service.dossiers(WORKSPACE, source, { month: '2026-08' }, NOW)
    // La population des renouvellements est CELLE de la livraison, reprise
    // telle quelle : le service n'en sélectionne aucune de son côté.
    expect(items.filter(item => item.kind === 'renewal').map(item => item.missionId)).toEqual(
      source.map(mission => mission.id),
    )
    const renewal = items.find(item => item.kind === 'renewal')
    expect(renewal?.missionId).toBe(RENEWAL_MISSION)
    // Ouvert à J-60 de la fin, pas au démarrage de la mission : une mission de
    // trois ans n'a pas un dossier de renouvellement vieux de trois ans.
    expect(renewal?.openedOn).toBe('2026-08-01')
  })

  it('nomme TOUS les motifs sur un dossier vierge — rien n’est saisi', async () => {
    const { service, renewals } = makeService()
    const { items } = await service.dossiers(WORKSPACE, await renewals(), { month: '2026-08' }, NOW)
    const start = items.find(item => item.kind === 'start')
    expect(start?.state).toBe('incomplete')
    expect(start?.blockers).toEqual([
      'missing_billing_contact',
      'missing_client_reference',
      'missing_billing_entity',
      'unknown_payment_terms',
      'payment_details_not_transmitted',
    ])
    // Pas de `missing_po` : ce client n'exige pas de bon de commande.
    expect(start?.blockers).not.toContain('missing_po')
  })

  it('réclame un bon de commande quand les conditions commerciales en exigent un', async () => {
    const { service, renewals } = makeService({
      terms: [{ mission_id: START_MISSION, requires_po: true, po_number: null }],
    })
    const { items } = await service.dossiers(WORKSPACE, await renewals(), { month: '2026-08' }, NOW)
    expect(items.find(item => item.kind === 'start')?.blockers).toContain('missing_po')
  })

  it('lève les motifs qu’un dossier renseigné a réellement levés', async () => {
    const { service, renewals } = makeService({
      startMissions: [
        {
          id: START_MISSION,
          account_id: ACCOUNT,
          label: 'Ingénieur DevOps',
          status: 'onboarding',
          started_on: '2026-08-03',
          ends_on: null,
          billing_contact_id: 'c0000000-0000-4000-8000-000000000001',
        },
      ],
      records: [
        {
          mission_id: START_MISSION,
          client_billing_reference: 'FOURN-4471',
          payment_terms_days: 60,
          payment_details_transmitted_at: new Date('2026-08-05T08:00:00.000Z'),
          client_entity_id: ENTITY,
        },
      ],
    })
    const { items } = await service.dossiers(WORKSPACE, await renewals(), { month: '2026-08' }, NOW)
    const start = items.find(item => item.kind === 'start')
    expect(start?.state).toBe('complete')
    expect(start?.blockers).toEqual([])
    expect(start?.clientEntityName).toBe('Lacoste Operations')
  })

  it('traite une entité qui ne résout PLUS comme une entité non désignée', async () => {
    // Une entité fusionnée ou reprise ailleurs laisserait sinon un dossier
    // « désigné » pointant vers rien — le pire des deux états, parce qu'il se
    // lit comme réglé.
    const { service, renewals } = makeService({
      accountEntities: [],
      records: [{ mission_id: START_MISSION, client_entity_id: ENTITY }],
    })
    const { items } = await service.dossiers(WORKSPACE, await renewals(), { month: '2026-08' }, NOW)
    expect(items.find(item => item.kind === 'start')?.blockers).toContain('missing_billing_entity')
    expect(items.find(item => item.kind === 'start')?.clientEntityName).toBeNull()
  })
})

describe('AdvService.dossiers — le résumé', () => {
  it('compte les deux flux, et ne les mélange pas', async () => {
    const { service, renewals } = makeService()
    const { summary } = await service.dossiers(WORKSPACE, await renewals(), { month: '2026-08' }, NOW)
    expect(summary.starts).toBe(1)
    expect(summary.renewals).toBe(1)
    expect(summary.total).toBe(2)
  })

  it('MESURE le delta de démarrages contre le mois précédent, et compte sur le MÊME prédicat', async () => {
    const { service, renewals, missions } = makeService({ previousStarts: 3 })
    const { summary } = await service.dossiers(WORKSPACE, await renewals(), { month: '2026-08' }, NOW)
    // Un démarrage en août, trois en juillet → −2. Le signe est l'information.
    expect(summary.starts).toBe(1)
    expect(summary.startsDelta).toBe(-2)
    // La preuve que la référence est bien JUILLET et pas un mois voisin : la
    // borne haute d'un `Between` sur juillet est le 31.
    const where = missions.count.mock.calls[0]?.[0] as { where: { started_on: unknown } } | undefined
    expect(JSON.stringify(where)).toContain('2026-07-01')
    expect(JSON.stringify(where)).toContain('2026-07-31')
  })

  it('un mois de référence ILLISIBLE rend `null`, jamais « −36 »', async () => {
    const { service, renewals } = makeService({ previousStarts: 'throw' })
    const { summary } = await service.dossiers(WORKSPACE, await renewals(), { month: '2026-08' }, NOW)
    expect(summary.startsDelta).toBeNull()
  })

  it('un zéro MESURÉ reste un zéro — « autant qu’en juillet » est une information', async () => {
    const { service, renewals } = makeService({ previousStarts: 1 })
    const { summary } = await service.dossiers(WORKSPACE, await renewals(), { month: '2026-08' }, NOW)
    expect(summary.startsDelta).toBe(0)
  })

  it('ne rend AUCUN delta de RENOUVELLEMENTS — la fenêtre J-60/J-30 est relative à maintenant', async () => {
    const { service, renewals } = makeService({ previousStarts: 3 })
    const { summary } = await service.dossiers(WORKSPACE, await renewals(), { month: '2026-08' }, NOW)
    // « +6 » de la maquette n'a pas de source, et n'en aura pas tant que les
    // renouvellements se calculeront par rapport à la date du jour : « ceux à
    // traiter en juillet » n'est pas recomposable en août.
    expect(summary.renewalsDelta).toBeNull()
  })

  it('dit « non mesuré » pour « en négociation » — le modèle n’a pas cet état', async () => {
    const { service, renewals } = makeService()
    const { summary } = await service.dossiers(WORKSPACE, await renewals(), { month: '2026-08' }, NOW)
    expect(summary.inNegotiation).toBeNull()
  })

  it('LIT l’état de facturation existant au lieu de le recalculer', async () => {
    const { service, readiness, renewals } = makeService({
      readiness: [{ mission_id: RENEWAL_MISSION, state: 'ready' }],
    })
    const { summary } = await service.dossiers(WORKSPACE, await renewals(), { month: '2026-08' }, NOW)
    expect(readiness.find).toHaveBeenCalled()
    expect(summary.readyToInvoice).toBe(1)
  })

  it('porte une entrée par motif, et celle du KYC vaut `null` — pas zéro', async () => {
    const { service, renewals } = makeService()
    const { summary } = await service.dossiers(WORKSPACE, await renewals(), { month: '2026-08' }, NOW)
    const kyc = summary.byBlocker.find(entry => entry.blocker === 'kyc_not_validated')
    // Zéro se lirait « aucun KYC à valider » sur un espace où personne n'a
    // jamais regardé : le faux vert que ce lot refuse.
    expect(kyc?.count).toBeNull()
    const reference = summary.byBlocker.find(entry => entry.blocker === 'missing_client_reference')
    expect(reference?.count).toBe(2)
  })

  it('compte le résumé sur TOUTE la population, même quand la liste est filtrée', async () => {
    const { service, renewals } = makeService()
    const filtered = await service.dossiers(WORKSPACE, await renewals(), { month: '2026-08', tile: 'starts' }, NOW)
    expect(filtered.items).toHaveLength(1)
    // Sinon, cliquer une pastille remettrait toutes les autres à zéro — et un
    // zéro qui vient d'un filtre se lit comme un zéro qui vient du réel.
    expect(filtered.summary.total).toBe(2)
    expect(filtered.summary.renewals).toBe(1)
  })

  it('filtre par motif et par recherche', async () => {
    const { service, renewals } = makeService()
    const byBlocker = await service.dossiers(
      WORKSPACE,
      await renewals(),
      { month: '2026-08', blocker: 'missing_po' },
      NOW,
    )
    expect(byBlocker.items).toHaveLength(0)
    const bySearch = await service.dossiers(WORKSPACE, await renewals(), { month: '2026-08', q: 'devops' }, NOW)
    expect(bySearch.items).toHaveLength(1)
    expect(bySearch.items[0]?.missionLabel).toBe('Ingénieur DevOps')
  })
})

describe('AdvService.dossiers — la troncature silencieuse de la source (31/08/2026)', () => {
  it('dit `false` quand la source des renouvellements est loin du plafond', async () => {
    const { service, renewals } = makeService()
    const { renewalsTruncated } = await service.dossiers(WORKSPACE, await renewals(), { month: '2026-08' }, NOW)
    expect(renewalsTruncated).toBe(false)
  })

  it('dit `true` quand la source ATTEINT le plafond de `DeliveryService.list` — 200, sans pagination', async () => {
    // ⚠️ `DeliveryService.list` plafonne à 200 SANS pagination ; sur un
    // espace plus grand, la file ADV mentirait par omission sans ce signal.
    const renewalMissions: AdvMissionSource[] = Array.from({ length: 200 }, (_unused, index) => ({
      id: `a0000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      account_id: ACCOUNT,
      label: `Renouvellement ${index}`,
      status: 'active',
      started_on: '2025-01-01',
      ends_on: '2026-09-30',
    }))
    const { service, renewals } = makeService({ renewalMissions })
    const { renewalsTruncated } = await service.dossiers(WORKSPACE, await renewals(), { month: '2026-08' }, NOW)
    expect(renewalsTruncated).toBe(true)
  })
})

describe('AdvService.update — le seul chemin d’écriture', () => {
  it('refuse une mission hors de l’espace', async () => {
    const { service, renewals } = makeService({ missionMissing: true })
    void renewals
    await expect(service.update(WORKSPACE, USER, START_MISSION, { paymentTermsDays: 45 }, [])).rejects.toThrow(
      NotFoundException,
    )
  })

  it('crée le dossier à la première correction, dans l’espace de l’appelant', async () => {
    const { service, records, renewals } = makeService()
    await service.update(WORKSPACE, USER, START_MISSION, { clientBillingReference: 'FOURN-4471' }, [], NOW)
    expect(records.save).toHaveBeenCalledWith(
      expect.objectContaining({
        mission_id: START_MISSION,
        workspace_id: WORKSPACE,
        client_billing_reference: 'FOURN-4471',
        updated_by: USER,
      }),
    )
  })

  it('pose la DATE du jour quand on déclare les coordonnées transmises — jamais un numéro', async () => {
    const { service, records, renewals } = makeService()
    await service.update(WORKSPACE, USER, START_MISSION, { paymentDetailsTransmitted: true }, [], NOW)
    expect(records.save).toHaveBeenCalledWith(expect.objectContaining({ payment_details_transmitted_at: NOW }))
  })

  it('RETIRE le fait de la transmission quand on le déclare faux', async () => {
    const { service, records, renewals } = makeService({
      records: [{ mission_id: START_MISSION, payment_details_transmitted_at: new Date('2026-08-05T08:00:00.000Z') }],
    })
    await service.update(WORKSPACE, USER, START_MISSION, { paymentDetailsTransmitted: false }, [], NOW)
    expect(records.save).toHaveBeenCalledWith(expect.objectContaining({ payment_details_transmitted_at: null }))
  })

  it('ne touche QUE les champs passés — une absence n’est pas un effacement', async () => {
    const { service, records, renewals } = makeService({
      records: [
        {
          mission_id: START_MISSION,
          client_billing_reference: 'FOURN-4471',
          payment_terms_days: 60,
          payment_details_transmitted_at: null,
          client_entity_id: null,
        },
      ],
    })
    await service.update(WORKSPACE, USER, START_MISSION, { paymentTermsDays: 30 }, [], NOW)
    expect(records.save).toHaveBeenCalledWith(
      expect.objectContaining({ client_billing_reference: 'FOURN-4471', payment_terms_days: 30 }),
    )
  })

  it('RETIRE un terme quand on passe `null` — et il n’y a pas de zéro à écrire', async () => {
    const { service, records, renewals } = makeService({
      records: [{ mission_id: START_MISSION, payment_terms_days: 60 }],
    })
    await service.update(WORKSPACE, USER, START_MISSION, { paymentTermsDays: null }, [], NOW)
    expect(records.save).toHaveBeenCalledWith(expect.objectContaining({ payment_terms_days: null }))
  })
})
