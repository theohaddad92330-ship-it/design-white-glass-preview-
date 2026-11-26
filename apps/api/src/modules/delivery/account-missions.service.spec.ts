import { accountMissionsSchema } from '@bellum/contracts'
import { AccountMissionsService } from './account-missions.service'

const WORKSPACE = 'w0000000-0000-4000-8000-000000000001'
const ACCOUNT = 'a0000000-0000-4000-8000-000000000001'
const OTHER_ACCOUNT = 'a0000000-0000-4000-8000-000000000002'
const MISSION_A = 'd0000000-0000-4000-8000-00000000000a'
const MISSION_B = 'd0000000-0000-4000-8000-00000000000b'
const MISSION_C = 'd0000000-0000-4000-8000-00000000000c'
const CONSULTANT = 'c0000000-0000-4000-8000-000000000020'

/** Un « aujourd'hui » figé : une fenêtre de renouvellement calculée sur l'heure
 *  réelle rendrait ce fichier rouge un matin de décembre. */
const TODAY = new Date('2026-08-28T09:00:00.000Z')

type MissionRow = {
  id: string
  account_id: string
  label: string
  status: string
  started_on: string | null
  ends_on: string | null
  daily_rate: number | null
  role_title: string | null
  owner_id: string | null
  client_manager_contact_id: string | null
}

const mission = (over: Partial<MissionRow> & { id: string }): MissionRow => ({
  account_id: ACCOUNT,
  label: 'Mission',
  status: 'active',
  started_on: '2026-01-05',
  ends_on: '2026-12-31',
  daily_rate: 600,
  role_title: 'Data engineer',
  owner_id: null,
  client_manager_contact_id: null,
  ...over,
})

type Fixture = {
  missions?: MissionRow[]
  assignments?: unknown[]
  endReasons?: unknown[]
  rex?: unknown[]
  terms?: { mission_id: string; loaded_daily_cost_cents: string | null }[]
  /** Ce que `PropagationService.digest` rend — le tarif vendu moyen n'est PAS
   *  recalculé ici, il vient de là (PDF 2 §4.3). */
  propagationAccounts?: unknown[]
  /** Le compte existe-t-il dans cet espace ? `false` = 404 attendu. */
  accountFound?: boolean
  /** #2124.19 — les profils lus pour le chargé d'affaires (`profiles`). */
  businessManagers?: { user_id: string; first_name: string | null; last_name: string | null }[]
  /** #2836 — les contacts lus pour le manager client (`contacts`). */
  clientManagers?: { id: string; full_name: string | null }[]
  /** #2124.26 — les factures lues pour le comportement de paiement ET le
   *  revenu historique (`invoice_readiness`, MÊME requête, une seule lecture). */
  invoiceRows?: {
    invoiced_at: string | null
    due_on: string | null
    paid_at: string | null
    paid_amount_cents: string | number | null
    invoiced_amount_cents: string | number | null
    disputed_at: string | null
  }[]
}

function makeService(fixture: Fixture = {}) {
  const queries: { sql: string; params: unknown[] }[] = []
  const manager = {
    query: jest.fn(async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params })
      if (sql.includes('mission_assignments')) return fixture.assignments ?? []
      if (sql.includes('record_field_audit')) return fixture.endReasons ?? []
      if (sql.includes('rex_entries')) return fixture.rex ?? []
      if (sql.includes('invoice_readiness')) return fixture.invoiceRows ?? []
      if (sql.includes('profiles')) return fixture.businessManagers ?? []
      if (sql.includes('FROM contacts')) return fixture.clientManagers ?? []
      return []
    }),
  }
  const missions = {
    manager,
    find: jest.fn(async () => fixture.missions ?? []),
  }
  const accounts = {
    findOne: jest.fn(async () => (fixture.accountFound === false ? null : { id: ACCOUNT })),
  }
  const terms = { find: jest.fn(async () => fixture.terms ?? []) }
  const propagation = {
    digest: jest.fn(async () => ({
      accounts: fixture.propagationAccounts ?? [],
      contacts: [],
      consultants: [],
    })),
  }
  const service = new AccountMissionsService(missions as never, terms as never, accounts as never, propagation as never)
  return { service, queries, manager, missions, terms, propagation, accounts }
}

const read = (service: AccountMissionsService, canReadFinance = true) =>
  service.ofAccount(WORKSPACE, ACCOUNT, { canReadFinance, now: TODAY })

/* ══════════════════════════════════════════════════════════════════════════ */
/*  La forme du fil — un seul schéma, importé des deux côtés                   */
/* ══════════════════════════════════════════════════════════════════════════ */

describe('la réponse respecte le contrat partagé', () => {
  it('parse contre `accountMissionsSchema`, source et verrou compris', async () => {
    const { service } = makeService({
      missions: [mission({ id: MISSION_A })],
      propagationAccounts: [
        {
          accountId: ACCOUNT,
          missions: 1,
          averageSoldDailyRateCents: 60000,
          missionsWithoutRate: 0,
          source: { kind: 'missions', href: `/missions?accountId=${ACCOUNT}`, label: 'Les missions de ce compte' },
          editable: false,
        },
      ],
    })
    const parsed = accountMissionsSchema.safeParse(await read(service))
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    // §4.4 : le bloc porte un lien vers l'écran où il se CALCULE, et le verrou
    // est un type — pas une convention.
    expect(parsed.data.editable).toBe(false)
    expect(parsed.data.source.href).toContain(ACCOUNT)
    expect(parsed.data.source.label.length).toBeGreaterThan(10)
  })

  it('ne lit QUE les missions du compte demandé, dans SON espace', async () => {
    const { service, missions } = makeService({ missions: [mission({ id: MISSION_A })] })
    await read(service)
    expect(missions.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { workspace_id: WORKSPACE, account_id: ACCOUNT } }),
    )
  })

  it('refuse un compte qui n’est pas dans cet espace', async () => {
    const { service, missions } = makeService({ accountFound: false })
    await expect(read(service)).rejects.toThrow()
    // Et la lecture des missions ne part même pas : on ne fouille pas la table
    // avant de savoir que le compte est lisible.
    expect(missions.find).not.toHaveBeenCalled()
  })
})

/* ══════════════════════════════════════════════════════════════════════════ */
/*  Le compte SANS mission — la question « 0 est-il VRAI ? »                   */
/* ══════════════════════════════════════════════════════════════════════════ */

describe('un compte sans mission n’a pas « rapporté 0 € »', () => {
  it('rend des listes vides et AUCUN profil d’achat', async () => {
    const { service } = makeService({ missions: [] })
    const result = await read(service)
    expect(result.active).toEqual([])
    expect(result.past).toEqual([])
    expect(result.placedConsultants).toEqual([])
    expect(result.notRenewed).toEqual([])
    // `null`, pas un objet rempli de zéros : « ce client achète à 0 € » se lirait
    // comme une mesure alors que c'est l'absence de mesure.
    expect(result.buying).toBeNull()
  })

  it('n’interroge ni les affectations ni le journal quand il n’y a rien à décorer', async () => {
    const { service, queries } = makeService({ missions: [] })
    await read(service)
    // Cinq requêtes sur un compte vide seraient cinq allers-retours pour rien.
    expect(queries).toEqual([])
  })
})

/* ══════════════════════════════════════════════════════════════════════════ */
/*  Le compte SANS historique                                                  */
/* ══════════════════════════════════════════════════════════════════════════ */

describe('un compte sans historique le dit, il ne l’invente pas', () => {
  it('rend `past` et `notRenewed` vides, et le profil d’achat quand même', async () => {
    const { service } = makeService({
      missions: [mission({ id: MISSION_A, status: 'active' })],
      propagationAccounts: [
        {
          accountId: ACCOUNT,
          missions: 1,
          averageSoldDailyRateCents: 60000,
          missionsWithoutRate: 0,
          source: { kind: 'missions', href: `/missions?accountId=${ACCOUNT}`, label: 'Les missions de ce compte' },
          editable: false,
        },
      ],
    })
    const result = await read(service)
    expect(result.past).toEqual([])
    expect(result.notRenewed).toEqual([])
    expect(result.active).toHaveLength(1)
    expect(result.buying?.averageSoldDailyRateCents).toBe(60000)
  })
})

/* ══════════════════════════════════════════════════════════════════════════ */
/*  Bloc 1 — les missions actives                                              */
/* ══════════════════════════════════════════════════════════════════════════ */

describe('bloc 1 — intitulé, consultant, période, jours restants, prochaine action', () => {
  // #R37 (Servier) — début au 30/12/2026, nous sommes le 28/08/2026 : « à venir », jamais « en cours ».
  it('une mission dont le début est futur est upcoming, pas running', async () => {
    const { service } = makeService({
      missions: [
        mission({ id: MISSION_A, status: 'active', started_on: '2026-12-30', ends_on: '2027-06-30' }),
        mission({ id: MISSION_B, status: 'active', started_on: '2026-01-05', ends_on: '2026-12-31' }),
      ],
    })
    const result = await read(service)
    expect(result.active.find(row => row.missionId === MISSION_A)?.phase).toBe('upcoming')
    expect(result.active.find(row => row.missionId === MISSION_B)?.phase).toBe('running')
  })

  it('rend les jours restants et la prochaine action depuis la fenêtre', async () => {
    const { service } = makeService({
      missions: [
        // Fin dans 20 jours → J-30 → il faut relancer maintenant.
        mission({ id: MISSION_A, ends_on: '2026-09-17' }),
        // Sans date de fin → aucune fenêtre ne s'y déclenche.
        mission({ id: MISSION_B, ends_on: null }),
      ],
      assignments: [
        {
          mission_id: MISSION_A,
          consultant_id: CONSULTANT,
          full_name: 'Marc Lefèvre',
          starts_on: '2026-01-05',
          ends_on: null,
        },
      ],
    })
    const result = await read(service)
    const [a, b] = result.active
    expect(a?.daysRemaining).toBe(20)
    expect(a?.renewal).toBe('j30')
    expect(a?.nextAction).toBe('renew_now')
    expect(a?.consultants).toEqual([{ consultantId: CONSULTANT, fullName: 'Marc Lefèvre' }])
    // ⚠️ `null` et non un grand nombre : « sans date de fin » n'est pas « très
    // loin », c'est la mission qu'on ne relance jamais à temps.
    expect(b?.daysRemaining).toBeNull()
    expect(b?.renewal).toBe('unknown')
    expect(b?.nextAction).toBe('set_end_date')
  })

  it('range `paused` du côté actif et `renewed` du côté passé', async () => {
    const { service } = makeService({
      missions: [mission({ id: MISSION_A, status: 'paused' }), mission({ id: MISSION_B, status: 'renewed' })],
    })
    const result = await read(service)
    expect(result.active.map(row => row.missionId)).toEqual([MISSION_A])
    expect(result.past.map(row => row.missionId)).toEqual([MISSION_B])
  })

  /* ── #2124.19 — le chargé d'affaires, par mission ─────────────────────────── */

  describe('#2836 — le manager client (client_manager_contact_id), par mission', () => {
    const CONTACT = 'c0000000-0000-4000-8000-000000000077'

    it('joint `contacts` SCOPÉ au compte et rend le nom, sur une ligne active comme passée', async () => {
      const { service, queries } = makeService({
        missions: [
          mission({ id: MISSION_A, client_manager_contact_id: CONTACT }),
          mission({ id: MISSION_B, status: 'completed', client_manager_contact_id: CONTACT }),
        ],
        clientManagers: [{ id: CONTACT, full_name: 'Hélène Marchal' }],
      })
      const result = await read(service)
      expect(result.active[0]?.clientManagerName).toBe('Hélène Marchal')
      expect(result.past[0]?.clientManagerName).toBe('Hélène Marchal')
      const reads = queries.filter(q => q.sql.includes('FROM contacts'))
      expect(reads).toHaveLength(1)
      expect(reads[0]?.params).toEqual([[CONTACT], ACCOUNT])
    })

    it('non désigné : `null` et AUCUNE requête — jamais un autre contact du compte', async () => {
      const { service, queries } = makeService({
        missions: [mission({ id: MISSION_A })],
        clientManagers: [{ id: CONTACT, full_name: 'Hélène Marchal' }],
      })
      const result = await read(service)
      expect(result.active[0]?.clientManagerName).toBeNull()
      expect(queries.some(q => q.sql.includes('FROM contacts'))).toBe(false)
    })

    it('`null` quand le contact a disparu ou n’a pas de nom — jamais une chaîne vide', async () => {
      const { service } = makeService({
        missions: [
          mission({ id: MISSION_A, client_manager_contact_id: CONTACT }),
          mission({ id: MISSION_B, client_manager_contact_id: 'c0000000-0000-4000-8000-000000000078' }),
        ],
        clientManagers: [{ id: CONTACT, full_name: '  ' }],
      })
      const result = await read(service)
      expect(result.active.map(row => row.clientManagerName)).toEqual([null, null])
    })
  })

  describe('#2124.19 — le chargé d’affaires (owner_id), par mission', () => {
    const OWNER = 'e0000000-0000-4000-8000-000000000099'

    it('joint `profiles` sur `owner_id` et rend un nom composé', async () => {
      const { service } = makeService({
        missions: [mission({ id: MISSION_A, owner_id: OWNER })],
        businessManagers: [{ user_id: OWNER, first_name: 'Sophie', last_name: 'Martin' }],
      })
      const result = await read(service)
      expect(result.active[0]?.businessManagerName).toBe('Sophie Martin')
    })

    it('`null` quand la mission n’a pas de porteur — jamais un nom inventé', async () => {
      const { service } = makeService({ missions: [mission({ id: MISSION_A, owner_id: null })] })
      const result = await read(service)
      expect(result.active[0]?.businessManagerName).toBeNull()
    })

    it('`null` quand `owner_id` est posé mais que le profil a disparu', async () => {
      const { service } = makeService({
        missions: [mission({ id: MISSION_A, owner_id: OWNER })],
        businessManagers: [],
      })
      const result = await read(service)
      expect(result.active[0]?.businessManagerName).toBeNull()
    })

    it('une seule requête groupée, même avec plusieurs missions du même porteur', async () => {
      const { service, queries } = makeService({
        missions: [mission({ id: MISSION_A, owner_id: OWNER }), mission({ id: MISSION_B, owner_id: OWNER })],
        businessManagers: [{ user_id: OWNER, first_name: 'Sophie', last_name: 'Martin' }],
      })
      await read(service)
      expect(queries.filter(q => q.sql.includes('profiles'))).toHaveLength(1)
    })
  })
})

/* ══════════════════════════════════════════════════════════════════════════ */
/*  Le droit financier — « pas ton périmètre » ≠ « pas mesuré »                */
/* ══════════════════════════════════════════════════════════════════════════ */

describe('la marge se garde, le prix de VENTE ne se garde pas', () => {
  it('sans le droit : marge `null`, TJM toujours servi, et le drapeau le dit', async () => {
    const { service, terms } = makeService({
      missions: [mission({ id: MISSION_A, daily_rate: 600 })],
      terms: [{ mission_id: MISSION_A, loaded_daily_cost_cents: '40000' }],
    })
    const result = await service.ofAccount(WORKSPACE, ACCOUNT, { canReadFinance: false, now: TODAY })
    expect(result.canReadFinance).toBe(false)
    // PRÉSENTE et vide (D45) — jamais retirée, jamais zéro.
    expect(result.active[0]).toHaveProperty('marginPercent', null)
    // Le prix de VENTE sort quand même : deux fausses alertes ont déjà été
    // levées là-dessus (doctrine de `mission.ts`, 28/08/2026).
    expect(result.active[0]?.soldDailyRateCents).toBe(60000)
    // Et le coût chargé n'est même pas LU : la requête ne part pas.
    expect(terms.find).not.toHaveBeenCalled()
  })

  it('avec le droit : la marge est calculée sur les conditions commerciales (D43)', async () => {
    const { service } = makeService({
      missions: [mission({ id: MISSION_A, daily_rate: 600 })],
      terms: [{ mission_id: MISSION_A, loaded_daily_cost_cents: '40000' }],
    })
    const result = await read(service)
    // (60000 − 40000) / 60000 = 33,3 % — le NOYAU `missionMargin`, pas une
    // seconde formule : deux écrans ne rendent pas deux marges pour la même
    // mission.
    expect(result.active[0]?.marginPercent).toBe(33.3)
  })

  it('avec le droit mais SANS coût chargé : `null`, jamais 0 %', async () => {
    const { service } = makeService({
      missions: [mission({ id: MISSION_A, daily_rate: 600 })],
      terms: [],
    })
    const result = await read(service)
    expect(result.canReadFinance).toBe(true)
    expect(result.active[0]?.marginPercent).toBeNull()
  })
})

/* ══════════════════════════════════════════════════════════════════════════ */
/*  #2124.26 — le revenu historique, réservé à un rôle autorisé                */
/* ══════════════════════════════════════════════════════════════════════════ */

describe('#2124.26 — le revenu historique (somme facturée, jamais le tarif moyen)', () => {
  it('somme `invoiced_amount_cents` sur toutes les factures du compte', async () => {
    const { service } = makeService({
      missions: [mission({ id: MISSION_A })],
      invoiceRows: [
        {
          invoiced_at: '2026-01-15',
          due_on: '2026-02-15',
          paid_at: '2026-02-10',
          paid_amount_cents: '600000',
          invoiced_amount_cents: '600000',
          disputed_at: null,
        },
        {
          invoiced_at: '2026-02-15',
          due_on: '2026-03-15',
          paid_at: null,
          paid_amount_cents: null,
          invoiced_amount_cents: '450000',
          disputed_at: null,
        },
      ],
    })
    const result = await read(service)
    expect(result.historicalInvoicedRevenueCents).toBe(1050000)
  })

  it('`null` — jamais 0 — quand ce compte n’a AUCUNE facture', async () => {
    const { service } = makeService({ missions: [mission({ id: MISSION_A })], invoiceRows: [] })
    const result = await read(service)
    expect(result.historicalInvoicedRevenueCents).toBeNull()
  })

  it('sans `finance:read` : `null`, et la requête ne PART même pas', async () => {
    const { service, queries } = makeService({
      missions: [mission({ id: MISSION_A })],
      invoiceRows: [
        {
          invoiced_at: '2026-01-15',
          due_on: '2026-02-15',
          paid_at: '2026-02-10',
          paid_amount_cents: '600000',
          invoiced_amount_cents: '600000',
          disputed_at: null,
        },
      ],
    })
    const result = await service.ofAccount(WORKSPACE, ACCOUNT, { canReadFinance: false, now: TODAY })
    expect(result.historicalInvoicedRevenueCents).toBeNull()
    expect(queries.some(q => q.sql.includes('invoice_readiness'))).toBe(false)
  })

  it('une facture SANS montant ne compte pas comme un zéro — elle sort du total', async () => {
    const { service } = makeService({
      missions: [mission({ id: MISSION_A })],
      invoiceRows: [
        {
          invoiced_at: '2026-01-15',
          due_on: '2026-02-15',
          paid_at: null,
          paid_amount_cents: null,
          invoiced_amount_cents: null,
          disputed_at: null,
        },
        {
          invoiced_at: '2026-02-15',
          due_on: '2026-03-15',
          paid_at: null,
          paid_amount_cents: null,
          invoiced_amount_cents: '200000',
          disputed_at: null,
        },
      ],
    })
    const result = await read(service)
    expect(result.historicalInvoicedRevenueCents).toBe(200000)
  })
})

/* ══════════════════════════════════════════════════════════════════════════ */
/*  Bloc 2 — les missions passées                                              */
/* ══════════════════════════════════════════════════════════════════════════ */

describe('bloc 2 — motif de fin et retour collecté ou non', () => {
  it('lit le motif dans le journal et le REX dans sa table', async () => {
    const { service } = makeService({
      missions: [
        mission({ id: MISSION_A, status: 'ended', ends_on: '2026-06-30' }),
        mission({ id: MISSION_B, status: 'terminated', ends_on: '2026-05-31' }),
      ],
      endReasons: [{ entity_id: MISSION_A, new_value: 'Budget gelé côté client' }],
      rex: [{ mission_id: MISSION_B }],
    })
    const result = await read(service)
    const byId = new Map(result.past.map(row => [row.missionId, row]))
    expect(byId.get(MISSION_A)?.endReason).toBe('Budget gelé côté client')
    expect(byId.get(MISSION_A)?.feedbackCollected).toBe(false)
    // `null` = personne ne l'a écrit. Jamais une phrase inventée.
    expect(byId.get(MISSION_B)?.endReason).toBeNull()
    expect(byId.get(MISSION_B)?.feedbackCollected).toBe(true)
  })
})

/* ══════════════════════════════════════════════════════════════════════════ */
/*  Bloc 3 — les consultants placés                                            */
/* ══════════════════════════════════════════════════════════════════════════ */

describe('bloc 3 — qui, quand, combien de fois', () => {
  it('agrège par personne, avec la première et la dernière date', async () => {
    const { service } = makeService({
      missions: [
        mission({ id: MISSION_A, status: 'ended', started_on: '2024-01-08', ends_on: '2024-12-20' }),
        mission({ id: MISSION_B, status: 'active', started_on: '2026-02-02', ends_on: '2026-12-31' }),
      ],
      assignments: [
        {
          mission_id: MISSION_A,
          consultant_id: CONSULTANT,
          full_name: 'Marc Lefèvre',
          starts_on: '2024-01-08',
          ends_on: '2024-12-20',
        },
        {
          mission_id: MISSION_B,
          consultant_id: CONSULTANT,
          full_name: 'Marc Lefèvre',
          starts_on: '2026-02-02',
          ends_on: null,
        },
      ],
    })
    const [placed] = (await read(service)).placedConsultants
    expect(placed?.fullName).toBe('Marc Lefèvre')
    expect(placed?.missions).toBe(2)
    expect(placed?.firstStartedOn).toBe('2024-01-08')
    // Une affectation sans fin connue est EN COURS : un expert sur place.
    expect(placed?.stillOnSite).toBe(true)
    expect(placed?.lastEndedOn).toBeNull()
  })

  it('ne compte personne quand aucune affectation n’est lisible', async () => {
    const { service } = makeService({ missions: [mission({ id: MISSION_A })], assignments: [] })
    // `[]`, pas une ligne à zéro : quelqu'un qui n'a jamais été placé n'apparaît
    // pas — « placé 0 fois » se lirait comme une mesure.
    expect((await read(service)).placedConsultants).toEqual([])
  })
})

/* ══════════════════════════════════════════════════════════════════════════ */
/*  Bloc 4 — ce que ce client achète                                           */
/* ══════════════════════════════════════════════════════════════════════════ */

describe('bloc 4 — tarif vendu moyen, durée moyenne, types de profil', () => {
  it('reprend le tarif moyen de la propagation SANS le recalculer', async () => {
    const { service, propagation } = makeService({
      missions: [mission({ id: MISSION_A, daily_rate: 900 })],
      propagationAccounts: [
        {
          accountId: ACCOUNT,
          missions: 4,
          averageSoldDailyRateCents: 64000,
          missionsWithoutRate: 1,
          source: { kind: 'missions', href: `/missions?accountId=${ACCOUNT}`, label: 'Les missions de ce compte' },
          editable: false,
        },
        {
          accountId: OTHER_ACCOUNT,
          missions: 9,
          averageSoldDailyRateCents: 99900,
          missionsWithoutRate: 0,
          source: { kind: 'missions', href: '/missions', label: 'Les missions de ce compte' },
          editable: false,
        },
      ],
    })
    const result = await read(service)
    expect(propagation.digest).toHaveBeenCalledWith(WORKSPACE)
    // 640 €, pas 900 € : la moyenne vit dans la propagation, et un second calcul
    // ici divergerait le jour où l'un des deux change.
    expect(result.buying?.averageSoldDailyRateCents).toBe(64000)
    expect(result.buying?.missions).toBe(4)
    expect(result.buying?.missionsWithoutRate).toBe(1)
  })

  it('calcule la durée moyenne sur les missions qui ont leurs DEUX dates, et compte les autres', async () => {
    const { service } = makeService({
      missions: [
        // 100 jours.
        mission({ id: MISSION_A, started_on: '2026-01-01', ends_on: '2026-04-11' }),
        // 200 jours.
        mission({ id: MISSION_B, started_on: '2026-01-01', ends_on: '2026-07-20' }),
        // Sans fin : hors du calcul, mais COMPTÉE.
        mission({ id: MISSION_C, started_on: '2026-01-01', ends_on: null }),
      ],
      propagationAccounts: [
        {
          accountId: ACCOUNT,
          missions: 3,
          averageSoldDailyRateCents: 60000,
          missionsWithoutRate: 0,
          source: { kind: 'missions', href: `/missions?accountId=${ACCOUNT}`, label: 'Les missions de ce compte' },
          editable: false,
        },
      ],
    })
    const result = await read(service)
    expect(result.buying?.averageDurationDays).toBe(150)
    expect(result.buying?.missionsWithoutDuration).toBe(1)
  })

  it('rend `null` — jamais 0 — quand aucune mission n’a ses deux dates', async () => {
    const { service } = makeService({
      missions: [mission({ id: MISSION_A, started_on: null, ends_on: null })],
      propagationAccounts: [
        {
          accountId: ACCOUNT,
          missions: 1,
          averageSoldDailyRateCents: null,
          missionsWithoutRate: 1,
          source: { kind: 'missions', href: `/missions?accountId=${ACCOUNT}`, label: 'Les missions de ce compte' },
          editable: false,
        },
      ],
    })
    const result = await read(service)
    // « Ce client achète des missions de 0 jour » n'est pas une mesure.
    expect(result.buying?.averageDurationDays).toBeNull()
    expect(result.buying?.averageSoldDailyRateCents).toBeNull()
  })

  it('groupe les rôles achetés et sort les missions sans rôle du décompte', async () => {
    const { service } = makeService({
      missions: [
        mission({ id: MISSION_A, role_title: 'Data engineer' }),
        mission({ id: MISSION_B, role_title: 'Data engineer' }),
        mission({ id: MISSION_C, role_title: null }),
      ],
      propagationAccounts: [
        {
          accountId: ACCOUNT,
          missions: 3,
          averageSoldDailyRateCents: 60000,
          missionsWithoutRate: 0,
          source: { kind: 'missions', href: `/missions?accountId=${ACCOUNT}`, label: 'Les missions de ce compte' },
          editable: false,
        },
      ],
    })
    const result = await read(service)
    expect(result.buying?.roleTitles).toEqual([{ roleTitle: 'Data engineer', missions: 2 }])
    // Une mission sans rôle n'est PAS un rôle « Non renseigné » : elle est hors
    // du décompte, et le nombre le dit.
    expect(result.buying?.missionsWithoutRoleTitle).toBe(1)
  })

  it('rend un profil d’achat même si la propagation n’a pas de ligne pour ce compte', async () => {
    const { service } = makeService({
      missions: [mission({ id: MISSION_A, daily_rate: null })],
      propagationAccounts: [],
    })
    const result = await read(service)
    // Le compte a une mission : le bloc existe, et le tarif est simplement
    // inconnu. Le mettre à `null` en entier ferait disparaître la durée et les
    // rôles, qui eux sont mesurés.
    expect(result.buying).not.toBeNull()
    expect(result.buying?.averageSoldDailyRateCents).toBeNull()
    expect(result.buying?.missions).toBe(1)
  })
})

/* ══════════════════════════════════════════════════════════════════════════ */
/*  Bloc 5 — ce qu'il ne renouvelle pas                                        */
/* ══════════════════════════════════════════════════════════════════════════ */

describe('bloc 5 — les missions terminées sans suite, avec leur motif', () => {
  it('retient une mission finie dont le rôle n’a pas repris', async () => {
    const { service } = makeService({
      missions: [
        mission({ id: MISSION_A, status: 'ended', role_title: 'Architecte de plateforme', ends_on: '2026-06-30' }),
        mission({ id: MISSION_B, status: 'active', role_title: 'Data engineer', started_on: '2026-07-01' }),
      ],
      endReasons: [{ entity_id: MISSION_A, new_value: 'Internalisation de l’équipe' }],
    })
    const result = await read(service)
    expect(result.notRenewed).toHaveLength(1)
    expect(result.notRenewed[0]?.missionId).toBe(MISSION_A)
    expect(result.notRenewed[0]?.endReason).toBe('Internalisation de l’équipe')
    expect(result.notRenewed[0]?.sameRoleResumed).toBe(false)
  })

  it('écarte une mission dont le MÊME rôle a redémarré depuis', async () => {
    const { service } = makeService({
      missions: [
        mission({ id: MISSION_A, status: 'ended', role_title: 'Data engineer', ends_on: '2026-06-30' }),
        mission({ id: MISSION_B, status: 'active', role_title: 'Data engineer', started_on: '2026-07-01' }),
      ],
    })
    expect((await read(service)).notRenewed).toEqual([])
  })

  it('ne lit PAS « sans suite » sur le compte : une autre mission ne renouvelle pas ce profil', async () => {
    const { service } = makeService({
      missions: [
        mission({ id: MISSION_A, status: 'ended', role_title: 'Architecte de plateforme', ends_on: '2026-06-30' }),
        mission({ id: MISSION_B, status: 'active', role_title: 'Ingénieur d’exploitation', started_on: '2026-07-01' }),
      ],
    })
    // Compter au niveau du COMPTE viderait ce bloc chez tous les gros clients —
    // c'est-à-dire chez ceux pour qui la question se pose.
    expect((await read(service)).notRenewed.map(row => row.missionId)).toEqual([MISSION_A])
  })

  it('dit « on ne sait pas » quand le rôle ou la date manque', async () => {
    const { service } = makeService({
      missions: [
        mission({ id: MISSION_A, status: 'ended', role_title: null, ends_on: '2026-06-30' }),
        mission({ id: MISSION_B, status: 'terminated', role_title: 'Data engineer', ends_on: null }),
      ],
    })
    const result = await read(service)
    // `null` n'est pas `false` : indécidable ne veut pas dire « pas repris ».
    expect(result.notRenewed.map(row => row.sameRoleResumed)).toEqual([null, null])
  })

  it('exclut `renewed` — c’est le statut qui DIT qu’il y a eu une suite', async () => {
    const { service } = makeService({
      missions: [mission({ id: MISSION_A, status: 'renewed', ends_on: '2026-06-30' })],
    })
    const result = await read(service)
    expect(result.past.map(row => row.missionId)).toEqual([MISSION_A])
    expect(result.notRenewed).toEqual([])
  })
})

/* ══════════════════════════════════════════════════════════════════════════ */
/*  Les lectures sont GROUPÉES — jamais une par ligne                          */
/* ══════════════════════════════════════════════════════════════════════════ */

describe('le nombre de requêtes ne dépend pas du nombre de missions', () => {
  it('le MÊME nombre de requêtes, que le compte porte une mission ou trois', async () => {
    // ⚠️ L'invariant est « le compte, pas les missions » — pas un nombre.
    // L'assertion épinglait `3` : ajouter une lecture PAR COMPTE (le
    // comportement de paiement, 01/09/2026) la faisait rougir alors que rien de
    // ce qu'elle protège n'avait bougé. Un test qui épingle une ligne du code
    // plutôt qu'un invariant se casse à la première intégration.
    const one = makeService({ missions: [mission({ id: MISSION_A })] })
    await read(one.service)
    const three = makeService({
      missions: [mission({ id: MISSION_A }), mission({ id: MISSION_B }), mission({ id: MISSION_C })],
    })
    await read(three.service)
    expect(three.queries.length).toBe(one.queries.length)
    // Et le compte reste BORNÉ : une lecture par famille de faits, jamais une
    // par ligne. La borne est haute exprès — c'est le RAPPORT au nombre de
    // missions qui est gardé, pas le chiffre exact.
    expect(one.queries.length).toBeGreaterThan(0)
    expect(one.queries.length).toBeLessThanOrEqual(6)
  })
})
