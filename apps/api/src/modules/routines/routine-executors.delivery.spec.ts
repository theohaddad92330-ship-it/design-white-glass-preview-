import { RoutineExecutors } from './routine-executors'
import type { DeliveryRoutinesService } from '../delivery/delivery-routines.service'

/**
 * CE QUE LES TROIS ROUTINES DU PDF 5 ÉCRIVENT DANS LEUR TRACE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE PHRASE COMPTE AUTANT QUE LA NOTIFICATION
 * ─────────────────────────────────────────────────────────────────────────────
 * Une routine qui n'a rien trouvé ne notifie personne — c'est la bonne règle,
 * et elle ne bouge pas ici. Mais elle écrit quand même une trace, et cette
 * trace est ce que l'écran Réglages › Routines affiche sous « dernière
 * exécution ». C'est la SEULE surface où l'on peut distinguer « il n'y avait
 * rien à dire » de « ça n'a pas tourné » — le document le dit lui-même
 * (attribut 10 du PDF 6 : « ce qu'elle fait quand elle ne peut PAS faire ce
 * qui est prévu. Jamais “rien” »).
 *
 * Trois phrases mentaient quand la lecture échouait. La troisième donnait
 * même une cause fausse : « aucun seuil de marge réglé » accuse l'opérateur
 * d'un oubli alors que la requête vient de casser.
 */

/** Un exécuteur avec la SEULE dépendance que ces trois routines empruntent. */
function executorOver(delivery: Partial<DeliveryRoutinesService>): RoutineExecutors {
  return new RoutineExecutors(
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
    delivery as DeliveryRoutinesService,
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
  )
}

const NOW = new Date('2026-02-10T09:00:00.000Z')
const WS = 'w1'

describe('les traces des routines du PDF 5 ne confondent pas « rien » et « illisible »', () => {
  describe('relevés manquants', () => {
    it('rien à dire : elle se tait, et le DIT comme un fait mesuré', async () => {
      const outcome = await executorOver({
        missingTimesheets: async () => ({ count: 0, first: null, triggerEvent: null }),
      }).run('timesheet_chase', 'u1', NOW, WS)
      expect(outcome.notified).toBe(false)
      expect(outcome.outcome).toBe('Aucun relevé manquant sur le mois clos.')
    })

    it('lecture cassée : elle NE dit PAS « aucun relevé manquant »', async () => {
      const outcome = await executorOver({
        missingTimesheets: async () => ({ count: null, first: null, triggerEvent: null }),
      }).run('timesheet_chase', 'u1', NOW, WS)
      expect(outcome.notified).toBe(false)
      expect(outcome.outcome).not.toContain('Aucun relevé manquant')
      expect(outcome.outcome).toContain('pas pu')
    })

    it('des relevés manquent : elle notifie et nomme le premier', async () => {
      const outcome = await executorOver({
        missingTimesheets: async () => ({ count: 2, first: 'Mission A', triggerEvent: null }),
      }).run('timesheet_chase', 'u1', NOW, WS)
      expect(outcome.notified).toBe(true)
      expect(outcome.notification?.body).toContain('Mission A')
    })
  })

  describe('facturation bloquée', () => {
    it('rien à dire : elle se tait sur un fait mesuré', async () => {
      const outcome = await executorOver({
        blockedInvoicing: async () => ({ count: 0, blockedAmountCents: null, first: null, triggerEvent: null }),
      }).run('invoice_readiness', 'u1', NOW, WS)
      expect(outcome.notified).toBe(false)
      expect(outcome.outcome).toBe('Rien ne bloque la facturation du mois clos.')
    })

    it('lecture cassée : elle NE dit PAS « rien ne bloque »', async () => {
      const outcome = await executorOver({
        blockedInvoicing: async () => ({ count: null, blockedAmountCents: null, first: null, triggerEvent: null }),
      }).run('invoice_readiness', 'u1', NOW, WS)
      expect(outcome.notified).toBe(false)
      expect(outcome.outcome).not.toContain('Rien ne bloque')
      expect(outcome.outcome).toContain('pas pu')
    })

    it('un mois bloqué et un montant lisible : le montant est ANNONCÉ SEUL', async () => {
      const outcome = await executorOver({
        blockedInvoicing: async () => ({
          count: 1,
          blockedAmountCents: 450_000,
          first: 'Mission C',
          triggerEvent: null,
        }),
      }).run('invoice_readiness', 'u1', NOW, WS)
      expect(outcome.notified).toBe(true)
      expect(outcome.outcome).toContain('4500 €')
    })

    it('un mois bloqué et un montant ILLISIBLE : la phrase s’écrit sans « 0 € »', async () => {
      const outcome = await executorOver({
        blockedInvoicing: async () => ({ count: 1, blockedAmountCents: null, first: 'Mission C', triggerEvent: null }),
      }).run('invoice_readiness', 'u1', NOW, WS)
      expect(outcome.notified).toBe(true)
      expect(outcome.outcome).not.toContain('0 €')
    })
  })

  describe('marges sous le seuil', () => {
    it('aucun seuil réglé : elle le dit, parce qu’un silence se lirait comme une panne', async () => {
      const outcome = await executorOver({
        marginsBelowThreshold: async () => ({ threshold: null, count: 0, first: null, triggerEvent: null }),
      }).run('margin_alert', 'u1', NOW, WS)
      expect(outcome.notified).toBe(false)
      expect(outcome.outcome).toBe('Aucun seuil de marge réglé pour cet espace.')
    })

    it('lecture cassée : elle N’ACCUSE PAS l’opérateur de n’avoir rien réglé', async () => {
      const outcome = await executorOver({
        marginsBelowThreshold: async () => ({ threshold: null, count: null, first: null, triggerEvent: null }),
      }).run('margin_alert', 'u1', NOW, WS)
      expect(outcome.notified).toBe(false)
      expect(outcome.outcome).not.toContain('Aucun seuil de marge réglé')
      expect(outcome.outcome).toContain('pas pu')
    })

    it('un seuil réglé, rien dessous : elle rappelle le seuil qu’elle a appliqué', async () => {
      const outcome = await executorOver({
        marginsBelowThreshold: async () => ({ threshold: 25, count: 0, first: null, triggerEvent: null }),
      }).run('margin_alert', 'u1', NOW, WS)
      expect(outcome.notified).toBe(false)
      expect(outcome.outcome).toContain('25 %')
    })

    it('une mission sous le seuil : elle notifie et la nomme', async () => {
      const outcome = await executorOver({
        marginsBelowThreshold: async () => ({ threshold: 25, count: 1, first: 'Mission D', triggerEvent: null }),
      }).run('margin_alert', 'u1', NOW, WS)
      expect(outcome.notified).toBe(true)
      expect(outcome.notification?.body).toContain('Mission D')
    })
  })
})
