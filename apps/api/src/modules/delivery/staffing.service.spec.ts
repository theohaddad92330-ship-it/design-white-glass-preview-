import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import {
  can,
  shiftLocalDays,
  workspaceRoleValues,
  type WorkspacePermission,
  type WorkspaceRole,
} from '@bellum/contracts'
import { StaffingService } from './staffing.service'

const WORKSPACE = 'w0000000-0000-4000-8000-000000000001'
const USER = 'u0000000-0000-4000-8000-000000000001'
const MISSION = 'm0000000-0000-4000-8000-000000000001'
const TALENT = 'c0000000-0000-4000-8000-000000000001'

function makeService(overrides: Record<string, unknown> = {}) {
  const queries: { sql: string; params: unknown[] }[] = []
  const manager = {
    query: jest.fn(async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params })
      if (sql.includes('FROM consultants WHERE id')) return overrides['talentExists'] === false ? [] : [{ id: TALENT }]
      // Le panneau de contacts (30/08/2026) — vérifiée AVANT le motif générique
      // de la liste des affectations, plus bas : les deux requêtes contiennent
      // « FROM mission_assignments a », et celle-ci se distingue par sa
      // sélection (`c.full_name, c.email, c.phone`), pas par sa jointure — un
      // simple « JOIN consultants… » est un SOUS-TEXTE de « LEFT JOIN
      // consultants… » et aurait aussi capturé l'autre requête.
      if (sql.includes('SELECT c.full_name, c.email, c.phone'))
        return (overrides['consultantContactRows'] as unknown[]) ?? []
      if (sql.includes('FROM mission_assignments\n        WHERE workspace_id'))
        return (overrides['bulkRows'] as unknown[]) ?? []
      if (sql.includes('FROM mission_assignments a')) return (overrides['rows'] as unknown[]) ?? []
      // #3068 — les interruptions déclarées et PAS ENCORE confirmées.
      if (sql.includes('FROM mission_interruptions')) return (overrides['unconfirmedInterruptions'] as unknown[]) ?? []
      // #2420 — les jours du MOIS lus par le moteur de marge, reconnus à leur
      // sélection AVANT le motif générique des relevés juste en dessous.
      if (sql.includes('AS validated_days'))
        return (
          (overrides['monthDaysRows'] as unknown[]) ?? [{ validated_days: null, unvalidated_days: null, rows: '0' }]
        )
      if (sql.includes('margin_alert_threshold_percent')) return (overrides['thresholdRows'] as unknown[]) ?? []
      // `SUM(days)` sur un ensemble VIDE rend une ligne UNIQUE à `null` — jamais
      // aucune ligne. Le défaut du mock reproduit ce comportement Postgres :
      // sans override, « aucun relevé compté » se lit comme « non mesuré ».
      if (sql.includes('FROM mission_timesheets')) return (overrides['consumedRows'] as unknown[]) ?? [{ days: null }]
      // #2422.7 — les autres missions partageant le même bon de commande.
      if (sql.includes('FROM mission_commercial_terms mct')) return (overrides['otherPoMissionRows'] as unknown[]) ?? []
      if (sql.includes('FROM accounts WHERE id')) return (overrides['entityRows'] as unknown[]) ?? []
      if (sql.includes('FROM profiles WHERE user_id')) return (overrides['businessManagerRows'] as unknown[]) ?? []
      if (sql.includes('SELECT id FROM contacts WHERE id = $1 AND account_id = $2'))
        return (overrides['craContactValid'] as unknown[]) ?? [{ id: 'contact-1' }]
      if (sql.includes('SELECT full_name, email, phone FROM contacts WHERE id'))
        return (overrides['craContactRows'] as unknown[]) ?? []
      // #2836 — le manager client, lu SCOPÉ au compte de la mission.
      if (sql.includes('SELECT full_name, email, phone FROM contacts WHERE account_id = $2 AND id = $1'))
        return (overrides['clientManagerRows'] as unknown[]) ?? []
      if (sql.includes('SELECT email FROM contacts WHERE id'))
        return (overrides['billingContactRows'] as unknown[]) ?? []
      // #2561 — le deal CRM rattaché (`missions.crm_deal_id` → `crm_deal_facts`).
      if (sql.includes('FROM crm_deal_facts WHERE id')) return (overrides['crmDealRows'] as unknown[]) ?? []
      return []
    }),
  }
  const assignments = {
    manager,
    create: jest.fn((e: Record<string, unknown>) => ({ id: 'as-1', ...e })),
    save: jest.fn(async (e: Record<string, unknown>) => e),
    delete: jest.fn(async () => ({ affected: overrides['assignmentMissing'] === true ? 0 : 1 })),
  }
  const terms = {
    manager,
    findOne: jest.fn(async () => (overrides['terms'] as unknown) ?? null),
  }
  const missions = {
    findOne: jest.fn(async () =>
      overrides['missionMissing'] === true
        ? null
        : {
            id: MISSION,
            workspace_id: WORKSPACE,
            account_id: 'a0000000-0000-4000-8000-000000000001',
            // `in` et non `??` : le test « TJM manquant » passe `null`, que le
            // coalescing nul remplacerait par le défaut — le cas testé
            // disparaîtrait sans que rien ne soit rouge.
            daily_rate: 'dailyRate' in overrides ? (overrides['dailyRate'] as number | null) : 650,
            started_on: 'startedOn' in overrides ? (overrides['startedOn'] as string | null) : null,
            ends_on: 'endsOn' in overrides ? (overrides['endsOn'] as string | null) : null,
            owner_id: 'ownerId' in overrides ? (overrides['ownerId'] as string | null) : null,
            cra_contact_id: 'craContactId' in overrides ? (overrides['craContactId'] as string | null) : null,
            client_manager_contact_id:
              'clientManagerId' in overrides ? (overrides['clientManagerId'] as string | null) : null,
            billing_contact_id:
              'billingContactId' in overrides ? (overrides['billingContactId'] as string | null) : null,
            crm_deal_id: 'crmDealId' in overrides ? (overrides['crmDealId'] as string | null) : null,
          },
    ),
    update: jest.fn(async () => ({ affected: 1 })),
  }
  const workspaceContext = {
    resolveActiveWorkspace: jest.fn(async () => ({
      workspaceId: WORKSPACE,
      role: (overrides['role'] as string) ?? 'owner',
    })),
    // Les permissions accordées au MEMBRE, en plus de son rôle. Le mock les
    // rend comme le service les lit — sans elles, la moitié du RBAC serait
    // ignorée ici comme elle l'était dans le code.
    extraPermissionsOf: jest.fn(async () => (overrides['extra'] as WorkspacePermission[]) ?? []),
  }
  // Les frais (30/08/2026) : `0` par défaut — la plupart des tests de ce
  // fichier ne parlent pas de frais, et une mission sans ligne a un total VRAI
  // de zéro, pas un mock qui manque.
  const expensesService = {
    totalCents: jest.fn(async () => (overrides['expensesTotalCents'] as number) ?? 0),
  }
  // Les factures fournisseur (30/08/2026) : `0` par défaut, même raison que
  // `expensesService` juste au-dessus.
  const supplierInvoicesService = {
    totalCents: jest.fn(async () => (overrides['supplierInvoicesTotalCents'] as number) ?? 0),
  }

  const service = new StaffingService(
    assignments as never,
    terms as never,
    missions as never,
    workspaceContext as never,
    expensesService as never,
    supplierInvoicesService as never,
  )
  return { service, assignments, terms, missions, queries, workspaceContext, expensesService, supplierInvoicesService }
}

describe('StaffingService.assign', () => {
  it('estampille l’espace sur l’affectation', async () => {
    // Sans lui, « qui est libre en septembre ? » passerait par une jointure sur
    // `missions` pour chaque ligne du vivier.
    const { service, assignments } = makeService({
      rows: [
        {
          id: 'as-1',
          mission_id: MISSION,
          consultant_id: TALENT,
          load_percent: 100,
          starts_on: '2026-09-01',
          ends_on: null,
          created_at: new Date(),
          mission_label: 'Renfort',
          account_name: 'ACME',
          consultant_name: 'Marie',
        },
      ],
    })
    await service.assign(USER, MISSION, {
      consultantId: TALENT,
      loadPercent: 100,
      startsOn: '2026-09-01',
      endsOn: null,
    })
    expect(assignments.create).toHaveBeenCalledWith(expect.objectContaining({ workspace_id: WORKSPACE }))
  })

  it('refuse un talent d’un autre espace', async () => {
    const { service } = makeService({ talentExists: false })
    await expect(
      service.assign(USER, MISSION, { consultantId: TALENT, loadPercent: 50, startsOn: '2026-09-01', endsOn: null }),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('refuse une mission d’un autre espace', async () => {
    const { service } = makeService({ missionMissing: true })
    await expect(
      service.assign(USER, MISSION, { consultantId: TALENT, loadPercent: 50, startsOn: '2026-09-01', endsOn: null }),
    ).rejects.toBeInstanceOf(NotFoundException)
  })
})

/**
 * #2407.4 — L'AFFECTATION PORTE SON TAUX, SON LIEU ET SON MODE DE TRAVAIL
 * (reco appliquée, décision Louis 22/09 soir §1 : les trois colonnes simples ;
 * consentement, documents et risques se cadrent à part).
 *
 * ⚠️ Le TAUX est une donnée financière : il ne sort qu'à `finance:read`, et sa
 * clé est ABSENTE sinon — jamais `null`, qui se lirait « aucun taux saisi ».
 */
describe('StaffingService — #2407.4 taux, lieu et mode de travail de l’affectation', () => {
  const row = {
    id: 'as-1',
    mission_id: MISSION,
    consultant_id: TALENT,
    load_percent: 100,
    starts_on: '2026-09-01',
    ends_on: null,
    created_at: new Date(),
    mission_label: 'Renfort',
    account_name: 'ACME',
    consultant_name: 'Marie',
    daily_rate_cents: 650_00,
    work_location: 'Lyon Part-Dieu',
    remote_mode: 'hybrid',
  }

  it('écrit les trois champs quand ils sont saisis', async () => {
    const { service, assignments } = makeService({ rows: [row] })
    await service.assign(USER, MISSION, {
      consultantId: TALENT,
      loadPercent: 100,
      startsOn: '2026-09-01',
      endsOn: null,
      dailyRateCents: 650_00,
      workLocation: 'Lyon Part-Dieu',
      remoteMode: 'hybrid',
    })
    expect(assignments.create).toHaveBeenCalledWith(
      expect.objectContaining({ daily_rate_cents: 650_00, work_location: 'Lyon Part-Dieu', remote_mode: 'hybrid' }),
    )
  })

  it('les RELIT sur GET, taux compris, pour qui porte `finance:read`', async () => {
    const { service } = makeService({ rows: [row], role: 'owner' })
    const [item] = await service.listForMission(USER, MISSION)
    expect(item).toMatchObject({ dailyRateCents: 650_00, workLocation: 'Lyon Part-Dieu', remoteMode: 'hybrid' })
  })

  it('RETIRE le taux sans droit financier — lieu et mode restent lisibles', async () => {
    const { service } = makeService({ rows: [row], role: 'viewer' })
    const [item] = await service.listForMission(USER, MISSION)
    expect(item).not.toHaveProperty('dailyRateCents')
    expect(item).toMatchObject({ workLocation: 'Lyon Part-Dieu', remoteMode: 'hybrid' })
  })

  it('refuse d’ÉCRIRE un taux à qui n’a pas le droit financier', async () => {
    const { service } = makeService({ rows: [row], role: 'viewer' })
    await expect(
      service.assign(USER, MISSION, {
        consultantId: TALENT,
        loadPercent: 100,
        startsOn: '2026-09-01',
        endsOn: null,
        dailyRateCents: 650_00,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException)
  })
})

/**
 * #3182.2 (épopée #3248, retour bêta 28/09/2026) — l'historique de staffing
 * D'UN COMPTE : quels consultants y ont déjà été positionnés.
 *
 * MÊME lecture que `listForMission`/`listForConsultant` (`read()`) — seul le
 * filtre change (`m.account_id` au lieu de `a.mission_id`/`a.consultant_id`).
 */
describe('StaffingService.listForAccount — #3182.2', () => {
  const ACCOUNT = 'a0000000-0000-4000-8000-000000000009'
  const row = {
    id: 'as-9',
    mission_id: MISSION,
    consultant_id: TALENT,
    load_percent: 100,
    starts_on: '2026-01-01',
    ends_on: '2026-06-30',
    created_at: new Date(),
    mission_label: 'Refonte SI',
    account_name: 'ACME',
    consultant_name: 'Marie Dupont',
    daily_rate_cents: 650_00,
  }

  it('filtre la MÊME lecture par compte, scopée à l’espace', async () => {
    const { service, assignments } = makeService({ rows: [row], role: 'owner' })
    const rows = await service.listForAccount(USER, ACCOUNT)
    expect(rows).toEqual([
      expect.objectContaining({
        missionId: MISSION,
        consultantId: TALENT,
        consultantName: 'Marie Dupont',
        missionLabel: 'Refonte SI',
        startsOn: '2026-01-01',
        endsOn: '2026-06-30',
      }),
    ])
    const call = assignments.manager.query.mock.calls.find(([sql]: [string]) =>
      sql.includes('FROM mission_assignments a'),
    )
    expect(call?.[1]).toEqual([ACCOUNT, WORKSPACE])
  })

  it('retire le taux journalier sans droit financier, comme les autres lectures', async () => {
    const { service } = makeService({ rows: [row], role: 'viewer' })
    const [item] = await service.listForAccount(USER, ACCOUNT)
    expect(item).not.toHaveProperty('dailyRateCents')
  })

  it('rend une liste vide, jamais une erreur, quand aucun consultant n’a été positionné', async () => {
    const { service } = makeService({ rows: [] })
    await expect(service.listForAccount(USER, ACCOUNT)).resolves.toEqual([])
  })
})

/**
 * #2407.4 (suite) — consentement, documents, risques DÉCLARÉS.
 *
 * ⚠️ Contrairement au taux (bloc au-dessus), ces cinq champs ne sont PAS
 * financiers : aucun `finance:read` n'est requis pour les écrire ou les
 * relire — `role: 'viewer'` le prouve, là où le bloc du taux exige `owner`.
 */
describe('StaffingService — #2407.4 (suite) consentement, documents, risques déclarés', () => {
  const row = {
    id: 'as-2',
    mission_id: MISSION,
    consultant_id: TALENT,
    load_percent: 100,
    starts_on: '2026-09-01',
    ends_on: null,
    created_at: new Date(),
    mission_label: 'Renfort',
    account_name: 'ACME',
    consultant_name: 'Marie',
    consent_given: true,
    consent_date: '2026-09-01',
    documents_expected: 'Casier judiciaire',
    documents_received: 'Casier judiciaire',
    declared_risks: 'Dépendance à un seul expert',
  }

  it('écrit les cinq champs déclaratifs quand ils sont saisis', async () => {
    const { service, assignments } = makeService({ rows: [row], role: 'viewer' })
    await service.assign(USER, MISSION, {
      consultantId: TALENT,
      loadPercent: 100,
      startsOn: '2026-09-01',
      endsOn: null,
      consentGiven: true,
      consentDate: '2026-09-01',
      documentsExpected: 'Casier judiciaire',
      documentsReceived: 'Casier judiciaire',
      declaredRisks: 'Dépendance à un seul expert',
    })
    expect(assignments.create).toHaveBeenCalledWith(
      expect.objectContaining({
        consent_given: true,
        consent_date: '2026-09-01',
        documents_expected: 'Casier judiciaire',
        documents_received: 'Casier judiciaire',
        declared_risks: 'Dépendance à un seul expert',
      }),
    )
  })

  it('les RELIT sur GET — aucun droit financier requis, contrairement au taux', async () => {
    const { service } = makeService({ rows: [row], role: 'viewer' })
    const [item] = await service.listForMission(USER, MISSION)
    expect(item).toMatchObject({
      consentGiven: true,
      consentDate: '2026-09-01',
      documentsExpected: 'Casier judiciaire',
      documentsReceived: 'Casier judiciaire',
      declaredRisks: 'Dépendance à un seul expert',
    })
  })

  it('absents, ils restent `null` — jamais un défaut inventé', async () => {
    const emptyRow = {
      ...row,
      consent_given: null,
      consent_date: null,
      documents_expected: null,
      documents_received: null,
      declared_risks: null,
    }
    const { service } = makeService({ rows: [emptyRow], role: 'viewer' })
    const [item] = await service.listForMission(USER, MISSION)
    expect(item.consentGiven).toBeNull()
    expect(item.documentsExpected).toBeNull()
    expect(item.documentsReceived).toBeNull()
    expect(item.declaredRisks).toBeNull()
  })
})

/**
 * #2407.7 — LA MISSION NE BASCULE JAMAIS « TERMINÉE » PARCE QU'UN CONSULTANT SORT.
 *
 * Le découplage est structurel (`unassign` ne touche que `mission_assignments`,
 * jamais `missions`) mais rien ne le DÉMONTRAIT positivement — la mesure du
 * 22/09 soir l'a signalé `retenu` faute d'un test qui puisse rougir. Casser le
 * comportement (faire écrire `missions.update` depuis `unassign`, par exemple
 * pour recalculer un statut dérivé du nombre d'affectations actives) fait
 * échouer `expect(missions.update).not.toHaveBeenCalled()` en nommant le
 * coupable : c'est le cliquet demandé.
 */
describe('StaffingService.unassign — #2407.7 le statut mission ne dépend pas des affectations', () => {
  it('ne touche jamais la ligne mission (statut compris) quand un consultant sort', async () => {
    const { service, assignments, missions } = makeService()
    await service.unassign(USER, MISSION, 'as-1')
    expect(assignments.delete).toHaveBeenCalledWith({ id: 'as-1', mission_id: MISSION })
    // La mission n'est lue que pour vérifier qu'elle existe dans l'espace
    // (`assertMission`) — jamais écrite : son statut, comme le reste de la
    // ligne, reste sous la seule plume de `DeliveryService.updateMission`.
    expect(missions.update).not.toHaveBeenCalled()
  })

  it('remplacer un consultant (sortie + entrée) ne touche pas non plus la mission', async () => {
    const { service, assignments, missions } = makeService({
      rows: [
        {
          id: 'as-2',
          mission_id: MISSION,
          consultant_id: 'c0000000-0000-4000-8000-000000000002',
          load_percent: 100,
          starts_on: '2026-09-15',
          ends_on: null,
          created_at: new Date(),
          mission_label: 'Renfort',
          account_name: 'ACME',
          consultant_name: 'Nadia',
        },
      ],
    })
    await service.unassign(USER, MISSION, 'as-1')
    await service.assign(USER, MISSION, {
      consultantId: 'c0000000-0000-4000-8000-000000000002',
      loadPercent: 100,
      startsOn: '2026-09-15',
      endsOn: null,
    })
    expect(assignments.delete).toHaveBeenCalledTimes(1)
    expect(assignments.create).toHaveBeenCalledTimes(1)
    expect(missions.update).not.toHaveBeenCalled()
  })
})

describe('StaffingService.staffingForMany', () => {
  it('rend « inconnu » pour un talent sans affectation, jamais « disponible »', async () => {
    // Une ESN qui ne renseigne pas ses missions verrait sinon tout son vivier
    // proposé alors que les gens sont en poste.
    const { service } = makeService({ bulkRows: [] })
    const map = await service.staffingForMany(USER, [TALENT], new Date('2026-08-17T12:00:00.000Z'))
    expect(map.get(TALENT)?.availability).toBe('unknown')
  })

  it('déduit la charge des affectations en cours', async () => {
    const { service } = makeService({
      bulkRows: [
        { consultant_id: TALENT, load_percent: 60, starts_on: '2026-01-01', ends_on: '2026-12-31' },
        { consultant_id: TALENT, load_percent: 40, starts_on: '2026-01-01', ends_on: '2026-12-31' },
      ],
    })
    const map = await service.staffingForMany(USER, [TALENT], new Date('2026-08-17T12:00:00.000Z'))
    expect(map.get(TALENT)?.loadPercent).toBe(100)
    expect(map.get(TALENT)?.availability).toBe('busy')
  })

  /**
   * #3068 — une INTERRUPTION déclarée et pas encore confirmée
   * (`mission_interruptions.availability_confirmed = false`) ne doit jamais
   * laisser cette fonction annoncer « disponible ».
   */
  it('bascule en « à confirmer » sur une mission INTERROMPUE non confirmée — jamais « disponible »', async () => {
    const { service } = makeService({
      bulkRows: [
        {
          consultant_id: TALENT,
          load_percent: 100,
          starts_on: '2026-01-01',
          ends_on: '2026-08-01',
          mission_id: MISSION,
        },
      ],
      unconfirmedInterruptions: [{ mission_id: MISSION }],
    })
    const map = await service.staffingForMany(USER, [TALENT], new Date('2026-08-17T12:00:00.000Z'))
    expect(map.get(TALENT)?.availability).toBe('a_confirmer')
  })

  it('ne fait AUCUNE requête sur une liste vide', async () => {
    const { service, queries } = makeService()
    await service.staffingForMany(USER, [])
    expect(queries).toHaveLength(0)
  })
})

describe('StaffingService.readTerms', () => {
  it('VIDE conditions et marge sans le droit finance — présentes, `null`, jamais un zéro', async () => {
    // D45 (28/08/2026) : une seule rédaction, `redactFinance`, qui met à `null`
    // sans jamais retirer la clé. Ce service le faisait déjà à la main ; ce qui
    // change, c'est qu'il ne le fait plus lui-même.
    const { service } = makeService({ terms: { loaded_daily_cost_cents: '45000' } })
    const result = await service.readTerms(USER, MISSION, false)
    expect('terms' in result).toBe(true)
    expect('margin' in result).toBe(true)
    expect(result.terms).toBeNull()
    expect(result.margin).toBeNull()
  })

  it('ne LIT même pas le coût chargé sans le droit', async () => {
    // Rédiger dit ce qui SORT ; ce n'est pas une raison d'aller chercher en base
    // un coût qu'on va vider ligne suivante.
    const { service, terms } = makeService({ terms: { loaded_daily_cost_cents: '45000' } })
    await service.readTerms(USER, MISSION, false)
    expect(terms.findOne).not.toHaveBeenCalled()
  })

  it('rend la MÊME forme avec et sans le droit — mêmes clés, à la lettre', async () => {
    const { service } = makeService({
      terms: {
        loaded_daily_cost_cents: '45500',
        po_number: null,
        billing_cadence: null,
        notice_days: null,
        notes: null,
        updated_at: new Date(),
      },
    })
    const withRight = await service.readTerms(USER, MISSION, true)
    const without = await service.readTerms(USER, MISSION, false)
    expect(Object.keys(without).sort()).toEqual(Object.keys(withRight).sort())
  })

  it('convertit le TJM en centimes avant de calculer la marge', async () => {
    // Le TJM de la mission est en EUROS, le coût chargé en centimes : les
    // comparer sans convertir donnerait 99,9 % de marge sur tout.
    const { service } = makeService({
      dailyRate: 650,
      terms: {
        loaded_daily_cost_cents: '45500',
        po_number: null,
        billing_cadence: null,
        notice_days: null,
        notes: null,
        updated_at: new Date(),
      },
    })
    const result = await service.readTerms(USER, MISSION, true)
    expect(result.margin).toEqual({ amountCents: 19_500, percent: 30 })
  })

  it('rend une marge nulle quand le coût n’est pas renseigné', async () => {
    const { service } = makeService({ terms: null })
    const result = await service.readTerms(USER, MISSION, true)
    expect(result.margin).toBeNull()
    expect(result.terms).toBeNull()
  })

  it('rend une marge nulle quand le TJM manque', async () => {
    const { service } = makeService({
      dailyRate: null,
      terms: {
        loaded_daily_cost_cents: '45500',
        po_number: null,
        billing_cadence: null,
        notice_days: null,
        notes: null,
        updated_at: new Date(),
      },
    })
    expect((await service.readTerms(USER, MISSION, true)).margin).toBeNull()
  })
})

describe('StaffingService.readTerms — les frais (30/08/2026)', () => {
  const TERMS = {
    loaded_daily_cost_cents: '45500',
    po_number: null,
    billing_cadence: null,
    notice_days: null,
    notes: null,
    updated_at: new Date(),
  }

  it('rend `expensesTotalCents` à 0 sur une mission sans ligne — un fait vrai, pas un défaut', async () => {
    const { service } = makeService({ terms: TERMS, expensesTotalCents: 0 })
    const result = await service.readTerms(USER, MISSION, true)
    expect(result.expensesTotalCents).toBe(0)
    expect(result.marginWithExpenses).toBeNull()
  })

  it('calcule la marge NETTE quand des frais existent et sont amortissables', async () => {
    // Mission démarrée il y a 10 jours (bornée à aujourd'hui), 10 000 de frais
    // → 1 000/jour amortis. Marge de base 19 500 (30 %) → nette 18 500.
    // ⚠️ `shiftLocalDays` et non `toISOString()` : entre minuit et 02 h 00 en
    // heure d'été, l'ancien calcul reculait d'un jour et le test comptait ONZE
    // jours amortis au lieu de dix. Il rougissait donc deux heures chaque nuit.
    const tenDaysAgo = shiftLocalDays(new Date(), -9)
    const { service } = makeService({
      dailyRate: 650,
      startedOn: tenDaysAgo,
      terms: TERMS,
      expensesTotalCents: 10_000,
    })
    const result = await service.readTerms(USER, MISSION, true)
    expect(result.expensesTotalCents).toBe(10_000)
    expect(result.marginWithExpenses).toEqual({ amountCents: 18_500, percent: 28.5 })
    // La marge de BASE reste celle d'avant — elle ne s'est jamais dite « nette »,
    // et continuer à l'appeler ainsi mentirait sur ce qu'elle inclut.
    expect(result.margin).toEqual({ amountCents: 19_500, percent: 30 })
  })

  it('des frais SANS date de début restent NON amortis — jamais devinés', async () => {
    const { service } = makeService({ dailyRate: 650, startedOn: null, terms: TERMS, expensesTotalCents: 10_000 })
    const result = await service.readTerms(USER, MISSION, true)
    expect(result.expensesTotalCents).toBe(10_000)
    expect(result.marginWithExpenses).toBeNull()
  })

  it('VIDE `expensesTotalCents` et `marginWithExpenses` sans le droit finance', async () => {
    const { service } = makeService({ terms: TERMS, expensesTotalCents: 10_000 })
    const result = await service.readTerms(USER, MISSION, false)
    expect('expensesTotalCents' in result).toBe(true)
    expect('marginWithExpenses' in result).toBe(true)
    expect(result.expensesTotalCents).toBeNull()
    expect(result.marginWithExpenses).toBeNull()
  })
})

describe('StaffingService.readTerms — les factures fournisseur (30/08/2026)', () => {
  const TERMS = {
    loaded_daily_cost_cents: '45500',
    po_number: null,
    billing_cadence: null,
    notice_days: null,
    notes: null,
    updated_at: new Date(),
  }

  it('rend `supplierInvoicesTotalCents` à 0 sur une mission sans facture', async () => {
    const { service } = makeService({ terms: TERMS, supplierInvoicesTotalCents: 0 })
    const result = await service.readTerms(USER, MISSION, true)
    expect(result.supplierInvoicesTotalCents).toBe(0)
  })

  it('entre dans la marge NETTE, exactement comme les frais — même appelant, même soin', async () => {
    // Marge de base 19 500 (30 %). 5 000 de frais + 5 000 de facture
    // fournisseur = 10 000 amortis sur 10 jours → 1 000/jour. Marge nette
    // 18 500 — IDENTIQUE au cas « frais seuls » testé plus haut : les deux
    // sources de coût s'additionnent avant d'être amorties.
    // ⚠️ `shiftLocalDays` et non `toISOString()` : entre minuit et 02 h 00 en
    // heure d'été, l'ancien calcul reculait d'un jour et le test comptait ONZE
    // jours amortis au lieu de dix. Il rougissait donc deux heures chaque nuit.
    const tenDaysAgo = shiftLocalDays(new Date(), -9)
    const { service } = makeService({
      dailyRate: 650,
      startedOn: tenDaysAgo,
      terms: TERMS,
      expensesTotalCents: 5_000,
      supplierInvoicesTotalCents: 5_000,
    })
    const result = await service.readTerms(USER, MISSION, true)
    expect(result.supplierInvoicesTotalCents).toBe(5_000)
    expect(result.marginWithExpenses).toEqual({ amountCents: 18_500, percent: 28.5 })
  })

  it('VIDE `supplierInvoicesTotalCents` sans le droit finance', async () => {
    const { service } = makeService({ terms: TERMS, supplierInvoicesTotalCents: 20_000 })
    const result = await service.readTerms(USER, MISSION, false)
    expect('supplierInvoicesTotalCents' in result).toBe(true)
    expect(result.supplierInvoicesTotalCents).toBeNull()
  })
})

/*  ────────────────────────────────────────────────────────────────────────  */
/*  LA CONSOMMATION D'UN BON DE COMMANDE — trois cas, séparément               */
/*                                                                            */
/*  « volume non renseigné » et « consommation non mesurée » sont deux        */
/*  messages différents à l'écran ; les confondre derrière le même `null`     */
/*  ferait perdre lequel des deux gestes propose de faire — saisir un volume, */
/*  ou aller relire le relevé.                                                */
/*  ────────────────────────────────────────────────────────────────────────  */

const TERMS_WITH_VOLUME = {
  loaded_daily_cost_cents: null,
  channel: 'direct',
  po_number: 'PO-2026-0418',
  po_issued_on: '2026-03-01',
  po_amount_cents: '2800000',
  // `number`, pas une chaîne : `po_volume_days` porte un transformer sur
  // l'entité (comme `missions.daily_rate`), donc un VRAI `findOne` TypeORM le
  // rend déjà converti. Le mock ne rejoue pas les transformers ; le fixer ici
  // reproduit ce que la base rend réellement — voir `dailyRate: 650` sur le
  // mock des missions, qui fait la même chose pour la même raison.
  po_volume_days: 50,
  billing_cadence: null,
  notice_days: null,
  notes: null,
  updated_at: new Date(),
}

describe('StaffingService.readTerms — la consommation du bon de commande', () => {
  it('les DEUX connus : 56 %, et les jours restants', async () => {
    const { service } = makeService({ terms: TERMS_WITH_VOLUME, consumedRows: [{ days: '28' }] })
    const { terms } = await service.readTerms(USER, MISSION, true)
    expect(terms?.poVolumeDays).toBe(50)
    expect(terms?.poConsumedDays).toBe(28)
    expect(terms?.poConsumption).toEqual({ percent: 56, remainingDays: 22 })
  })

  it('le VOLUME manque : pas de barre, jamais 0 % — et aucune requête inutile sur les relevés', async () => {
    const { service, queries } = makeService({
      terms: { ...TERMS_WITH_VOLUME, po_volume_days: null },
    })
    const { terms } = await service.readTerms(USER, MISSION, true)
    expect(terms?.poVolumeDays).toBeNull()
    expect(terms?.poConsumption).toBeNull()
    // Sans volume, la barre ne s'affichera de toute façon pas : la requête sur
    // `mission_timesheets` serait un aller-retour pour rien.
    // #2420 : la requête visée est celle de la CONSOMMATION (`SUM(days) AS days`)
    // — le moteur de marge lit, lui, les jours du mois pour une autre raison.
    expect(queries.some(q => q.sql.includes('SUM(days) AS days'))).toBe(false)
  })

  it('la consommation compte aussi les jours saisis sans CRA des mois sans relevé (#2563)', async () => {
    const { service, queries } = makeService({ terms: TERMS_WITH_VOLUME })
    await service.readTerms(USER, MISSION, true)
    const consumption = queries.find(q => q.sql.includes('SUM(days) AS days'))
    expect(consumption?.sql).toContain('mission_month_preparations')
    // Jamais deux fois le même mois : la saisie ne compte que si aucun relevé compté ne le couvre.
    expect(consumption?.sql).toContain('NOT EXISTS')
  })

  it('la CONSOMMATION n’est pas mesurable : « non mesurée », jamais « 0 % consommé »', async () => {
    // Aucun relevé COMPTÉ pour cette mission — `SUM` rend `null` sur un
    // ensemble vide, exactement ce que le mock par défaut reproduit.
    const { service } = makeService({ terms: TERMS_WITH_VOLUME, consumedRows: [{ days: null }] })
    const { terms } = await service.readTerms(USER, MISSION, true)
    expect(terms?.poVolumeDays).toBe(50)
    expect(terms?.poConsumedDays).toBeNull()
    expect(terms?.poConsumption).toBeNull()
  })

  it('un DÉPASSEMENT se voit — le pourcentage dépasse 100, les jours restants sont négatifs', async () => {
    const { service } = makeService({ terms: TERMS_WITH_VOLUME, consumedRows: [{ days: '60' }] })
    const { terms } = await service.readTerms(USER, MISSION, true)
    expect(terms?.poConsumption).toEqual({ percent: 120, remainingDays: -10 })
  })

  it('relit la date, le montant et le volume — bigint et numeric convertis, jamais concaténés', async () => {
    const { service } = makeService({ terms: TERMS_WITH_VOLUME, consumedRows: [{ days: '28' }] })
    const { terms } = await service.readTerms(USER, MISSION, true)
    expect(terms?.poIssuedOn).toBe('2026-03-01')
    expect(terms?.poAmountCents).toBe(2_800_000)
    expect(terms?.poVolumeDays).toBe(50)
  })

  // #2566.2
  it('relit `poValidUntil`', async () => {
    const { service } = makeService({
      terms: { ...TERMS_WITH_VOLUME, po_valid_until: '2026-09-30' },
      consumedRows: [{ days: '28' }],
    })
    const { terms } = await service.readTerms(USER, MISSION, true)
    expect(terms?.poValidUntil).toBe('2026-09-30')
  })

  it('VIDE aussi les termes du bon de commande sans le droit finance', async () => {
    const { service } = makeService({ terms: TERMS_WITH_VOLUME, consumedRows: [{ days: '28' }] })
    const { terms } = await service.readTerms(USER, MISSION, false)
    expect(terms).toBeNull()
  })
})

/*  ────────────────────────────────────────────────────────────────────────  */
/*  #2422.7 — LES AUTRES MISSIONS DU MÊME BON DE COMMANDE                     */
/*  ────────────────────────────────────────────────────────────────────────  */

describe('StaffingService.readTerms — les autres missions du même bon de commande', () => {
  it('liste les autres missions qui partagent le même `poNumber`, scopées à l’espace courant', async () => {
    const { service, queries } = makeService({
      terms: TERMS_WITH_VOLUME,
      consumedRows: [{ days: '28' }],
      otherPoMissionRows: [
        { mission_id: 'm0000000-0000-4000-8000-000000000002', mission_label: 'Lot 2', account_name: 'Acme' },
      ],
    })
    const { terms } = await service.readTerms(USER, MISSION, true)
    expect(terms?.poOtherMissions).toEqual([
      { missionId: 'm0000000-0000-4000-8000-000000000002', missionLabel: 'Lot 2', accountName: 'Acme' },
    ])
    const otherPoQuery = queries.find(q => q.sql.includes('FROM mission_commercial_terms mct'))
    expect(otherPoQuery?.params).toEqual([WORKSPACE, 'PO-2026-0418', MISSION])
  })

  it('rend `[]` — pas une ligne « non mesurée » — quand aucune autre mission ne partage ce numéro', async () => {
    const { service } = makeService({ terms: TERMS_WITH_VOLUME, consumedRows: [{ days: '28' }] })
    const { terms } = await service.readTerms(USER, MISSION, true)
    expect(terms?.poOtherMissions).toEqual([])
  })

  it('rend `[]` sans requête — aucun numéro de bon de commande à comparer', async () => {
    const { service, queries } = makeService({
      terms: { ...TERMS_WITH_VOLUME, po_number: null },
      consumedRows: [{ days: '28' }],
    })
    const { terms } = await service.readTerms(USER, MISSION, true)
    expect(terms?.poOtherMissions).toEqual([])
    expect(queries.some(q => q.sql.includes('FROM mission_commercial_terms mct'))).toBe(false)
  })
})

describe('StaffingService.canReadFinance', () => {
  it('accorde le droit au propriétaire', async () => {
    const { service } = makeService({ role: 'owner' })
    await expect(service.canReadFinance(USER)).resolves.toBe(true)
  })

  it('le refuse à un commercial — un TJM se saisit sans connaître la paie', async () => {
    const { service } = makeService({ role: 'sales' })
    await expect(service.canReadFinance(USER)).resolves.toBe(false)
  })

  it('le refuse au rôle HISTORIQUE — un droit neuf ne s’accorde pas rétroactivement', async () => {
    const { service } = makeService({ role: 'member' })
    await expect(service.canReadFinance(USER)).resolves.toBe(false)
  })

  /*  D47 · 26/08/2026 — la FICHE s'aligne sur la LISTE                        */
  /*                                                                            */
  /*  La liste des missions lit le droit avec `can(role, extra, …)` ; la fiche  */
  /*  le lisait avec le RÔLE SEUL. Un membre à qui `finance:read` est accordé   */
  /*  en propre voyait donc la marge dans la liste et « hors périmètre » sur la */
  /*  fiche de la MÊME mission. Pire : le guard de `PUT terms` étant additif,   */
  /*  il pouvait SAISIR le coût chargé sans jamais le relire.                   */

  it('ÉLARGIT : un recruteur à qui `finance:read` est accordé en propre voit la marge', async () => {
    // Le cas est nommé dans le code même du RBAC (`workspace.ts`) : « le
    // recruteur qui doit voir la marge sur une mission précise ».
    const { service } = makeService({ role: 'recruiter', extra: ['finance:read'] })
    await expect(service.canReadFinance(USER)).resolves.toBe(true)
  })

  it('n’élargit QUE ça : un accord sur une autre permission n’ouvre pas la finance', async () => {
    const { service } = makeService({ role: 'sales', extra: ['integrations:manage', 'data:export'] })
    await expect(service.canReadFinance(USER)).resolves.toBe(false)
  })

  it('un accord sur `finance:read:own` n’est pas `finance:read` — la portée est le lot', async () => {
    // D1 · 26/08 : le commercial voit SON chiffre. Ce n'est pas la marge des
    // collègues, et les deux permissions ne se substituent pas l'une à l'autre.
    const { service } = makeService({ role: 'sales', extra: ['finance:read:own'] })
    await expect(service.canReadFinance(USER)).resolves.toBe(false)
  })

  /**
   * La preuve d'ALIGNEMENT, et la seule qui vaille : pour les neuf rôles, avec
   * et sans accord nominatif, la fiche répond EXACTEMENT ce que `can()` répond —
   * donc exactement ce que la liste répond. Une garde qui n'énumérerait qu'un
   * rôle laisserait passer le prochain écart.
   */
  it('répond comme `can()` pour les 9 rôles, avec et sans accord nominatif', async () => {
    expect(workspaceRoleValues.length).toBeGreaterThan(0)
    const cases: { role: WorkspaceRole; extra: WorkspacePermission[] }[] = workspaceRoleValues.flatMap(role => [
      { role, extra: [] as WorkspacePermission[] },
      { role, extra: ['finance:read'] as WorkspacePermission[] },
      { role, extra: ['records:write'] as WorkspacePermission[] },
    ])
    expect(cases).toHaveLength(workspaceRoleValues.length * 3)

    for (const { role, extra } of cases) {
      const { service } = makeService({ role, extra })
      await expect(service.canReadFinance(USER)).resolves.toBe(can(role, extra, 'finance:read'))
    }
  })

  it('lit les accords de l’espace ACTIF, pas d’un autre', async () => {
    // Sans cet appel, l'élargissement se ferait sur une liste vide et le lot
    // n'aurait rien changé : la garde vérifie que la source est LUE.
    const { service, workspaceContext } = makeService({ role: 'recruiter', extra: ['finance:read'] })
    await service.canReadFinance(USER)
    expect(workspaceContext.extraPermissionsOf).toHaveBeenCalledWith(WORKSPACE, USER)
  })
})

/*  ────────────────────────────────────────────────────────────────────────  */
/*  DEUX COLONNES LUES ET JAMAIS ÉCRITES                                      */
/*                                                                            */
/*  `requires_po` et `partner_commission_daily_cents` existaient en base,     */
/*  étaient LUES — le bloqueur « bon de commande exigé et absent » d'un côté, */
/*  `trueDailyCostCents` de l'autre — et n'étaient écrites NULLE PART. Le     */
/*  bloqueur ne pouvait donc se déclencher sur aucun espace, et la marge des  */
/*  canaux `partner` et `subcontracting` était structurellement muette, sur   */
/*  les deux seuls canaux que l'indicateur existe pour comparer.              */
/*  ────────────────────────────────────────────────────────────────────────  */

/** L'écriture des conditions commerciales, retrouvée par ce qu'elle FAIT et non
 *  par son rang dans la liste des requêtes. */
function upsertQuery(queries: { sql: string; params: unknown[] }[]) {
  const query = queries.find(entry => entry.sql.includes('INSERT INTO mission_commercial_terms'))
  if (!query) throw new Error('aucune écriture des conditions commerciales')
  return query
}

/**
 * La valeur envoyée pour UNE colonne, retrouvée par son NOM.
 *
 * Jamais par son rang : une colonne insérée au milieu décale tous les `$n`, et
 * une garde qui compte les positions resterait VERTE en lisant la valeur de la
 * colonne voisine. Le semis de la démonstration porte le même avertissement,
 * pour la même raison.
 */
function insertedValue(query: { sql: string; params: unknown[] }, column: string): unknown {
  const sql = query.sql.replace(/\s+/g, ' ')
  const columns = /INSERT INTO mission_commercial_terms \(([^)]+)\)/.exec(sql)?.[1]
  const values = /VALUES \((.*?)\) ON CONFLICT/.exec(sql)?.[1]
  if (!columns || !values) throw new Error('requête d’écriture illisible')
  const names = columns.split(',').map(name => name.trim())
  const expressions = values.split(',').map(value => value.trim())
  // Une garde qui ne lit rien passe au vert sur du vide : la liste doit avoir
  // la taille d'une vraie table, et les deux listes doivent s'aligner.
  expect(names.length).toBeGreaterThanOrEqual(10)
  expect(expressions).toHaveLength(names.length)
  const index = names.indexOf(column)
  if (index < 0) throw new Error(`colonne « ${column} » absente de l’écriture`)
  const placeholder = /\$(\d+)/.exec(expressions[index] as string)?.[1]
  if (!placeholder) throw new Error(`colonne « ${column} » écrite sans paramètre`)
  return query.params[Number(placeholder) - 1]
}

/** Le drapeau « ce champ était-il DANS la charge utile ? », lu sur la branche
 *  `ON CONFLICT` de la colonne. C'est lui qui distingue « efface » de « ne
 *  touche pas ». */
function presenceFlag(query: { sql: string; params: unknown[] }, column: string): unknown {
  const placeholder = new RegExp(`${column} = CASE WHEN \\$(\\d+)`).exec(query.sql.replace(/\s+/g, ' '))?.[1]
  if (!placeholder) throw new Error(`colonne « ${column} » sans drapeau de présence`)
  return query.params[Number(placeholder) - 1]
}

const STORED_TERMS = {
  loaded_daily_cost_cents: '45500',
  channel: 'partner',
  requires_po: true,
  po_number: 'PO-2026-0418',
  billing_cadence: null,
  partner_commission_daily_cents: '6000',
  notice_days: null,
  notes: null,
  updated_at: new Date(),
}

describe('StaffingService.upsertTerms', () => {
  it('ÉCRIT le bon de commande exigé — sans quoi le bloqueur ne se déclenche nulle part', async () => {
    const { service, queries } = makeService({ terms: STORED_TERMS })
    await service.upsertTerms(USER, MISSION, {
      loadedDailyCostCents: 45_500,
      channel: 'direct',
      requiresPo: true,
      poNumber: 'PO-2026-0418',
      billingCadence: null,
      noticeDays: null,
      notes: null,
    })
    expect(insertedValue(upsertQuery(queries), 'requires_po')).toBe(true)
  })

  it('ÉCRIT la commission d’intermédiaire — sans quoi la marge par canal reste muette', async () => {
    const { service, queries } = makeService({ terms: STORED_TERMS })
    await service.upsertTerms(USER, MISSION, {
      loadedDailyCostCents: 45_500,
      channel: 'partner',
      poNumber: null,
      billingCadence: null,
      partnerCommissionDailyCents: 6_000,
      noticeDays: null,
      notes: null,
    })
    expect(insertedValue(upsertQuery(queries), 'partner_commission_daily_cents')).toBe(6_000)
  })

  it('écrit une commission à ZÉRO telle quelle — c’est une réponse, pas une absence', async () => {
    const { service, queries } = makeService({ terms: STORED_TERMS })
    await service.upsertTerms(USER, MISSION, {
      loadedDailyCostCents: null,
      channel: 'partner',
      poNumber: null,
      billingCadence: null,
      partnerCommissionDailyCents: 0,
      noticeDays: null,
      notes: null,
    })
    expect(insertedValue(upsertQuery(queries), 'partner_commission_daily_cents')).toBe(0)
    expect(presenceFlag(upsertQuery(queries), 'partner_commission_daily_cents')).toBe(true)
  })

  it('ABSENT = INCHANGÉ : un écran d’hier qui enregistre un coût n’efface pas les deux champs', async () => {
    // C'est le défaut « `raw_analysis` remplacé, pas fusionné » : la fiche
    // mission recopie les six champs qu'elle connaît et ne peut pas recopier
    // ceux qui sont arrivés après elle. Sans drapeau de présence, chaque saisie
    // de coût remettrait le bon de commande à « non exigé » et effacerait la
    // commission — c'est-à-dire re-casserait exactement ce que ce lot répare.
    const { service, queries } = makeService({ terms: STORED_TERMS })
    await service.upsertTerms(USER, MISSION, {
      loadedDailyCostCents: 45_500,
      channel: 'partner',
      poNumber: null,
      billingCadence: null,
      noticeDays: null,
      notes: null,
    })
    const query = upsertQuery(queries)
    expect(presenceFlag(query, 'requires_po')).toBe(false)
    expect(presenceFlag(query, 'partner_commission_daily_cents')).toBe(false)
    // Et la branche de conflit conserve VRAIMENT la valeur en base.
    const sql = query.sql.replace(/\s+/g, ' ')
    expect(sql).toContain('ELSE mission_commercial_terms.requires_po END')
    expect(sql).toContain('ELSE mission_commercial_terms.partner_commission_daily_cents END')
  })

  it('`null` EXPLICITE efface la commission — « on ne sait plus » se saisit', async () => {
    const { service, queries } = makeService({ terms: STORED_TERMS })
    await service.upsertTerms(USER, MISSION, {
      loadedDailyCostCents: null,
      channel: 'partner',
      poNumber: null,
      billingCadence: null,
      partnerCommissionDailyCents: null,
      noticeDays: null,
      notes: null,
    })
    const query = upsertQuery(queries)
    expect(insertedValue(query, 'partner_commission_daily_cents')).toBeNull()
    expect(presenceFlag(query, 'partner_commission_daily_cents')).toBe(true)
  })

  it('sur une ligne NEUVE, un bon de commande non dit vaut « non exigé » — la colonne est NOT NULL', async () => {
    const { service, queries } = makeService({ terms: STORED_TERMS })
    await service.upsertTerms(USER, MISSION, {
      loadedDailyCostCents: null,
      channel: 'unknown',
      poNumber: null,
      billingCadence: null,
      noticeDays: null,
      notes: null,
    })
    expect(insertedValue(upsertQuery(queries), 'requires_po')).toBe(false)
  })

  it('ÉCRIT la date, le montant et le volume du bon de commande', async () => {
    const { service, queries } = makeService({ terms: STORED_TERMS })
    await service.upsertTerms(USER, MISSION, {
      loadedDailyCostCents: null,
      channel: 'direct',
      poNumber: 'PO-2026-0418',
      billingCadence: null,
      noticeDays: null,
      notes: null,
      poIssuedOn: '2026-03-01',
      poAmountCents: 2_800_000,
      poVolumeDays: 50,
    })
    const query = upsertQuery(queries)
    expect(insertedValue(query, 'po_issued_on')).toBe('2026-03-01')
    expect(insertedValue(query, 'po_amount_cents')).toBe(2_800_000)
    expect(insertedValue(query, 'po_volume_days')).toBe(50)
  })

  it('ABSENT = INCHANGÉ pour les trois termes du bon de commande — un enregistrement de coût ne les efface pas', async () => {
    const { service, queries } = makeService({ terms: STORED_TERMS })
    await service.upsertTerms(USER, MISSION, {
      loadedDailyCostCents: 45_500,
      channel: 'partner',
      poNumber: null,
      billingCadence: null,
      noticeDays: null,
      notes: null,
    })
    const query = upsertQuery(queries)
    expect(presenceFlag(query, 'po_issued_on')).toBe(false)
    expect(presenceFlag(query, 'po_amount_cents')).toBe(false)
    expect(presenceFlag(query, 'po_volume_days')).toBe(false)
    const sql = query.sql.replace(/\s+/g, ' ')
    expect(sql).toContain('ELSE mission_commercial_terms.po_issued_on END')
    expect(sql).toContain('ELSE mission_commercial_terms.po_amount_cents END')
    expect(sql).toContain('ELSE mission_commercial_terms.po_volume_days END')
  })

  it('`null` EXPLICITE efface la date, le montant ou le volume — « on ne sait plus » se saisit', async () => {
    const { service, queries } = makeService({ terms: STORED_TERMS })
    await service.upsertTerms(USER, MISSION, {
      loadedDailyCostCents: null,
      channel: 'direct',
      poNumber: null,
      billingCadence: null,
      noticeDays: null,
      notes: null,
      poIssuedOn: null,
      poAmountCents: null,
      poVolumeDays: null,
    })
    const query = upsertQuery(queries)
    expect(insertedValue(query, 'po_issued_on')).toBeNull()
    expect(insertedValue(query, 'po_amount_cents')).toBeNull()
    expect(insertedValue(query, 'po_volume_days')).toBeNull()
    expect(presenceFlag(query, 'po_issued_on')).toBe(true)
    expect(presenceFlag(query, 'po_amount_cents')).toBe(true)
    expect(presenceFlag(query, 'po_volume_days')).toBe(true)
  })

  // #2566.2 — même régime FUSION que les trois termes juste au-dessus.
  it('ÉCRIT la date de validité du bon de commande', async () => {
    const { service, queries } = makeService({ terms: STORED_TERMS })
    await service.upsertTerms(USER, MISSION, {
      loadedDailyCostCents: null,
      channel: 'direct',
      poNumber: 'PO-2026-0418',
      billingCadence: null,
      noticeDays: null,
      notes: null,
      poValidUntil: '2026-09-30',
    })
    const query = upsertQuery(queries)
    expect(insertedValue(query, 'po_valid_until')).toBe('2026-09-30')
    expect(presenceFlag(query, 'po_valid_until')).toBe(true)
  })

  it('ABSENT = INCHANGÉ pour `poValidUntil` — un enregistrement de coût ne l’efface pas', async () => {
    const { service, queries } = makeService({ terms: STORED_TERMS })
    await service.upsertTerms(USER, MISSION, {
      loadedDailyCostCents: 45_500,
      channel: 'partner',
      poNumber: null,
      billingCadence: null,
      noticeDays: null,
      notes: null,
    })
    const query = upsertQuery(queries)
    expect(presenceFlag(query, 'po_valid_until')).toBe(false)
    expect(query.sql.replace(/\s+/g, ' ')).toContain('ELSE mission_commercial_terms.po_valid_until END')
  })

  it('`null` EXPLICITE efface `poValidUntil`', async () => {
    const { service, queries } = makeService({ terms: STORED_TERMS })
    await service.upsertTerms(USER, MISSION, {
      loadedDailyCostCents: null,
      channel: 'direct',
      poNumber: null,
      billingCadence: null,
      noticeDays: null,
      notes: null,
      poValidUntil: null,
    })
    const query = upsertQuery(queries)
    expect(insertedValue(query, 'po_valid_until')).toBeNull()
    expect(presenceFlag(query, 'po_valid_until')).toBe(true)
  })
})

describe('StaffingService.readTerms — ce que la fiche RELIT', () => {
  it('rend les deux champs saisis', async () => {
    const { service } = makeService({ terms: STORED_TERMS })
    const { terms } = await service.readTerms(USER, MISSION, true)
    expect(terms?.requiresPo).toBe(true)
    // `bigint` revient en CHAÎNE de Postgres : sans conversion, la commission
    // sortirait en `'6000'` et toute arithmétique aval la concaténerait.
    expect(terms?.partnerCommissionDailyCents).toBe(6_000)
  })

  it('une ligne d’AVANT les colonnes rend `false` et `null`, jamais 0', async () => {
    const { service } = makeService({
      terms: {
        loaded_daily_cost_cents: '45500',
        po_number: null,
        billing_cadence: null,
        notice_days: null,
        notes: null,
        updated_at: new Date(),
      },
    })
    const { terms } = await service.readTerms(USER, MISSION, true)
    expect(terms?.requiresPo).toBe(false)
    expect(terms?.partnerCommissionDailyCents).toBeNull()
  })
})

/*  ────────────────────────────────────────────────────────────────────────  */
/*  LE PANNEAU LATÉRAL DE PLANIFICATION — entité cliente et trois contacts    */
/*  (PDF-22 §7). Le point le plus manquant de l'écran : « rien sur cette      */
/*  ligne ne porte de chargé d'affaires » (PaymentReminderDue.tsx:35-40).     */
/*  ────────────────────────────────────────────────────────────────────────  */

describe('StaffingService.readContacts', () => {
  it('rend `null` PARTOUT sur une mission sans aucun contact renseigné — jamais un objet vide', async () => {
    const { service } = makeService({ entityRows: [{ company_name: 'ACME', address: null, siren: null }] })
    const panel = await service.readContacts(USER, MISSION)
    expect(panel.consultant).toBeNull()
    expect(panel.businessManager).toBeNull()
    expect(panel.craValidator).toBeNull()
    expect(panel.billingRecipientEmail).toBeNull()
    // #2561 — sans `crm_deal_id`, aucun deal rattaché : jamais un objet vide.
    expect(panel.crmDeal).toBeNull()
  })

  it('#2561 — sans `crm_deal_id`, AUCUNE requête `crm_deal_facts`', async () => {
    const { service, queries } = makeService({ crmDealId: null })
    await service.readContacts(USER, MISSION)
    expect(queries.some(q => q.sql.includes('FROM crm_deal_facts'))).toBe(false)
  })

  it('#2561 — le DEAL rattaché vient de `crm_deal_id` → `crm_deal_facts`, champ par champ', async () => {
    const { service } = makeService({
      crmDealId: 'd0000000-0000-4000-8000-000000000001',
      crmDealRows: [
        {
          provider: 'hubspot',
          deal_id: '55501',
          name: 'Renouvellement Q4',
          stage: 'negotiation',
          stage_label: 'Négociation',
          amount: '24000',
          is_closed: false,
          is_won: null,
        },
      ],
    })
    const panel = await service.readContacts(USER, MISSION)
    expect(panel.crmDeal).toEqual({
      provider: 'hubspot',
      dealId: '55501',
      name: 'Renouvellement Q4',
      stage: 'negotiation',
      stageLabel: 'Négociation',
      amount: '24000',
      isClosed: false,
      isWon: null,
    })
  })

  it('#2561 — un `crm_deal_id` qui ne correspond plus à aucun fait (deal purgé) rend `null`, jamais une erreur', async () => {
    const { service } = makeService({ crmDealId: 'd0000000-0000-4000-8000-000000000001', crmDealRows: [] })
    const panel = await service.readContacts(USER, MISSION)
    expect(panel.crmDeal).toBeNull()
  })

  it('rend l’ENTITÉ cliente — raison sociale, adresse, SIREN, jamais un SIRET inventé', async () => {
    const { service } = makeService({
      entityRows: [{ company_name: 'Lacoste Operations Market', address: '10080 Troyes, France', siren: '123456789' }],
    })
    const panel = await service.readContacts(USER, MISSION)
    expect(panel.entity).toEqual({
      name: 'Lacoste Operations Market',
      address: '10080 Troyes, France',
      siren: '123456789',
    })
  })

  it('le CONSULTANT vient de la plus récente affectation, e-mail et téléphone compris', async () => {
    const { service } = makeService({
      consultantContactRows: [{ full_name: 'Yannick Succab', email: 'ysuccab@gmail.com', phone: '+33678787875' }],
    })
    const panel = await service.readContacts(USER, MISSION)
    expect(panel.consultant).toEqual({ name: 'Yannick Succab', email: 'ysuccab@gmail.com', phone: '+33678787875' })
  })

  it('le CHARGÉ D’AFFAIRES vient de `owner_id` → `profiles` — sans téléphone, jamais inventé', async () => {
    const { service } = makeService({
      ownerId: 'p0000000-0000-4000-8000-000000000001',
      businessManagerRows: [{ first_name: 'Maureen', last_name: 'Incrociati', email: 'maureen@example.com' }],
    })
    const panel = await service.readContacts(USER, MISSION)
    expect(panel.businessManager).toEqual({ name: 'Maureen Incrociati', email: 'maureen@example.com', phone: null })
  })

  it('sans `owner_id`, AUCUNE requête `profiles` — pas de chargé d’affaires à chercher', async () => {
    const { service, queries } = makeService({ ownerId: null })
    await service.readContacts(USER, MISSION)
    expect(queries.some(q => q.sql.includes('FROM profiles'))).toBe(false)
  })

  it('le CONTACT CRA vient de `cra_contact_id` → `contacts`', async () => {
    const { service } = makeService({
      craContactId: 'c0000000-0000-4000-8000-000000000099',
      craContactRows: [{ full_name: 'Julien Dubois', email: 'jdubois@lacoste.com', phone: null }],
    })
    const panel = await service.readContacts(USER, MISSION)
    expect(panel.craValidator).toEqual({ name: 'Julien Dubois', email: 'jdubois@lacoste.com', phone: null })
  })

  it('le DESTINATAIRE de facturation vient de `billing_contact_id`, en e-mail seul', async () => {
    const { service } = makeService({
      billingContactId: 'c0000000-0000-4000-8000-000000000098',
      billingContactRows: [{ email: 'jdubois@lacoste.com' }],
    })
    const panel = await service.readContacts(USER, MISSION)
    expect(panel.billingRecipientEmail).toBe('jdubois@lacoste.com')
  })

  it('refuse une mission d’un autre espace', async () => {
    const { service } = makeService({ missionMissing: true })
    await expect(service.readContacts(USER, MISSION)).rejects.toBeInstanceOf(NotFoundException)
  })
})

describe('StaffingService.setCraContact', () => {
  it('ÉCRIT le contact CRA quand il appartient au compte de la mission', async () => {
    const { service, missions } = makeService({ craContactValid: [{ id: 'contact-1' }] })
    await service.setCraContact(USER, MISSION, 'contact-1')
    expect(missions.update).toHaveBeenCalledWith(
      { id: MISSION, workspace_id: WORKSPACE },
      { cra_contact_id: 'contact-1' },
    )
  })

  it('REFUSE un contact d’un AUTRE compte — deux comptes ne se mélangent pas', async () => {
    const { service, missions } = makeService({ craContactValid: [] })
    await expect(service.setCraContact(USER, MISSION, 'contact-1')).rejects.toBeInstanceOf(BadRequestException)
    expect(missions.update).not.toHaveBeenCalled()
  })

  it('RETIRE le contact CRA avec `null` — redevient « non désigné », sans vérification à faire', async () => {
    const { service, missions, queries } = makeService()
    await service.setCraContact(USER, MISSION, null)
    expect(missions.update).toHaveBeenCalledWith({ id: MISSION, workspace_id: WORKSPACE }, { cra_contact_id: null })
    expect(queries.some(q => q.sql.includes('AND account_id'))).toBe(false)
  })

  it('refuse une mission d’un autre espace', async () => {
    const { service } = makeService({ missionMissing: true })
    await expect(service.setCraContact(USER, MISSION, 'contact-1')).rejects.toBeInstanceOf(NotFoundException)
  })
})

describe('#2836 — le MANAGER CLIENT', () => {
  it('le panneau lit `client_manager_contact_id` → `contacts`, scopé au compte', async () => {
    const { service, queries } = makeService({
      clientManagerId: 'c0000000-0000-4000-8000-000000000097',
      clientManagerRows: [{ full_name: 'Hélène Marchal', email: 'hmarchal@lacoste.com', phone: '+33100000000' }],
    })
    const panel = await service.readContacts(USER, MISSION)
    expect(panel.clientManager).toEqual({
      name: 'Hélène Marchal',
      email: 'hmarchal@lacoste.com',
      phone: '+33100000000',
    })
    expect(panel.clientManagerContactId).toBe('c0000000-0000-4000-8000-000000000097')
    const read = queries.find(q => q.sql.includes('AND id = $1'))
    expect(read?.params).toEqual(['c0000000-0000-4000-8000-000000000097', 'a0000000-0000-4000-8000-000000000001'])
  })

  it('non désigné : `null` et AUCUNE requête — jamais un autre contact du compte', async () => {
    const { service, queries } = makeService({ clientManagerId: null })
    const panel = await service.readContacts(USER, MISSION)
    expect(panel.clientManager).toBeNull()
    expect(panel.clientManagerContactId).toBeNull()
    expect(queries.some(q => q.sql.includes('WHERE account_id = $2 AND id = $1'))).toBe(false)
  })

  it('ÉCRIT le manager client quand le contact appartient au compte de la mission', async () => {
    const { service, missions } = makeService({ craContactValid: [{ id: 'contact-1' }] })
    await service.setClientManager(USER, MISSION, 'contact-1')
    expect(missions.update).toHaveBeenCalledWith(
      { id: MISSION, workspace_id: WORKSPACE },
      { client_manager_contact_id: 'contact-1' },
    )
  })

  it('REFUSE un contact d’un AUTRE compte, sans rien écrire', async () => {
    const { service, missions } = makeService({ craContactValid: [] })
    await expect(service.setClientManager(USER, MISSION, 'contact-1')).rejects.toBeInstanceOf(BadRequestException)
    expect(missions.update).not.toHaveBeenCalled()
  })

  it('RETIRE le manager client avec `null`', async () => {
    const { service, missions } = makeService()
    await service.setClientManager(USER, MISSION, null)
    expect(missions.update).toHaveBeenCalledWith(
      { id: MISSION, workspace_id: WORKSPACE },
      { client_manager_contact_id: null },
    )
  })

  it('refuse une mission d’un autre espace', async () => {
    const { service, missions } = makeService({ missionMissing: true })
    await expect(service.setClientManager(USER, MISSION, 'contact-1')).rejects.toBeInstanceOf(NotFoundException)
    expect(missions.update).not.toHaveBeenCalled()
  })
})

/*  ────────────────────────────────────────────────────────────────────────  */
/*  #2420 — LE MOTEUR DE MARGE (LAU-FINAL-134)                                */
/*  ────────────────────────────────────────────────────────────────────────  */

describe('StaffingService.readTerms — le moteur de marge (#2420)', () => {
  it('rend le calcul complet, dont la marge commerciale est EXACTEMENT le noyau', async () => {
    const { service } = makeService({ terms: { ...STORED_TERMS, channel: 'direct' } })
    const result = await service.readTerms(USER, MISSION, true)
    expect(result.marginEngine).not.toBeNull()
    expect(result.marginEngine?.commercial).toEqual(result.margin)
    expect(result.marginEngine?.formulaVersion).toMatch(/^mission-margin-/)
    expect(result.marginEngine?.period?.month).toMatch(/^\d{4}-\d{2}$/)
    expect(result.marginEngine?.exclusions).toContain('payment_delays')
  })

  it('sans `finance:read`, le calcul entier est vidé — il porte les coûts un à un', async () => {
    const { service } = makeService({ terms: STORED_TERMS })
    expect((await service.readTerms(USER, MISSION, false)).marginEngine).toBeNull()
  })

  it('les jours VALIDÉS du mois font la marge de la période ; les autres sont nommés', async () => {
    const { service, queries } = makeService({
      terms: { ...STORED_TERMS, channel: 'direct' },
      monthDaysRows: [{ validated_days: '18', unvalidated_days: '2', rows: '3' }],
    })
    const { marginEngine } = await service.readTerms(USER, MISSION, true)
    // 650 € − 455 € = 195 € par jour, sur 18 jours validés.
    expect(marginEngine?.period?.commercialAmountCents).toBe(19_500 * 18)
    expect(marginEngine?.alerts.map(alert => alert.kind)).toContain('unvalidated_days')
    const monthQuery = queries.find(entry => entry.sql.includes('AS validated_days'))
    expect(monthQuery?.params[1]).toMatch(/^\d{4}-\d{2}-01$/)
  })

  it('aucun relevé ce mois-ci : la période vaut « non mesuré », jamais zéro jour', async () => {
    const { service } = makeService({ terms: { ...STORED_TERMS, channel: 'direct' } })
    const { marginEngine } = await service.readTerms(USER, MISSION, true)
    expect(marginEngine?.period?.validatedDays).toBeNull()
    expect(marginEngine?.period?.commercialAmountCents).toBeNull()
  })

  it('lit la source, la devise, la décomposition, le seuil et le TJM de saisie du coût', async () => {
    const { service } = makeService({
      terms: {
        ...STORED_TERMS,
        channel: 'direct',
        cost_source: 'freelance',
        currency: 'EUR',
        cost_currency: null,
        cost_breakdown: { supplierDailyRateCents: 50_000, supplierCommissionDailyCents: 0 },
        cost_recorded_rate_cents: '60000',
      },
      thresholdRows: [{ margin_alert_threshold_percent: '25' }],
    })
    const { marginEngine, terms } = await service.readTerms(USER, MISSION, true)
    expect(terms?.costSource).toBe('freelance')
    expect(terms?.costRecordedRateCents).toBe(60_000)
    expect(marginEngine?.source.costSource).toBe('freelance')
    // 650 € − 500 € = 150 € → 23,1 %, sous le seuil de 25 %.
    expect(marginEngine?.commercial).toEqual({ amountCents: 15_000, percent: 23.1 })
    expect(marginEngine?.alerts.map(alert => alert.kind)).toEqual(['below_threshold', 'rate_changed'])
    expect(marginEngine?.diagnostic?.automaticAction).toBe('none')
  })

  it('une décomposition illisible en base ne casse pas la fiche : elle vaut « rien de déclaré »', async () => {
    const { service } = makeService({
      terms: { ...STORED_TERMS, channel: 'direct', cost_source: 'freelance', cost_breakdown: { salaryCents: 1 } },
    })
    const { marginEngine } = await service.readTerms(USER, MISSION, true)
    const direct = marginEngine?.costsUsed.filter(cost => cost.level === 'commercial').map(cost => cost.key)
    expect(direct).toEqual(['loaded_daily_cost'])
  })
})

describe('StaffingService.upsertTerms — le moteur de marge (#2420)', () => {
  it('ÉCRIT la source, les devises et la décomposition, chacune avec son drapeau de présence', async () => {
    const { service, queries } = makeService({ terms: STORED_TERMS })
    await service.upsertTerms(USER, MISSION, {
      loadedDailyCostCents: 45_500,
      channel: 'partner',
      poNumber: null,
      billingCadence: null,
      noticeDays: null,
      notes: null,
      costSource: 'partner',
      currency: 'CHF',
      costCurrency: null,
      costBreakdown: { partnerPurchaseDailyCents: 45_500, partnerSplitPercent: 10 },
    })
    const query = upsertQuery(queries)
    expect(insertedValue(query, 'cost_source')).toBe('partner')
    expect(insertedValue(query, 'currency')).toBe('CHF')
    expect(insertedValue(query, 'cost_currency')).toBeNull()
    expect(JSON.parse(insertedValue(query, 'cost_breakdown') as string)).toEqual({
      partnerPurchaseDailyCents: 45_500,
      partnerSplitPercent: 10,
    })
    for (const column of ['cost_source', 'currency', 'cost_currency', 'cost_breakdown']) {
      expect(presenceFlag(query, column)).toBe(true)
    }
  })

  it('un PUT d’avant le moteur ne touche à rien de ce qu’il ne connaît pas', async () => {
    const { service, queries } = makeService({ terms: STORED_TERMS })
    await service.upsertTerms(USER, MISSION, {
      loadedDailyCostCents: 45_500,
      channel: 'partner',
      poNumber: null,
      billingCadence: null,
      noticeDays: null,
      notes: null,
    })
    const query = upsertQuery(queries)
    for (const column of ['cost_source', 'currency', 'cost_currency', 'cost_breakdown']) {
      expect(presenceFlag(query, column)).toBe(false)
    }
  })

  it('pose le TJM en vigueur, en centimes, à côté du coût saisi — c’est lui qui dira « tarif changé »', async () => {
    const { service, queries } = makeService({ terms: STORED_TERMS, dailyRate: 650 })
    await service.upsertTerms(USER, MISSION, {
      loadedDailyCostCents: 45_500,
      channel: 'partner',
      poNumber: null,
      billingCadence: null,
      noticeDays: null,
      notes: null,
    })
    expect(insertedValue(upsertQuery(queries), 'cost_recorded_rate_cents')).toBe(65_000)
  })
})

describe('StaffingService.simulateMargin (#2420.14)', () => {
  it('part de la MÊME entrée que la fiche : le scénario « tarif actuel » redonne sa marge', async () => {
    const { service } = makeService({ terms: { ...STORED_TERMS, channel: 'direct' } })
    const { marginEngine } = await service.readTerms(USER, MISSION, true)
    const result = await service.simulateMargin(USER, MISSION, { kind: 'current_rate', days: 10 })
    expect(result.computation.commercial).toEqual(marginEngine?.commercial)
    expect(result.commercialTotalCents).toBe(19_500 * 10)
  })

  it('un tarif renouvelé change la marge simulée, et rien n’est écrit', async () => {
    const { service, queries } = makeService({ terms: { ...STORED_TERMS, channel: 'direct' } })
    const result = await service.simulateMargin(USER, MISSION, { kind: 'renewed_rate', rateCents: 70_000, days: 20 })
    expect(result.computation.commercial?.amountCents).toBe(24_500)
    expect(result.computation.assumptions).toContain('scenario_simulation')
    expect(queries.some(query => /INSERT|UPDATE|DELETE/.test(query.sql))).toBe(false)
  })
})
