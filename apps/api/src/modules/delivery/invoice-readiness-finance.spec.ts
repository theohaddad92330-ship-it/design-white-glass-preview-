import { ForbiddenException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { REDACTED_FINANCE_FIELDS } from '@bellum/contracts'
import { REQUIRE_PERMISSION_KEY } from '../workspace/require-permission.decorator'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { InvoiceReadinessController } from './invoice-readiness.controller'
import { InvoiceReadinessService } from './invoice-readiness.service'

/**
 * Le droit financier sur « prêt à facturer » (D45).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI A ÉTÉ MESURÉ AVANT D'ÉCRIRE CE TEST
 * ─────────────────────────────────────────────────────────────────────────────
 * `GET /delivery/invoice-readiness` portait `@UseGuards(JwtGuard,
 * WorkspacePermissionGuard)` et AUCUN `@RequirePermission`. Or le guard se
 * déclare lui-même no-op sans permission déclarée (« No permission declared →
 * this guard is a no-op ») : tout membre authentifié passait, `viewer` et
 * `recruiter` compris. Le service rendait `preparedAmountCents`,
 * `invoicedAmountCents` et `paidAmountCents` BRUTS, et le résumé du mois avec —
 * pendant que les mêmes montants sont gardés par `finance:read` sur
 * `/delivery/finance/revenue` et `/delivery/finance/propagation`.
 *
 * L'export CSV sortait le même montant sans rien demander non plus : c'est lui
 * la vraie fuite, parce qu'il ne passe par aucun écran.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI EST CHOISI, ET POURQUOI
 * ─────────────────────────────────────────────────────────────────────────────
 * On RÉDIGE, on ne refuse pas la lecture — la raison est déjà écrite dans ce
 * dépôt, sur exactement le même cas (`delivery.controller.ts`, `GET
 * /delivery/missions`) : « la LISTE est légitime pour tout le monde : c'est le
 * champ financier qui se garde, pas la lecture ». Les bloqueurs (« relevé
 * manquant », « pas de bon de commande ») sont le geste d'un gestionnaire de
 * delivery, pas d'un comptable.
 *
 * L'EXPORT, lui, est refusé : son objet est le montant. Un CSV dont la colonne
 * « Montant préparatoire » serait vide part quand même chez un comptable et se
 * lit comme un fichier complet.
 */

const WORKSPACE = 'w0000000-0000-4000-8000-000000000001'
const USER_ID = 'u0000000-0000-4000-8000-000000000001'
const USER = { userId: USER_ID } as never

function monthRow(over: Record<string, unknown> = {}) {
  return {
    mission_id: 'm0000000-0000-4000-8000-000000000001',
    mission_label: 'Renfort plateforme',
    account_name: 'ACME',
    daily_rate: '650',
    // Coût chargé PRÉSENT par défaut : ce fichier teste la RÉDACTION
    // financière, pas le bloqueur `missing_cost` — un défaut `null` ferait
    // porter le mois « bloqué » et fausserait `preparedAmountCents`.
    loaded_daily_cost_cents: '30000',
    // Même raison que le coût chargé : la vraie requête sélectionne
    // `m.started_on`, et l'omettre ferait porter `missing_start_date` à un
    // mois que ce fichier veut « prêt ».
    started_on: '2026-01-01',
    requires_po: false,
    po_number: null,
    ts_status: 'validated',
    ts_days: '18',
    ts_anomalies: [],
    invoiced_at: null,
    invoiced_amount_cents: null,
    paid_at: null,
    paid_amount_cents: null,
    reminders_sent: 0,
    last_reminder_at: null,
    disputed_at: null,
    dispute_reason: null,
    dispute_resolved_at: null,
    ...over,
  }
}

function makeService(rows: unknown[] = [monthRow()]) {
  const manager = {
    query: jest.fn(async (sql: string) => {
      if (sql.includes('FROM missions WHERE id')) return [{ id: 'm1' }]
      if (sql.includes('FROM missions m')) return rows
      return []
    }),
  }
  return new InvoiceReadinessService({ manager } as never)
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Le service                                                                 */
/* ═══════════════════════════════════════════════════════════════════════════ */

describe('« prêt à facturer » — les montants suivent le droit financier', () => {
  const NOW = new Date('2026-09-05T09:00:00Z')

  it('SANS le droit : les trois montants de la ligne valent `null`, et la CLÉ reste présente', async () => {
    // « Présent mais vide » se lit comme une case qu'on n'a pas le droit de
    // voir ; une clé retirée est indiscernable d'un champ qui n'existe pas.
    const service = makeService([monthRow({ invoiced_amount_cents: '840000', paid_amount_cents: '840000' })])

    const result = await service.list(WORKSPACE, { blockedOnly: false }, { canReadFinance: false }, NOW)

    const line = result.items[0] as unknown as Record<string, unknown>
    expect(line['preparedAmountCents']).toBeNull()
    expect(line['invoicedAmountCents']).toBeNull()
    expect(line['paidAmountCents']).toBeNull()
    for (const key of ['preparedAmountCents', 'invoicedAmountCents', 'paidAmountCents']) {
      expect(key in line).toBe(true)
    }
  })

  it('SANS le droit : jamais `0` — un zéro se lirait comme un montant réel', async () => {
    // GA-18 / GA-19. C'est la moitié de la règle que « rédiger » rate le plus
    // souvent : vider en mettant à zéro.
    const service = makeService([monthRow({ invoiced_amount_cents: '840000', paid_amount_cents: '840000' })])

    const result = await service.list(WORKSPACE, { blockedOnly: false }, { canReadFinance: false }, NOW)

    expect(result.items[0]?.preparedAmountCents).not.toBe(0)
    expect(result.summary.preparedAmountCents).not.toBe(0)
    expect(result.summary.blockedAmountCents).not.toBe(0)
    expect(result.summary.preparedAmountCents).toBeNull()
    expect(result.summary.blockedAmountCents).toBeNull()
  })

  it('AVEC le droit : les montants réels sortent, inchangés', async () => {
    const service = makeService([monthRow({ invoiced_amount_cents: '840000', paid_amount_cents: '840000' })])

    const result = await service.list(WORKSPACE, { blockedOnly: false }, { canReadFinance: true }, NOW)

    expect(result.items[0]?.preparedAmountCents).toBe(18 * 65_000)
    expect(result.items[0]?.invoicedAmountCents).toBe(840_000)
    expect(result.items[0]?.paidAmountCents).toBe(840_000)
    expect(result.summary.preparedAmountCents).toBe(18 * 65_000)
  })

  it('ce qui n’est PAS un montant traverse la rédaction intact', async () => {
    // Une rédaction qui viderait les bloqueurs retirerait à l'écran sa seule
    // raison d'exister pour un gestionnaire de delivery.
    const service = makeService([monthRow({ ts_status: null, ts_days: null })])

    const result = await service.list(WORKSPACE, { blockedOnly: false }, { canReadFinance: false }, NOW)

    expect(result.items[0]?.blockers).toContain('missing_timesheet')
    expect(result.items[0]?.state).toBe('blocked')
    expect(result.items[0]?.missionLabel).toBe('Renfort plateforme')
    // Les COMPTEURS ne sont pas des montants : ils restent lisibles.
    expect(result.summary.blocked).toBe(1)
  })

  it('le DROIT voyage avec la réponse — sinon « pas le droit » et « pas mesuré » sont le même `null`', async () => {
    const service = makeService()

    const sans = await service.list(WORKSPACE, { blockedOnly: false }, { canReadFinance: false }, NOW)
    const avec = await service.list(WORKSPACE, { blockedOnly: false }, { canReadFinance: true }, NOW)

    expect(sans.canReadFinance).toBe(false)
    expect(avec.canReadFinance).toBe(true)
  })

  it('les champs rédigés sont ceux du CONTRAT — pas une liste recopiée à la main', () => {
    // La garde d'architecture construit sa regex sur cette liste : un champ
    // ajouté au service sans y être versé ne serait surveillé par personne.
    for (const field of ['preparedAmountCents', 'invoicedAmountCents', 'paidAmountCents', 'blockedAmountCents']) {
      expect(REDACTED_FINANCE_FIELDS).toContain(field)
    }
  })
})

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Le contrôleur                                                              */
/* ═══════════════════════════════════════════════════════════════════════════ */

function buildController(options: { role?: string; extra?: string[] } = {}) {
  const list = jest.fn().mockResolvedValue({ items: [], summary: {}, month: '2026-08', canReadFinance: false })
  const workspaceContext = {
    resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: WORKSPACE, role: options.role ?? 'viewer' }),
    extraPermissionsOf: jest.fn().mockResolvedValue(options.extra ?? []),
  } as never
  const controller = new InvoiceReadinessController({ list } as never, workspaceContext)
  return { controller, list }
}

describe('« prêt à facturer » — le contrôleur DÉCIDE du droit et le passe', () => {
  it('un `viewer` est servi SANS le droit financier', async () => {
    const { controller, list } = buildController({ role: 'viewer' })

    await controller.list(USER, { blockedOnly: false } as never)

    expect(list.mock.calls[0]?.[2]).toEqual({ canReadFinance: false })
  })

  it('un `recruiter` non plus — c’est le rôle qui ouvrait la fuite', async () => {
    const { controller, list } = buildController({ role: 'recruiter' })

    await controller.list(USER, { blockedOnly: false } as never)

    expect(list.mock.calls[0]?.[2]).toEqual({ canReadFinance: false })
  })

  it('un `owner` reçoit le droit', async () => {
    const { controller, list } = buildController({ role: 'owner' })

    await controller.list(USER, { blockedOnly: false } as never)

    expect(list.mock.calls[0]?.[2]).toEqual({ canReadFinance: true })
  })

  it('une permission accordée MEMBRE PAR MEMBRE ouvre le droit', async () => {
    // `extraPermissionsOf` et non `can(role, [], …)` : les permissions
    // additives ignorées sont une cause racine nommée de ce dépôt.
    const { controller, list } = buildController({ role: 'sales', extra: ['finance:read'] })

    await controller.list(USER, { blockedOnly: false } as never)

    expect(list.mock.calls[0]?.[2]).toEqual({ canReadFinance: true })
  })
})

/**
 * L'export est refusé par le GARDE, pas par une exception écrite dans la
 * méthode : c'est le mécanisme déclaratif du dépôt, et les huit autres routes de
 * ce contrôleur l'emploient déjà. Ce qui se joue ici est donc le VRAI
 * `WorkspacePermissionGuard` sur les VRAIES métadonnées de la route — un test
 * qui appellerait la méthode en direct ne prouverait rien, puisque c'est
 * précisément le garde qui refuse.
 */
function guardOver(handler: unknown, options: { role: string; extra?: string[] }) {
  const workspaceContext = {
    resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: WORKSPACE, role: options.role }),
    extraPermissionsOf: jest.fn().mockResolvedValue(options.extra ?? []),
    // #2081.14 — l'export CSV est une SORTIE de données (`@DataExit()`) : le
    // guard lit aussi la règle d'espace. Aucune règle posée ici.
    workspaceRuleRefusing: jest.fn().mockResolvedValue(null),
    // #2879 — la sortie autorisée laisse sa ligne de compteur (`data_export`).
    recordDataExit: jest.fn(),
  } as never
  const guard = new WorkspacePermissionGuard(new Reflector(), workspaceContext)
  const context = {
    getHandler: () => handler,
    getClass: () => InvoiceReadinessController,
    switchToHttp: () => ({ getRequest: () => ({ user: { userId: USER_ID } }) }),
  } as never
  return guard.canActivate(context)
}

describe('« prêt à facturer » — la file des RELANCES suit le même droit', () => {
  it('la route des relances passe le droit du lecteur, et le rend avec la réponse', async () => {
    // Trouvé par le COMPILATEUR, pas par un test : `dueReminders` appelait
    // `list` en lui passant la date à la place des options. Chaque entrée porte
    // l'`item` ENTIER — donc les montants — et cette route n'a, elle non plus,
    // aucune permission déclarée. C'était la même fuite, une porte plus loin.
    const dueReminders = jest.fn().mockResolvedValue([])
    const workspaceContext = {
      resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: WORKSPACE, role: 'recruiter' }),
      extraPermissionsOf: jest.fn().mockResolvedValue([]),
    } as never
    const controller = new InvoiceReadinessController({ dueReminders } as never, workspaceContext)

    const out = await controller.reminders(USER, '2026-08')

    expect(dueReminders).toHaveBeenCalledWith(WORKSPACE, { month: '2026-08', canReadFinance: false })
    expect(out.canReadFinance).toBe(false)
  })
})

describe('« prêt à facturer » — l’EXPORT est refusé, pas rédigé', () => {
  const res = () => ({ setHeader: jest.fn() }) as never

  it('la route d’export DÉCLARE bien une permission — sinon le garde est un no-op', () => {
    // Le cœur du défaut : le garde se déclare lui-même « no-op » quand aucune
    // permission n'est déclarée. Une route sans métadonnée passait donc pour
    // gardée alors qu'elle était ouverte.
    const declared = new Reflector().get(REQUIRE_PERMISSION_KEY, InvoiceReadinessController.prototype.exportCsv)
    expect(declared).toBeDefined()
    expect(declared).toContain('finance:read')
  })

  it('un `viewer` ne peut pas exporter — l’objet du fichier EST le montant', async () => {
    await expect(guardOver(InvoiceReadinessController.prototype.exportCsv, { role: 'viewer' })).rejects.toBeInstanceOf(
      ForbiddenException,
    )
  })

  it('un `recruiter` non plus', async () => {
    await expect(
      guardOver(InvoiceReadinessController.prototype.exportCsv, { role: 'recruiter' }),
    ).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('un `owner` passe le garde', async () => {
    await expect(guardOver(InvoiceReadinessController.prototype.exportCsv, { role: 'owner' })).resolves.toBe(true)
  })

  it('la LECTURE de l’écran, elle, n’est refusée à personne — seuls les montants se vident', async () => {
    // L'asymétrie assumée : refuser l'écran retirerait les bloqueurs à ceux
    // dont c'est le métier d'aller les lever.
    await expect(guardOver(InvoiceReadinessController.prototype.list, { role: 'viewer' })).resolves.toBe(true)
  })

  it('un `owner` exporte, et le CSV porte bien les montants', async () => {
    const { controller, list } = buildController({ role: 'owner' })
    list.mockResolvedValue({
      items: [
        {
          missionId: 'm1',
          missionLabel: 'Renfort plateforme',
          accountName: 'ACME',
          periodMonth: '2026-08-01',
          state: 'ready',
          blockers: [],
          days: 18,
          preparedAmountCents: 1_170_000,
          invoicedAt: null,
          invoiceReference: null,
          invoicedAmountCents: null,
          dueOn: null,
          remindersSent: 0,
          lastReminderAt: null,
          paidAt: null,
          paidAmountCents: null,
          disputedAt: null,
          disputeReason: null,
          disputeResolvedAt: null,
        },
      ],
      summary: {},
      month: '2026-08',
      canReadFinance: true,
    })

    const csv = await controller.exportCsv(USER, { blockedOnly: false } as never, res())

    expect(csv).toContain('11700,00')
    expect(list.mock.calls[0]?.[2]).toEqual({ canReadFinance: true })
  })
})
