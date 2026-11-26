import { DeliveryRoutinesService } from './delivery-routines.service'
import type { InvoiceReadinessService } from './invoice-readiness.service'
import { RevenueService } from './revenue.service'
import type { TimesheetsService } from './timesheets.service'

/**
 * UNE LECTURE QUI A ÉCHOUÉ N'EST PAS « RIEN À SIGNALER ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT MESURÉ — PDF 5 §12, garde-fous de `FIN-02`, `FIN-06` et `FIN-10`
 * ─────────────────────────────────────────────────────────────────────────────
 * Les trois routines du PDF 5 tournent pour de vrai : `RoutinesScheduler` les
 * balaie toutes les quinze minutes, et `ScheduleModule.forRoot()` est monté
 * (`outbox.module.ts`). Elles ne sont donc pas du code que personne n'appelle —
 * elles écrivent une trace, tous les jours, dans l'écran Réglages › Routines.
 *
 * Ce qu'elles écrivaient quand leur lecture ÉCHOUAIT :
 *
 *  - « Aucun relevé manquant sur le mois clos. »
 *  - « Rien ne bloque la facturation du mois clos. »
 *  - « Aucun seuil de marge réglé pour cet espace. »
 *
 * Les trois sont FAUSSES, et la troisième est la pire : elle n'annonce pas
 * seulement une absence de problème, elle en donne une CAUSE — « personne n'a
 * réglé de seuil » — qui accuse l'opérateur d'un oubli qu'il n'a pas commis.
 * C'est la cause racine que ce dépôt nomme « cassé et non mesurable se
 * ressemblent », doublée de « un verdict ne se conclut pas d'un silence ».
 *
 * La correction tient en une règle : le compteur vaut `null` quand on n'a pas
 * su compter, jamais `0`. `0` est une mesure VRAIE, et elle se lit comme une
 * bonne nouvelle.
 */

type Managed = { manager: { query: (sql: string, params?: unknown[]) => Promise<unknown[]> } }

/** Un service de relevés qui répond, ou qui casse. */
function timesheets(options: { fail?: boolean; labels?: string[] } = {}): TimesheetsService {
  return {
    month: async () => {
      if (options.fail) throw new Error('relevés illisibles')
      return { items: (options.labels ?? []).map(missionLabel => ({ missionLabel })) }
    },
  } as unknown as TimesheetsService
}

/** Un service de facturabilité qui répond, ou qui casse. */
function readiness(
  options: { fail?: boolean; blocked?: number; amount?: number | null; first?: string | null } = {},
): InvoiceReadinessService {
  return {
    list: async () => {
      if (options.fail) throw new Error('facturabilité illisible')
      return {
        items: options.first ? [{ missionLabel: options.first }] : [],
        summary: { blocked: options.blocked ?? 0, blockedAmountCents: options.amount ?? null },
      }
    },
  } as unknown as InvoiceReadinessService
}

/**
 * Un `RevenueService` RÉEL posé sur un faux Postgres.
 *
 * Volontairement réel : le drapeau `measured` que la routine lit est produit
 * par le `catch` de `marginAlerts`, et un double le fabriquerait au lieu de le
 * mesurer — c'est exactement le « mock qui jette les arguments » que ce dépôt
 * a déjà payé.
 */
function revenueOver(options: { fail?: boolean; threshold?: number | null; rows?: unknown[] } = {}): RevenueService {
  const manager = {
    query: async (sql: string) => {
      if (options.fail) throw new Error('marges illisibles')
      if (sql.includes('margin_alert_threshold_percent')) {
        return [{ margin_alert_threshold_percent: options.threshold ?? null }]
      }
      return options.rows ?? []
    },
  }
  return new RevenueService({ manager } as Managed as never)
}

function build(parts: {
  timesheets?: TimesheetsService
  readiness?: InvoiceReadinessService
  revenue?: RevenueService
}): DeliveryRoutinesService {
  return new DeliveryRoutinesService(
    parts.timesheets ?? timesheets(),
    parts.readiness ?? readiness(),
    parts.revenue ?? revenueOver(),
  )
}

const NOW = new Date('2026-02-10T09:00:00.000Z')

describe('les trois routines du PDF 5 distinguent « rien » de « je n’ai pas pu lire »', () => {
  describe('relevés manquants (FIN-02, garde-fou « arrêt sur réception »)', () => {
    it('compte ce qu’elle a lu — et la mesure SAIT bouger', async () => {
      const none = await build({ timesheets: timesheets({ labels: [] }) }).missingTimesheets('w1', NOW)
      expect(none.count).toBe(0)

      const two = await build({ timesheets: timesheets({ labels: ['Mission A', 'Mission B'] }) }).missingTimesheets(
        'w1',
        NOW,
      )
      expect(two.count).toBe(2)
      expect(two.first).toBe('Mission A')
    })

    it('rend `null` quand la lecture casse — jamais `0`', async () => {
      const result = await build({ timesheets: timesheets({ fail: true }) }).missingTimesheets('w1', NOW)
      expect(result.count).toBeNull()
      expect(result.count).not.toBe(0)
      expect(result.first).toBeNull()
    })
  })

  describe('facturation bloquée (FIN-06, garde-fou « jamais d’émission »)', () => {
    it('rend le compte ET le montant quand elle a su lire', async () => {
      const result = await build({
        readiness: readiness({ blocked: 3, amount: 450_000, first: 'Mission C' }),
      }).blockedInvoicing('w1', NOW)
      expect(result.count).toBe(3)
      expect(result.blockedAmountCents).toBe(450_000)
    })

    it('un montant illisible reste `null` alors que le compte, lui, est vrai', async () => {
      const result = await build({
        readiness: readiness({ blocked: 2, amount: null, first: 'Mission C' }),
      }).blockedInvoicing('w1', NOW)
      expect(result.count).toBe(2)
      expect(result.blockedAmountCents).toBeNull()
    })

    it('rend `null` quand la lecture casse — jamais `0`', async () => {
      const result = await build({ readiness: readiness({ fail: true }) }).blockedInvoicing('w1', NOW)
      expect(result.count).toBeNull()
      expect(result.count).not.toBe(0)
      expect(result.blockedAmountCents).toBeNull()
    })
  })

  describe('marges sous le seuil (FIN-10, garde-fou « jamais si coût absent »)', () => {
    it('aucun seuil réglé : le compte vaut ZÉRO, parce qu’on a su lire', async () => {
      const result = await build({ revenue: revenueOver({ threshold: null }) }).marginsBelowThreshold('w1')
      expect(result.threshold).toBeNull()
      expect(result.count).toBe(0)
    })

    it('un seuil réglé et une mission dessous : elle la compte et la NOMME', async () => {
      const result = await build({
        revenue: revenueOver({
          threshold: 25,
          rows: [{ id: 'm1', label: 'Mission D', daily_rate: '500', loaded_daily_cost_cents: '45000' }],
        }),
      }).marginsBelowThreshold('w1')
      expect(result.threshold).toBe(25)
      expect(result.count).toBe(1)
      expect(result.first).toBe('Mission D')
    })

    it('lecture cassée : le compte vaut `null`, et le seuil ne se déduit PAS d’un silence', async () => {
      const result = await build({ revenue: revenueOver({ fail: true }) }).marginsBelowThreshold('w1')
      expect(result.count).toBeNull()
      expect(result.count).not.toBe(0)
      expect(result.threshold).toBeNull()
    })
  })
})
