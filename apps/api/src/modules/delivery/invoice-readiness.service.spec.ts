import { ConflictException, NotFoundException } from '@nestjs/common'
import { InvoiceReadinessService } from './invoice-readiness.service'

const WORKSPACE = 'w0000000-0000-4000-8000-000000000001'
const USER = 'u0000000-0000-4000-8000-000000000001'
const MISSION = 'm0000000-0000-4000-8000-000000000001'
const ACCOUNT = 'a0000000-0000-4000-8000-000000000001'

function monthRow(over: Record<string, unknown> = {}) {
  return {
    mission_id: MISSION,
    mission_label: 'Renfort plateforme',
    account_name: 'ACME',
    // `a.id`, sélectionné par le `LEFT JOIN accounts a` (30/08/2026, §9). Un
    // défaut NON NUL : les tests qui veulent la mission SANS compte le
    // nomment explicitement (`null`), comme pour `loaded_daily_cost_cents`.
    account_id: ACCOUNT,
    daily_rate: '650',
    // Le coût CHARGÉ, en CENTIMES, rendu en CHAÎNE comme le `bigint` réel de
    // pg. Un défaut NON NUL : la plupart des tests de ce fichier vérifient un
    // mois « prêt », et `missing_cost` ne doit se déclencher que dans les
    // tests qui le nomment explicitement (`null`).
    loaded_daily_cost_cents: '30000',
    requires_po: false,
    po_number: null,
    // La date de DÉMARRAGE, sélectionnée par la vraie requête (`m.started_on`).
    // Elle manquait à ce faux, donc valait `undefined` — que l'ancien
    // `startedOn === null` laissait passer sans lever `missing_start_date`.
    // Un faux qui omet une colonne réelle teste une forme qui n'existe pas :
    // les tests qui veulent une mission SANS date la nomment (`null`).
    started_on: '2026-01-01',
    ts_status: 'validated',
    ts_days: '18',
    ts_anomalies: [],
    invoiced_at: null,
    reminders_sent: 0,
    last_reminder_at: null,
    disputed_at: null,
    dispute_reason: null,
    dispute_resolved_at: null,
    // La facture fournisseur (30/08/2026, §9) : `null` par défaut — la
    // plupart des tests de ce fichier portent sur une mission `direct`, pour
    // laquelle la question ne se pose pas. Les tests dédiés le nomment.
    channel: null,
    supplier_invoice_received: false,
    ...over,
  }
}

function makeService(overrides: Record<string, unknown> = {}) {
  const queries: { sql: string; params: unknown[] }[] = []
  const manager = {
    query: jest.fn(async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params })
      // Le JOIN « chargé d'affaires » du rang 3 — DISTINGUÉ du contrôle
      // `assertMission` juste en dessous, dont la requête est un sous-texte
      // du sien (`FROM missions WHERE id`).
      // #2197.6 — l'agrégat des brouillons/dépôts connecteur, PAR mois de
      // workspace (jamais lu jusqu'ici hors de la fiche d'UNE mission).
      if (sql.includes('FROM invoice_connector_write_requests'))
        return (overrides['connectorDrafts'] as unknown[]) ?? []
      // #2783 — « dont avenants » du mois, à l'échelle de l'espace.
      if (sql.includes('FROM mission_amendments')) return (overrides['amendmentRows'] as unknown[]) ?? []
      if (sql.includes('FROM missions WHERE id = ANY')) return (overrides['ownerRows'] as unknown[]) ?? []
      if (sql.includes('FROM missions WHERE id')) return overrides['missionMissing'] === true ? [] : [{ id: MISSION }]
      if (sql.includes('FROM missions m')) {
        const rows = (overrides['rows'] as { mission_id: string }[]) ?? [monthRow()]
        // Le troisième paramètre est `missionId ?? null` — simuler le VRAI
        // `WHERE` ici est ce qui distingue « le paramètre PART » de « le
        // paramètre RESTREINT quelque chose » : sans ce filtre, un test qui ne
        // vérifierait que `params[2]` passerait même si le service avait cessé
        // de brancher `missionId` dans le SQL.
        const missionId = params[2] ?? null
        return missionId ? rows.filter(row => row.mission_id === missionId) : rows
      }
      // Un `UPDATE … RETURNING` rend `[lignes, nombre]` et non les lignes —
      // le mock rend donc la VRAIE forme de TypeORM, sans quoi le test ne
      // prouverait rien de ce que `returnedRows` corrige.
      if (sql.includes('RETURNING id')) return overrides['updated'] ?? [[{ id: 'r1' }], 1]
      return []
    }),
  }
  const readiness = { manager }
  // L'espace arrive du contrôleur : le service ne résout plus rien lui-même
  // (règle §3.2 — un service ne va pas chercher celui d'un autre module).
  const service = new InvoiceReadinessService(readiness as never)
  return { service, queries, manager }
}

describe('InvoiceReadinessService.list', () => {
  it('lit le mois PRÉCÉDENT par défaut', async () => {
    // Le 5 du mois, la question n'est pas « où en est le mois en cours » — il
    // n'est pas fini — mais « qu'est-ce qui bloque le mois à facturer ».
    const { service } = makeService()
    const result = await service.list(
      WORKSPACE,
      { blockedOnly: false },
      { canReadFinance: true },
      new Date('2026-09-05T09:00:00Z'),
    )
    expect(result.month).toBe('2026-08')
  })

  it('convertit le TJM en centimes avant de préparer un montant', async () => {
    // Le TJM d'une mission est en EUROS ; tout le module compte en centimes.
    const { service } = makeService()
    const result = await service.list(
      WORKSPACE,
      { blockedOnly: false },
      { canReadFinance: true },
      new Date('2026-09-05T09:00:00Z'),
    )
    expect(result.items[0]?.preparedAmountCents).toBe(18 * 65_000)
    expect(result.items[0]?.state).toBe('ready')
  })

  // ── `accountId` (30/08/2026, §9) ──────────────────────────────────────────
  //
  // La requête joint déjà `accounts` (`LEFT JOIN accounts a ON a.id =
  // m.account_id`) mais ne sélectionnait pas `a.id` : la ligne rendue ne
  // portait que `accountName`, une CHAÎNE. Faute d'identifiant, l'écran des
  // comptes devait joindre par `missionId` via `GET /delivery/missions`,
  // plafonné à 200 lignes. Ces deux tests prouvent que `a.id` est SÉLECTIONNÉ
  // et RENDU — et que l'absence de compte (LEFT JOIN) reste un `null` nommé,
  // jamais une chaîne inventée.
  it('rend `accountId`, sélectionné par le LEFT JOIN sur `accounts`', async () => {
    const { service, queries } = makeService()
    const result = await service.list(
      WORKSPACE,
      { blockedOnly: false },
      { canReadFinance: true },
      new Date('2026-09-05T09:00:00Z'),
    )
    expect(result.items[0]?.accountId).toBe(ACCOUNT)
    const read = queries.find(entry => entry.sql.includes('FROM missions m'))
    expect(read?.sql).toContain('a.id AS account_id')
  })

  it('rend `accountId: null` sur une mission SANS compte — le LEFT JOIN le permet, ce n’est pas une erreur', async () => {
    const { service } = makeService({ rows: [monthRow({ account_id: null, account_name: null })] })
    const result = await service.list(
      WORKSPACE,
      { blockedOnly: false },
      { canReadFinance: true },
      new Date('2026-09-05T09:00:00Z'),
    )
    expect(result.items[0]?.accountId).toBeNull()
    expect(result.items[0]?.accountName).toBeNull()
  })

  it('ÉCARTE les missions en brouillon et celles hors du mois', async () => {
    const { service, queries } = makeService()
    await service.list(WORKSPACE, { blockedOnly: false }, { canReadFinance: true }, new Date('2026-09-05T09:00:00Z'))
    const read = queries.find(entry => entry.sql.includes('FROM missions m'))
    expect(read?.sql).toContain("m.status <> 'draft'")
    expect(read?.sql).toContain('m.ends_on IS NULL OR m.ends_on >=')
  })

  it('résume TOUT le mois, même en vue « bloqués seulement »', async () => {
    // Calculer le résumé sur la liste filtrée afficherait « 0 prêt » alors que
    // dix le sont.
    const { service } = makeService({
      rows: [monthRow(), monthRow({ mission_id: 'm2', ts_status: null })],
    })
    const result = await service.list(
      WORKSPACE,
      { blockedOnly: true },
      { canReadFinance: true },
      new Date('2026-09-05T09:00:00Z'),
    )
    expect(result.items).toHaveLength(1)
    expect(result.summary.ready).toBe(1)
    expect(result.summary.blocked).toBe(1)
  })

  it('n’additionne PAS ce qu’il n’a pas pu chiffrer, et le compte à part', async () => {
    const { service } = makeService({
      rows: [monthRow(), monthRow({ mission_id: 'm2', daily_rate: null })],
    })
    const result = await service.list(
      WORKSPACE,
      { blockedOnly: false },
      { canReadFinance: true },
      new Date('2026-09-05T09:00:00Z'),
    )
    expect(result.summary.preparedAmountCents).toBe(18 * 65_000)
    expect(result.summary.withoutAmount).toBe(1)
  })

  it('un TJM renseigné et un coût chargé absent ne part PAS « prêt à facturer »', async () => {
    // Le test qui compte : la donnée existe déjà (`mission_commercial_terms.
    // loaded_daily_cost_cents`, déjà JOINte pour `billing_cadence`) — c'est le
    // bloqueur qui manquait, pas la lecture.
    const { service } = makeService({
      rows: [monthRow({ loaded_daily_cost_cents: null })],
    })
    const result = await service.list(
      WORKSPACE,
      { blockedOnly: false },
      { canReadFinance: true },
      new Date('2026-09-05T09:00:00Z'),
    )
    expect(result.items[0]?.state).toBe('blocked')
    expect(result.items[0]?.blockers).toContain('missing_cost')
  })

  it("un coût chargé à ZÉRO — la CHAÎNE `'0'` que pg rend pour un `bigint` — n’est pas un coût ABSENT", async () => {
    // Le piège : `Number('0')` est falsy, `'0' === null` ne l'est pas. Un
    // consultant interne peut légitimement avoir un coût chargé nul.
    const { service } = makeService({
      rows: [monthRow({ loaded_daily_cost_cents: '0' })],
    })
    const result = await service.list(
      WORKSPACE,
      { blockedOnly: false },
      { canReadFinance: true },
      new Date('2026-09-05T09:00:00Z'),
    )
    expect(result.items[0]?.state).toBe('ready')
    expect(result.items[0]?.blockers).not.toContain('missing_cost')
  })

  // #2563.1/#2566.2 — le TJM, la référence PO et le chargé d'affaires étaient
  // CALCULÉS (ou joignables) mais jamais RENDUS sur la ligne.
  it('rend le TJM, la référence PO et le CHARGÉ D’AFFAIRES sur chaque ligne', async () => {
    const { service } = makeService({
      rows: [
        monthRow({
          po_number: 'PO-2026-0042',
          owner_id: 'u0000000-0000-4000-8000-000000000009',
          owner_first_name: 'Awa',
          owner_last_name: 'Diallo',
          owner_email: null,
        }),
      ],
    })
    const result = await service.list(
      WORKSPACE,
      { blockedOnly: false },
      { canReadFinance: true },
      new Date('2026-09-05T09:00:00Z'),
    )
    expect(result.items[0]?.dailyRateCents).toBe(65_000)
    expect(result.items[0]?.poNumber).toBe('PO-2026-0042')
    expect(result.items[0]?.ownerId).toBe('u0000000-0000-4000-8000-000000000009')
    expect(result.items[0]?.ownerName).toBe('Awa Diallo')
  })

  // #2198.20 — l'INTERLOCUTEUR de facturation, résolu en nom par le JOIN
  // `contacts`. Était lu côté bloqueur (`billing_contact_id`), jamais rendu.
  it('rend l’INTERLOCUTEUR de facturation sur chaque ligne', async () => {
    const { service } = makeService({
      rows: [monthRow({ billing_contact_name: 'Camille Vasseur' })],
    })
    const result = await service.list(
      WORKSPACE,
      { blockedOnly: false },
      { canReadFinance: true },
      new Date('2026-09-05T09:00:00Z'),
    )
    expect(result.items[0]?.billingContactName).toBe('Camille Vasseur')
  })

  it('rend `null`, pas `undefined`, quand aucun contact n’est saisi', async () => {
    const { service } = makeService({ rows: [monthRow({ billing_contact_name: null })] })
    const result = await service.list(
      WORKSPACE,
      { blockedOnly: false },
      { canReadFinance: true },
      new Date('2026-09-05T09:00:00Z'),
    )
    expect(result.items[0]?.billingContactName).toBeNull()
  })

  // #2566.2 — le bon de commande EXISTE mais ne couvre plus le mois facturé.
  describe('le bon de commande doit couvrir le mois facturé (#2566.2)', () => {
    it('bloque quand il expire AVANT la fin du mois — le mois par défaut est août', async () => {
      const { service } = makeService({
        rows: [monthRow({ requires_po: true, po_number: 'PO-2026-0042', po_valid_until: '2026-08-15' })],
      })
      const result = await service.list(
        WORKSPACE,
        { blockedOnly: false },
        { canReadFinance: true },
        new Date('2026-09-05T09:00:00Z'),
      )
      expect(result.items[0]?.blockers).toContain('po_period_mismatch')
      expect(result.items[0]?.state).toBe('blocked')
    })

    it('ne bloque PAS quand il couvre le mois entier', async () => {
      const { service } = makeService({
        rows: [monthRow({ requires_po: true, po_number: 'PO-2026-0042', po_valid_until: '2026-12-31' })],
      })
      const result = await service.list(
        WORKSPACE,
        { blockedOnly: false },
        { canReadFinance: true },
        new Date('2026-09-05T09:00:00Z'),
      )
      expect(result.items[0]?.blockers).not.toContain('po_period_mismatch')
      expect(result.items[0]?.state).toBe('ready')
    })
  })

  // #2563 / #2557 — « bloquée CRA » : des jours SAISIS sans CRA débloquent le
  // mois, et l'écran le NOMME. Ils ne remplacent jamais un relevé déposé.
  describe('jours saisis sans CRA (#2563)', () => {
    const NOW = new Date('2026-09-05T09:00:00Z')
    const noCra = { ts_status: null, ts_days: null, ts_anomalies: null, ts_expected: null }

    it('débloque un mois sans relevé et nomme la source « manual »', async () => {
      const { service } = makeService({ rows: [monthRow({ ...noCra, prep_manual_days: '19' })] })
      const result = await service.list(WORKSPACE, { blockedOnly: false }, { canReadFinance: true }, NOW)
      expect(result.items[0]?.blockers).not.toContain('missing_timesheet')
      expect(result.items[0]?.state).toBe('ready')
      expect(result.items[0]?.days).toBe(19)
      expect(result.items[0]?.daysSource).toBe('manual')
      expect(result.items[0]?.preparedAmountCents).toBe(19 * 65000)
    })

    it('reste bloqué quand rien n’est saisi, et ne devine aucune source', async () => {
      const { service } = makeService({ rows: [monthRow({ ...noCra })] })
      const result = await service.list(WORKSPACE, { blockedOnly: false }, { canReadFinance: true }, NOW)
      expect(result.items[0]?.blockers).toContain('missing_timesheet')
      expect(result.items[0]?.daysSource).toBeNull()
    })

    it('un relevé déposé PRIME sur la saisie', async () => {
      const { service } = makeService({ rows: [monthRow({ prep_manual_days: '3' })] })
      const result = await service.list(WORKSPACE, { blockedOnly: false }, { canReadFinance: true }, NOW)
      expect(result.items[0]?.days).toBe(18)
      expect(result.items[0]?.daysSource).toBe('cra')
    })

    it('le N° de bon de commande du mois remplace celui de la mission', async () => {
      const { service } = makeService({ rows: [monthRow({ po_number: 'BC-A', prep_po_number: 'BC-B' })] })
      const result = await service.list(WORKSPACE, { blockedOnly: false }, { canReadFinance: true }, NOW)
      expect(result.items[0]?.poNumber).toBe('BC-B')
    })
  })

  describe('la mission ne facture que sous un contrat ACTIF de sa société (#2422.9)', () => {
    const LEGAL_ENTITY = 'e0000000-0000-4000-8000-000000000001'
    const NOW = new Date('2026-09-05T09:00:00Z')

    it('bloque quand le SEUL contrat qui matche la société est expiré', async () => {
      const { service } = makeService({
        rows: [
          monthRow({
            legal_entity_id: LEGAL_ENTITY,
            matched_contracts: [{ status: 'signed', startsOn: '2025-01-01', endsOn: '2026-01-01' }],
          }),
        ],
      })
      const result = await service.list(WORKSPACE, { blockedOnly: false }, { canReadFinance: true }, NOW)
      expect(result.items[0]?.blockers).toContain('legal_contract_inactive')
      expect(result.items[0]?.state).toBe('blocked')
    })

    it('ne bloque PAS quand un contrat qui matche est ACTIF, même si un autre est résilié', async () => {
      const { service } = makeService({
        rows: [
          monthRow({
            legal_entity_id: LEGAL_ENTITY,
            matched_contracts: [
              { status: 'terminated', startsOn: '2024-01-01', endsOn: '2025-01-01' },
              { status: 'signed', startsOn: '2026-01-01', endsOn: null },
            ],
          }),
        ],
      })
      const result = await service.list(WORKSPACE, { blockedOnly: false }, { canReadFinance: true }, NOW)
      expect(result.items[0]?.blockers).not.toContain('legal_contract_inactive')
      expect(result.items[0]?.state).toBe('ready')
    })

    it('ne bloque JAMAIS sans société connue sur la mission', async () => {
      const { service } = makeService({
        rows: [monthRow({ legal_entity_id: null, matched_contracts: null })],
      })
      const result = await service.list(WORKSPACE, { blockedOnly: false }, { canReadFinance: true }, NOW)
      expect(result.items[0]?.blockers).not.toContain('legal_contract_inactive')
    })

    it('ne bloque JAMAIS quand aucun contrat de l’espace ne partage cette société', async () => {
      const { service } = makeService({
        rows: [monthRow({ legal_entity_id: LEGAL_ENTITY, matched_contracts: null })],
      })
      const result = await service.list(WORKSPACE, { blockedOnly: false }, { canReadFinance: true }, NOW)
      expect(result.items[0]?.blockers).not.toContain('legal_contract_inactive')
    })
  })

  it('sort un mois DÉCLARÉ facturé AILLEURS de la surveillance', async () => {
    // #2197.41 — sans preuve de connecteur, c'est une déclaration.
    const { service } = makeService({
      rows: [monthRow({ ts_status: null, invoiced_at: new Date('2026-09-02T09:00:00Z') })],
    })
    const result = await service.list(
      WORKSPACE,
      { blockedOnly: false },
      { canReadFinance: true },
      new Date('2026-09-05T09:00:00Z'),
    )
    expect(result.items[0]?.state).toBe('invoiced_declared')
    expect(result.items[0]?.blockers).toEqual([])
  })
})

// ── `missionId` — la fiche mission lit son PROPRE état de facturation ───────
//
// `invoiceReadinessQuerySchema` a gagné un `missionId` optionnel (30/08/2026),
// le pendant de `timesheetMonthQuerySchema.missionId` qui existait déjà. Ce
// bloc prouve que le service le LIT et RESTREINT dessus — pas seulement que le
// paramètre part : `makeService` simule le vrai `WHERE` (voir plus haut).
describe('InvoiceReadinessService.list — resserré sur UNE mission', () => {
  const MISSION_B = 'm0000000-0000-4000-8000-000000000002'

  it('sans `missionId`, rend TOUTES les missions du mois', async () => {
    const { service } = makeService({
      rows: [monthRow(), monthRow({ mission_id: MISSION_B })],
    })
    const result = await service.list(
      WORKSPACE,
      { blockedOnly: false },
      { canReadFinance: true },
      new Date('2026-09-05T09:00:00Z'),
    )
    expect(result.items.map(item => item.missionId)).toEqual([MISSION, MISSION_B])
  })

  it('avec `missionId`, ne rend QUE cette mission-là', async () => {
    const { service, queries } = makeService({
      rows: [monthRow(), monthRow({ mission_id: MISSION_B })],
    })
    const result = await service.list(
      WORKSPACE,
      { blockedOnly: false, missionId: MISSION },
      { canReadFinance: true },
      new Date('2026-09-05T09:00:00Z'),
    )
    expect(result.items).toHaveLength(1)
    expect(result.items[0]?.missionId).toBe(MISSION)

    // Et le résumé PORTE sur cette même restriction — pas de fuite d'une
    // mission dans le total d'une autre.
    expect(result.summary.ready + result.summary.blocked).toBe(1)

    const read = queries.find(entry => entry.sql.includes('FROM missions m'))
    expect(read?.params[2]).toBe(MISSION)
    // Le filtre vit dans le `WHERE`, jamais dans le tri applicatif après-coup —
    // sinon le mock ci-dessus ne prouverait rien de plus qu'un paramètre qui
    // part dans le vide.
    expect(read?.sql).toContain('$3::uuid IS NULL OR m.id = $3::uuid')
  })

  it('une mission d’un autre espace ne rend RIEN — le filtre ne contourne pas `workspace_id`', async () => {
    // Le mock filtre par `mission_id` seul ; c'est `workspace_id = $1`, dans le
    // même `WHERE`, qui tient le cloisonnement en vrai. Ce test garde
    // seulement que les DEUX paramètres partent, pas qu'ils s'excluent.
    const { service, queries } = makeService({ rows: [monthRow()] })
    await service.list(
      WORKSPACE,
      { blockedOnly: false, missionId: MISSION },
      { canReadFinance: true },
      new Date('2026-09-05T09:00:00Z'),
    )
    const read = queries.find(entry => entry.sql.includes('FROM missions m'))
    expect(read?.sql).toContain('m.workspace_id = $1')
    expect(read?.params[0]).toBe(WORKSPACE)
  })
})

/**
 * #2197.6 — « Résumé : Factures préparées » : le compteur de brouillons/
 * dépôts connecteur (`invoice_connector_write_requests`), qui ne se lisait
 * jusqu'ici que par MISSION (`MissionDetailTabs.tsx`), jamais agrégé par mois
 * de workspace pour `/missions/facturation`.
 */
describe('InvoiceReadinessService.list — `preparedInvoicesCount` (#2197.6)', () => {
  it('rend 0 sans qu’aucune tentative n’ait été faite ce mois — jamais un total absent', async () => {
    const { service } = makeService({ connectorDrafts: [{ count: '0' }] })
    const result = await service.list(
      WORKSPACE,
      { blockedOnly: false },
      { canReadFinance: true },
      new Date('2026-09-05T09:00:00Z'),
    )
    expect(result.summary.preparedInvoicesCount).toBe(0)
  })

  it('compte les brouillons `created`/`sent`, scopés au même mois et au même espace', async () => {
    const { service, queries } = makeService({ connectorDrafts: [{ count: '3' }] })
    const result = await service.list(
      WORKSPACE,
      { blockedOnly: false },
      { canReadFinance: true },
      new Date('2026-09-05T09:00:00Z'),
    )
    expect(result.summary.preparedInvoicesCount).toBe(3)

    const read = queries.find(entry => entry.sql.includes('FROM invoice_connector_write_requests'))
    expect(read?.sql).toContain('workspace_id = $1')
    expect(read?.sql).toContain("state IN ('created', 'sent')")
    expect(read?.params[0]).toBe(WORKSPACE)
    expect(read?.params[1]).toBe('2026-08-01')
  })

  it('resserre sur UNE mission comme le reste du résumé, quand `missionId` est fourni', async () => {
    const { service, queries } = makeService({ connectorDrafts: [{ count: '1' }] })
    await service.list(
      WORKSPACE,
      { blockedOnly: false, missionId: MISSION },
      { canReadFinance: true },
      new Date('2026-09-05T09:00:00Z'),
    )
    const read = queries.find(entry => entry.sql.includes('FROM invoice_connector_write_requests'))
    expect(read?.params[2]).toBe(MISSION)
  })

  it('n’est PAS masqué par `canReadFinance: false` — c’est un compte, pas un montant', async () => {
    const { service } = makeService({ connectorDrafts: [{ count: '2' }] })
    const result = await service.list(
      WORKSPACE,
      { blockedOnly: false },
      { canReadFinance: false },
      new Date('2026-09-05T09:00:00Z'),
    )
    expect(result.summary.preparedInvoicesCount).toBe(2)
  })
})

describe('InvoiceReadinessService.list — `amendmentsAccepted`/`amendmentsSimulated` (#2783)', () => {
  it('rend 0/0 sans aucun avenant à effet ce mois — jamais un total absent', async () => {
    const { service } = makeService({ amendmentRows: [] })
    const result = await service.list(
      WORKSPACE,
      { blockedOnly: false },
      { canReadFinance: true },
      new Date('2026-09-05T09:00:00Z'),
    )
    expect(result.summary.amendmentsAccepted).toBe(0)
    expect(result.summary.amendmentsSimulated).toBe(0)
  })

  it('sépare `accepted`/`active` (décidés) de `proposed` (simulés), jamais fondus', async () => {
    const { service, queries } = makeService({
      amendmentRows: [{ status: 'accepted' }, { status: 'active' }, { status: 'proposed' }],
    })
    const result = await service.list(
      WORKSPACE,
      { blockedOnly: false },
      { canReadFinance: true },
      new Date('2026-09-05T09:00:00Z'),
    )
    expect(result.summary.amendmentsAccepted).toBe(2)
    expect(result.summary.amendmentsSimulated).toBe(1)

    const read = queries.find(entry => entry.sql.includes('FROM mission_amendments'))
    expect(read?.sql).toContain('workspace_id = $1')
    expect(read?.params[0]).toBe(WORKSPACE)
    expect(read?.params[1]).toBe('2026-08-01')
  })

  it('n’est PAS masqué par `canReadFinance: false` — ce sont des comptes, pas des montants', async () => {
    const { service } = makeService({ amendmentRows: [{ status: 'accepted' }, { status: 'proposed' }] })
    const result = await service.list(
      WORKSPACE,
      { blockedOnly: false },
      { canReadFinance: false },
      new Date('2026-09-05T09:00:00Z'),
    )
    expect(result.summary.amendmentsAccepted).toBe(1)
    expect(result.summary.amendmentsSimulated).toBe(1)
  })
})

describe('InvoiceReadinessService.dueReminders', () => {
  // Une relance d'ENCAISSEMENT porte sur une facture PARTIE et impayée, et se
  // compte depuis son ÉCHÉANCE — jamais depuis la fin du mois travaillé.
  const invoiced = (over: Record<string, unknown> = {}) =>
    monthRow({ invoiced_at: new Date('2026-09-01T09:00:00Z'), due_on: '2026-09-30', ...over })

  it('ne relance PAS un mois prêt : il n’y a aucune facture à encaisser', async () => {
    const { service } = makeService()
    await expect(
      service.dueReminders(WORKSPACE, { month: '2026-08', canReadFinance: true }, new Date('2026-09-20T09:00:00Z')),
    ).resolves.toEqual([])
  })

  it('ne relance PAS avant l’échéance de règlement', async () => {
    // ⚠️ Le mois travaillé est fini depuis huit jours — l'ancien pivot aurait
    // relancé. L'échéance, elle, est encore à venir.
    const { service } = makeService({ rows: [invoiced()] })
    await expect(
      service.dueReminders(WORKSPACE, { month: '2026-08', canReadFinance: true }, new Date('2026-09-08T09:00:00Z')),
    ).resolves.toEqual([])
  })

  it('relance une facture passé son échéance', async () => {
    // La cadence de PAIEMENT : 7 jours, pas 5 — la source (PDF 6 §6.4) le
    // demande, et la cadence du RELEVÉ (5/12/20) n'est pas celle d'un client.
    const { service } = makeService({ rows: [invoiced()] })
    const due = await service.dueReminders(
      WORKSPACE,
      { month: '2026-08', canReadFinance: true },
      new Date('2026-10-07T09:00:00Z'),
    )
    expect(due).toHaveLength(1)
    expect(due[0]?.index).toBe(1)
    expect(due[0]?.overdueDays).toBe(7)
    // Le premier rang ne rejoint PAS le chargé d'affaires — seul le dernier.
    expect(due[0]?.ownerId).toBeNull()
  })

  it('J+6 ne suffit plus — la cadence PARTAGÉE relançait à J+5 avant le 30/08/2026', async () => {
    const { service } = makeService({ rows: [invoiced()] })
    await expect(
      service.dueReminders(WORKSPACE, { month: '2026-08', canReadFinance: true }, new Date('2026-10-06T09:00:00Z')),
    ).resolves.toEqual([])
  })

  it('le TROISIÈME rang rejoint aussi le chargé d’affaires — pas seulement le contact de facturation', async () => {
    // La source le demande au dernier rang : si deux relances au contact de
    // facturation n'ont rien donné, c'est le porteur de la mission qu'on
    // prévient avant que le sujet ne remonte à un humain.
    const OWNER = 'o0000000-0000-4000-8000-000000000009'
    const { service, queries } = makeService({
      rows: [invoiced({ reminders_sent: 2 })],
      ownerRows: [{ id: MISSION, owner_id: OWNER }],
    })
    const due = await service.dueReminders(
      WORKSPACE,
      { month: '2026-08', canReadFinance: true },
      new Date('2026-10-30T09:00:00Z'),
    )
    expect(due).toHaveLength(1)
    expect(due[0]?.index).toBe(3)
    expect(due[0]?.ownerId).toBe(OWNER)
    // Le JOIN est ÉTROIT : une requête dédiée, jamais un champ recopié dans
    // celle du mois.
    expect(queries.some(entry => entry.sql.includes('FROM missions WHERE id = ANY'))).toBe(true)
  })

  it('ne devine PAS de porteur sur une mission qui n’en a pas — une fiche incomplète, pas une raison de deviner', async () => {
    const { service } = makeService({
      rows: [invoiced({ reminders_sent: 2 })],
      ownerRows: [{ id: MISSION, owner_id: null }],
    })
    const due = await service.dueReminders(
      WORKSPACE,
      { month: '2026-08', canReadFinance: true },
      new Date('2026-10-30T09:00:00Z'),
    )
    expect(due[0]?.ownerId).toBeNull()
  })

  it('ne relance JAMAIS une facture déjà payée', async () => {
    const { service } = makeService({ rows: [invoiced({ paid_at: new Date('2026-10-02T09:00:00Z') })] })
    await expect(
      service.dueReminders(WORKSPACE, { month: '2026-08', canReadFinance: true }, new Date('2026-12-01T09:00:00Z')),
    ).resolves.toEqual([])
  })

  it('ne relance rien sans échéance : on ne devine pas une date', async () => {
    const { service } = makeService({ rows: [invoiced({ due_on: null })] })
    await expect(
      service.dueReminders(WORKSPACE, { month: '2026-08', canReadFinance: true }, new Date('2026-12-01T09:00:00Z')),
    ).resolves.toEqual([])
  })

  it('s’arrête après TROIS relances', async () => {
    const { service } = makeService({ rows: [invoiced({ reminders_sent: 3 })] })
    await expect(
      service.dueReminders(WORKSPACE, { month: '2026-08', canReadFinance: true }, new Date('2026-12-01T09:00:00Z')),
    ).resolves.toEqual([])
  })
})

describe('InvoiceReadinessService.markInvoiced', () => {
  it('refuse une mission d’un autre espace', async () => {
    const { service } = makeService({ missionMissing: true })
    await expect(service.markInvoiced(WORKSPACE, USER, MISSION, '2026-08')).rejects.toBeInstanceOf(NotFoundException)
  })

  it('écrit l’état « DÉCLARÉ facturé » en upsert — jamais « facturé » prouvé', async () => {
    // #2197.41 — ce chemin d'écriture ne porte AUCUNE preuve de connecteur :
    // c'est une déclaration humaine, et elle se nomme comme telle en base.
    const { service, queries } = makeService({
      rows: [monthRow({ invoiced_at: new Date('2026-09-02T09:00:00Z') })],
    })
    await service.markInvoiced(WORKSPACE, USER, MISSION, '2026-08')
    const write = queries.find(entry => entry.sql.includes('INSERT INTO invoice_readiness'))
    expect(write?.sql).toContain('ON CONFLICT (mission_id, period_month)')
    expect(write?.sql).toContain("state = 'invoiced_declared'")
    expect(write?.sql).not.toContain("state = 'invoiced'")
  })

  it('#2197.41 — rend le NOM du déclarant sur une ligne déclarée', async () => {
    const { service } = makeService({
      rows: [
        monthRow({
          invoiced_at: new Date('2026-09-02T09:00:00Z'),
          invoiced_by: USER,
          declarer_first_name: 'Louis',
          declarer_last_name: 'Schlegel',
          declarer_email: 'louis@bellum-it.com',
        }),
      ],
    })
    const result = await service.list(
      WORKSPACE,
      { blockedOnly: false },
      { canReadFinance: true },
      new Date('2026-09-05T09:00:00Z'),
    )
    expect(result.items[0]?.state).toBe('invoiced_declared')
    expect(result.items[0]?.invoicedByName).toBe('Louis Schlegel')
  })
})

describe('InvoiceReadinessService.recordReminder', () => {
  it('INCRÉMENTE le compteur plutôt que de l’écraser', async () => {
    // L'écraser ferait repartir la cadence à zéro et relancer indéfiniment.
    const { service, queries } = makeService()
    await service.recordReminder(WORKSPACE, MISSION, '2026-08', ['missing_timesheet'])
    const write = queries.find(entry => entry.sql.includes('INSERT INTO invoice_readiness'))
    expect(write?.sql).toContain('reminders_sent = invoice_readiness.reminders_sent + 1')
  })

  it('garde les bloqueurs VUS au moment de la relance', async () => {
    // C'est ce qu'il faut relire quand le client dit « personne ne m'a rien
    // demandé ».
    const { service, queries } = makeService()
    await service.recordReminder(WORKSPACE, MISSION, '2026-08', ['missing_timesheet', 'missing_po'])
    const write = queries.find(entry => entry.sql.includes('INSERT INTO invoice_readiness'))
    expect(write?.params[3]).toBe(JSON.stringify(['missing_timesheet', 'missing_po']))
  })
})

describe('InvoiceReadinessService — le geste de litige (BEL-MIS-011)', () => {
  it('écrit le litige et son MOTIF, et n’efface rien', async () => {
    const { service, queries } = makeService({
      rows: [monthRow({ invoiced_at: new Date('2026-09-02T09:00:00Z'), disputed_at: new Date() })],
    })
    await service.openDispute(WORKSPACE, MISSION, '2026-08', 'Le client conteste 3 jours de mars')
    const write = queries.find(entry => entry.sql.includes('SET disputed_at'))
    expect(write?.sql).toContain('dispute_reason = $4')
    // Le litige ne touche NI la marque « facturé », NI le paiement : il dit
    // qu'on discute, pas que la facture n'a jamais existé.
    expect(write?.sql).not.toContain('invoiced_at = NULL')
    expect(write?.params[3]).toBe('Le client conteste 3 jours de mars')
  })

  it('n’ouvre un litige que sur une facture ANNONCÉE, et jamais deux fois', async () => {
    // Un litige suppose une facture : « contester » un mois que personne n'a
    // facturé n'a pas de sens, et le rouvrir écraserait la date du premier.
    const { service, queries } = makeService({
      rows: [monthRow({ invoiced_at: new Date('2026-09-02T09:00:00Z'), disputed_at: new Date() })],
    })
    await service.openDispute(WORKSPACE, MISSION, '2026-08', 'Prestation contestée')
    const write = queries.find(entry => entry.sql.includes('SET disputed_at'))
    expect(write?.sql).toContain('invoiced_at IS NOT NULL')
    expect(write?.sql).toContain('disputed_at IS NULL')
  })

  it('REFUSE quand il n’y a rien à contester, au lieu de faire semblant', async () => {
    const { service } = makeService({ updated: [[], 0] })
    await expect(service.openDispute(WORKSPACE, MISSION, '2026-08', 'peu importe')).rejects.toBeInstanceOf(
      ConflictException,
    )
  })

  it('LÈVE un litige en DATANT la levée — jamais en effaçant le litige', async () => {
    const { service, queries } = makeService({
      rows: [monthRow({ invoiced_at: new Date('2026-09-02T09:00:00Z'), disputed_at: new Date() })],
    })
    await service.resolveDispute(WORKSPACE, MISSION, '2026-08')
    const write = queries.find(entry => entry.sql.includes('SET dispute_resolved_at'))
    expect(write?.sql).toContain('dispute_resolved_at = now()')
    expect(write?.sql).not.toContain('disputed_at = NULL')
    // On ne lève que ce qui court : lever deux fois réécrirait la date.
    expect(write?.sql).toContain('dispute_resolved_at IS NULL')
  })

  it('rend le litige À L’ÉCRAN — sinon la ligne se lit comme un simple retard', async () => {
    const { service } = makeService({
      rows: [
        monthRow({
          invoiced_at: new Date('2026-09-02T09:00:00Z'),
          disputed_at: new Date('2026-09-10T09:00:00Z'),
          dispute_reason: 'Trois jours contestés',
        }),
      ],
    })
    const result = await service.list(
      WORKSPACE,
      { blockedOnly: false },
      { canReadFinance: true },
      new Date('2026-09-20T09:00:00Z'),
    )
    expect(result.items[0]?.disputedAt).toBe('2026-09-10T09:00:00.000Z')
    expect(result.items[0]?.disputeReason).toBe('Trois jours contestés')
    expect(result.items[0]?.disputeResolvedAt).toBeNull()
  })

  it('NE RELANCE PLUS un mois en litige, et reprend quand il est levé', async () => {
    // Le cas réel : une facture est PARTIE, elle est échue, elle n'est pas
    // payée — et le client conteste. Sans ce refus, la cadence repart sur
    // quelqu'un qui a déjà dit qu'il ne paierait pas en l'état.
    //
    // ⚠️ Porté à la main le 27/08 : ce test et le pivot d'échéance viennent de
    // deux lots parallèles. Il posait `ts_status: null` pour retomber sur
    // l'état `blocked`, que le pivot a remplacé par « facture partie et
    // impayée ». La fixture change, le refus qu'elle vérifie ne change pas.
    const disputed = monthRow({
      invoiced_at: new Date('2026-09-01T09:00:00Z'),
      due_on: '2026-09-01',
      disputed_at: new Date('2026-09-03T09:00:00Z'),
    })
    const { service } = makeService({ rows: [disputed] })
    await expect(
      service.dueReminders(WORKSPACE, { month: '2026-08', canReadFinance: true }, new Date('2026-09-08T09:00:00Z')),
    ).resolves.toEqual([])

    const settled = makeService({
      rows: [monthRow({ ...disputed, dispute_resolved_at: new Date('2026-09-05T09:00:00Z') })],
    })
    const due = await settled.service.dueReminders(
      WORKSPACE,
      { month: '2026-08', canReadFinance: true },
      new Date('2026-09-08T09:00:00Z'),
    )
    expect(due).toHaveLength(1)
  })
})

/**
 * `supplierInvoiceStatus` — la facture ENTRANTE d'un sous-traitant sur le
 * mois (30/08/2026, §9 de ce lot). Distincte de `invoice_readiness`, qui
 * reste la facturation CLIENT : lire une facture fournisseur n'est pas en
 * émettre une, et ce champ ne touche à aucun bloqueur ni à `state` (les
 * tests plus haut, sur les mêmes lignes, restent inchangés).
 */
describe('InvoiceReadinessService.list — `supplierInvoiceStatus`', () => {
  it('`null` sur un canal DIRECT — la question ne se pose pas, ce n’est pas une absence mesurée', async () => {
    const { service } = makeService({ rows: [monthRow({ channel: 'direct' })] })
    const result = await service.list(
      WORKSPACE,
      { blockedOnly: false },
      { canReadFinance: true },
      new Date('2026-09-05T09:00:00Z'),
    )
    expect(result.items[0]?.supplierInvoiceStatus).toBeNull()
  })

  it('`null` quand le canal n’est pas renseigné du tout', async () => {
    const { service } = makeService({ rows: [monthRow({ channel: null })] })
    const result = await service.list(
      WORKSPACE,
      { blockedOnly: false },
      { canReadFinance: true },
      new Date('2026-09-05T09:00:00Z'),
    )
    expect(result.items[0]?.supplierInvoiceStatus).toBeNull()
  })

  it('`missing` — sous-traitée, et aucune facture fournisseur ne date de ce mois', async () => {
    const { service } = makeService({
      rows: [monthRow({ channel: 'subcontracting', supplier_invoice_received: false })],
    })
    const result = await service.list(
      WORKSPACE,
      { blockedOnly: false },
      { canReadFinance: true },
      new Date('2026-09-05T09:00:00Z'),
    )
    expect(result.items[0]?.supplierInvoiceStatus).toBe('missing')
  })

  it('`received` — sous-traitée, et au moins une facture fournisseur date de ce mois', async () => {
    const { service } = makeService({
      rows: [monthRow({ channel: 'subcontracting', supplier_invoice_received: true })],
    })
    const result = await service.list(
      WORKSPACE,
      { blockedOnly: false },
      { canReadFinance: true },
      new Date('2026-09-05T09:00:00Z'),
    )
    expect(result.items[0]?.supplierInvoiceStatus).toBe('received')
  })

  it('ne touche à AUCUN bloqueur ni à `state` — « lire n’est pas émettre »', async () => {
    // Une mission bloquée par un relevé manquant, sous-traitée, sans facture
    // fournisseur : les deux informations coexistent, indépendantes.
    const { service } = makeService({
      rows: [monthRow({ channel: 'subcontracting', ts_status: null })],
    })
    const result = await service.list(
      WORKSPACE,
      { blockedOnly: false },
      { canReadFinance: true },
      new Date('2026-09-05T09:00:00Z'),
    )
    expect(result.items[0]?.supplierInvoiceStatus).toBe('missing')
    expect(result.items[0]?.state).toBe('blocked')
    expect(result.items[0]?.blockers).toContain('missing_timesheet')
  })

  // #2196.31 — un mois marqué « non applicable » (exception tracée) ne réclame
  // plus de relevé à la facturation non plus : l'écran des relevés et celui de
  // la facturation disent la même chose du même fait.
  it('#2196.31 — un mois marqué non applicable ne bloque plus sur « relevé manquant »', async () => {
    const { service, queries } = makeService({
      rows: [monthRow({ ts_status: null, ts_days: null, not_applicable: true })],
    })
    const result = await service.list(
      WORKSPACE,
      { blockedOnly: false },
      { canReadFinance: true },
      new Date('2026-09-05T09:00:00Z'),
    )
    expect(result.items[0]?.blockers).not.toContain('missing_timesheet')
    expect(queries.find(q => q.sql.includes('FROM missions m'))?.sql).toContain('mission_timesheet_exceptions')
  })

  it('#2196.31 — l’exception ne couvre JAMAIS un relevé déposé', async () => {
    const { service } = makeService({
      rows: [monthRow({ ts_status: 'submitted', not_applicable: true })],
    })
    const result = await service.list(
      WORKSPACE,
      { blockedOnly: false },
      { canReadFinance: true },
      new Date('2026-09-05T09:00:00Z'),
    )
    expect(result.items[0]?.blockers).toContain('timesheet_not_validated')
  })

  it('n’est PAS gardé par `canReadFinance` — c’est un statut, jamais un montant', async () => {
    const { service } = makeService({
      rows: [monthRow({ channel: 'subcontracting', supplier_invoice_received: false })],
    })
    const result = await service.list(
      WORKSPACE,
      { blockedOnly: false },
      { canReadFinance: false },
      new Date('2026-09-05T09:00:00Z'),
    )
    expect(result.items[0]?.supplierInvoiceStatus).toBe('missing')
    expect(result.items[0]?.preparedAmountCents).toBeNull()
  })
})

// #2419.1 — « marquer payé » AVEC un montant crée un PAIEMENT rattaché : un
// second paiement s'ajoute au premier au lieu de l'écraser (ce qui rend le
// double paiement de #2419.5 visible). Sans montant, aucun paiement inventé.
describe('InvoiceReadinessService.recordPayment — objet Payment (#2419.1)', () => {
  it('un montant saisi devient une ligne `invoice_payments` rattachée, puis l’encaissé se recalcule en SOMME', async () => {
    const { service, queries } = makeService({ updated: [[{ id: 'r1' }], 1] })
    await service.recordPayment(
      WORKSPACE,
      MISSION,
      '2026-08',
      { paidAt: '2026-09-20T10:00:00Z', amountCents: 35700 },
      USER,
    )
    const insert = queries.find(q => q.sql.includes('INSERT INTO invoice_payments'))
    expect(insert?.params).toEqual([WORKSPACE, 'r1', 35700, '2026-09-20', USER])
    expect(queries.some(q => q.sql.includes('SUM(p.amount_cents)'))).toBe(true)
  })

  it('sans montant, AUCUN paiement n’est créé — on n’invente pas un montant', async () => {
    const { service, queries } = makeService({ updated: [[{ id: 'r1' }], 1] })
    await service.recordPayment(WORKSPACE, MISSION, '2026-08', {}, USER)
    expect(queries.some(q => q.sql.includes('INSERT INTO invoice_payments'))).toBe(false)
  })
})

// #2417.3 / #2417.4 — tranché par Louis 22/09 soir (decisions §8) : le montant
// DÉCLARÉ au contrat (jalon échu, retainer au prorata) prépare le mois.
describe('InvoiceReadinessService.list — montants déclarés (#2417.3, #2417.4)', () => {
  const at = new Date('2026-09-05T09:00:00Z')

  it('un forfait au JALON dont un jalon échoit dans le mois est DÛ, pour le montant du jalon', async () => {
    const { service, queries } = makeService({
      rows: [
        monthRow({
          billing_cadence: 'milestone',
          declared_milestones: [
            { dueOn: '2026-08-31', amountCents: '500000' },
            { dueOn: '2026-10-15', amountCents: '900000' },
          ],
        }),
      ],
    })
    const result = await service.list(WORKSPACE, { blockedOnly: false }, { canReadFinance: true }, at)
    expect(result.items[0]?.state).not.toBe('not_due')
    expect(result.items[0]?.preparedAmountCents).toBe(500_000)
    expect(queries.find(q => q.sql.includes('FROM missions m'))?.sql).toContain('FROM mission_milestones ms')
  })

  it('un RETAINER déclaré sur une mission démarrée le 17 août vaut 11 jours ouvrés sur 21', async () => {
    const { service } = makeService({
      rows: [monthRow({ started_on: '2026-08-17', retainer_monthly_cents: '2100000' })],
    })
    const result = await service.list(WORKSPACE, { blockedOnly: false }, { canReadFinance: true }, at)
    expect(result.items[0]?.preparedAmountCents).toBe(1_100_000)
  })
})

/**
 * #2198.45 — l'export de l'écran « encaissements ». La liste des mois vient du
 * NAVIGATEUR (qui a déjà calculé sa fenêtre glissante) ; le service ne fait
 * que la reparcourir et filtrer sur `isInvoicedState`, comme `isCollectible`
 * côté web.
 */
describe('InvoiceReadinessService.listWindow', () => {
  it('rend les lignes de CHAQUE mois en une lecture, sans filtre d’état', async () => {
    const { service } = makeService({ rows: [monthRow()] })
    const window = await service.listWindow(WORKSPACE, ['2026-07', '2026-08'], { canReadFinance: true })
    expect(window.items.map(item => item.periodMonth)).toEqual(['2026-07-01', '2026-08-01'])
    expect(window.canReadFinance).toBe(true)
  })
})

describe('InvoiceReadinessService.exportCollections', () => {
  it('reparcourt CHAQUE mois de la liste reçue, et tague chaque ligne du bon mois', async () => {
    const { service, queries } = makeService({
      rows: [monthRow({ invoiced_at: new Date('2026-09-02T09:00:00Z') })],
    })
    const items = await service.exportCollections(WORKSPACE, ['2026-07', '2026-08'], { canReadFinance: true })
    expect(items.map(item => item.periodMonth)).toEqual(['2026-07-01', '2026-08-01'])
    // Une requête `FROM missions m` par mois demandé — jamais une fenêtre
    // recalculée séparément côté serveur.
    expect(queries.filter(q => q.sql.includes('FROM missions m'))).toHaveLength(2)
  })

  it('exclut les mois qui ne sont PAS encore facturés — même critère que l’écran', async () => {
    // Défaut de `monthRow()` : `invoiced_at: null`, donc `state !== 'invoiced'`.
    const { service } = makeService({ rows: [monthRow()] })
    const items = await service.exportCollections(WORKSPACE, ['2026-08'], { canReadFinance: true })
    expect(items).toHaveLength(0)
  })
})
