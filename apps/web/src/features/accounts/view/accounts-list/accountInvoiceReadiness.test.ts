import { describe, expect, it } from 'vitest'
import { accountInvoiceReadinessOf, buildAccountInvoiceReadinessIndex } from './accountInvoiceReadiness'

/**
 * Manque A du 30/08 — la lentille « prêt à facturer » remontée au COMPTE.
 *
 * `invoiceReadiness` est calculée et exposée PAR MISSION (`assessInvoiceReadiness`,
 * `packages/contracts/src/schemas/invoice-readiness.ts`) — rien n'est recalculé
 * ici (GA-26) : cette fonction se contente d'INDEXER, par compte, ce que le
 * serveur a déjà décidé mission par mission, exactement comme
 * `accountPropagationById` le fait déjà pour les autres agrégats de ce tableau.
 *
 * ⚠️ Depuis le §9 du 30/08, `readinessItems` porte `accountId` DIRECTEMENT —
 * la jointure par `missionId` via `GET /delivery/missions` (plafonné à 200
 * lignes) a disparu. Ces tests groupent donc les lignes par `accountId`, plus
 * par `missionId` + une liste de missions séparée.
 *
 * ⚠️ Un compte SANS mission n'est pas « pas prêt à facturer » — il n'a rien à
 * facturer. `accountIdsWithMission` (dérivé du digest de propagation, seule
 * source non plafonnée) tranche ce cas EN AMONT : un compte absent de cet
 * ensemble reçoit `{ kind: 'none' }`, quoi que porte `readinessItems`.
 */
describe('buildAccountInvoiceReadinessIndex', () => {
  it('un compte hors de `accountIdsWithMission` est absent de l’index — jamais « bloqué » sur la foi des autres données', () => {
    const index = buildAccountInvoiceReadinessIndex(new Set(), [
      { accountId: 'acc-1', state: 'blocked', blockers: ['missing_timesheet'] },
    ])
    expect(index.has('acc-1')).toBe(false)
    expect(accountInvoiceReadinessOf(index, 'acc-1')).toEqual({ kind: 'none' })
  })

  it('accountInvoiceReadinessOf rend « none » par défaut pour un identifiant inconnu de l’index', () => {
    const index = buildAccountInvoiceReadinessIndex(new Set(['acc-1']), [])
    expect(accountInvoiceReadinessOf(index, 'acc-9-inconnu')).toEqual({ kind: 'none' })
  })

  it('un compte AVEC mission mais sans ligne de facturation ce mois est « non mesuré », pas « sans mission »', () => {
    // Le cas réel : la mission existe (le compte est dans `accountIdsWithMission`,
    // source non plafonnée) mais aucune ligne de facturation ne couvre le mois
    // interrogé pour ce compte.
    const index = buildAccountInvoiceReadinessIndex(new Set(['acc-1']), [])
    expect(accountInvoiceReadinessOf(index, 'acc-1')).toEqual({ kind: 'unmeasured' })
  })

  it('une ligne dont `accountId` est `null` (LEFT JOIN, mission sans compte) ne contribue à AUCUN badge — jamais devinée', () => {
    const index = buildAccountInvoiceReadinessIndex(new Set(['acc-1']), [
      { accountId: null, state: 'blocked', blockers: ['missing_po'] },
    ])
    expect(accountInvoiceReadinessOf(index, 'acc-1')).toEqual({ kind: 'unmeasured' })
  })

  it('une mission « blocked » remonte l’état et SES bloqueurs, dans l’ordre de gravité du domaine', () => {
    const index = buildAccountInvoiceReadinessIndex(
      new Set(['acc-1']),
      // Rendus dans le désordre : l'index doit les remettre dans l'ordre
      // `INVOICE_BLOCKERS` (missing_timesheet avant missing_rate).
      [{ accountId: 'acc-1', state: 'blocked', blockers: ['missing_rate', 'missing_timesheet'] }],
    )
    expect(accountInvoiceReadinessOf(index, 'acc-1')).toEqual({
      kind: 'measured',
      state: 'blocked',
      blockers: ['missing_timesheet', 'missing_rate'],
    })
  })

  it('plusieurs missions bloquées : les bloqueurs se cumulent SANS doublon', () => {
    const index = buildAccountInvoiceReadinessIndex(new Set(['acc-1']), [
      { accountId: 'acc-1', state: 'blocked', blockers: ['missing_timesheet'] },
      { accountId: 'acc-1', state: 'blocked', blockers: ['missing_timesheet', 'missing_po'] },
    ])
    expect(accountInvoiceReadinessOf(index, 'acc-1')).toEqual({
      kind: 'measured',
      state: 'blocked',
      blockers: ['missing_timesheet', 'missing_po'],
    })
  })

  it('« bloqué » gagne sur « prêt » — le compte a un geste à faire avant tout autre', () => {
    const index = buildAccountInvoiceReadinessIndex(new Set(['acc-1']), [
      { accountId: 'acc-1', state: 'blocked', blockers: ['missing_po'] },
      { accountId: 'acc-1', state: 'ready', blockers: [] },
    ])
    expect(accountInvoiceReadinessOf(index, 'acc-1').kind).toBe('measured')
    expect((accountInvoiceReadinessOf(index, 'acc-1') as { state: string }).state).toBe('blocked')
  })

  it('sans blocage : « prêt » gagne sur « facturé ailleurs »', () => {
    const index = buildAccountInvoiceReadinessIndex(new Set(['acc-1']), [
      { accountId: 'acc-1', state: 'invoiced', blockers: [] },
      { accountId: 'acc-1', state: 'ready', blockers: [] },
    ])
    expect(accountInvoiceReadinessOf(index, 'acc-1')).toEqual({ kind: 'measured', state: 'ready', blockers: [] })
  })

  it('toutes les missions déjà facturées ailleurs : « invoiced »', () => {
    const index = buildAccountInvoiceReadinessIndex(new Set(['acc-1']), [
      { accountId: 'acc-1', state: 'invoiced', blockers: [] },
    ])
    expect(accountInvoiceReadinessOf(index, 'acc-1')).toEqual({ kind: 'measured', state: 'invoiced', blockers: [] })
  })

  /**
   * #2197.41 — un DÉCLARÉ n'est PAS un PROUVÉ, même sur cet agrégat de compte.
   *
   * C'est le test qui échoue si l'index se met un jour à compter une
   * déclaration humaine comme une preuve de connecteur : un compte dont
   * TOUTES les missions sont `invoiced_declared` doit rester distinct d'un
   * compte `invoiced`, jamais fondu sous le même état.
   */
  it('#2197.41 — toutes les missions DÉCLARÉES facturées (sans preuve) : « invoiced_declared », jamais « invoiced »', () => {
    const index = buildAccountInvoiceReadinessIndex(new Set(['acc-1']), [
      { accountId: 'acc-1', state: 'invoiced_declared', blockers: [] },
    ])
    expect(accountInvoiceReadinessOf(index, 'acc-1')).toEqual({
      kind: 'measured',
      state: 'invoiced_declared',
      blockers: [],
    })
  })

  it('#2197.41 — une mission PROUVÉE et une DÉCLARÉE sur le même compte : le PROUVÉ l’emporte', () => {
    const index = buildAccountInvoiceReadinessIndex(new Set(['acc-1']), [
      { accountId: 'acc-1', state: 'invoiced_declared', blockers: [] },
      { accountId: 'acc-1', state: 'invoiced', blockers: [] },
    ])
    // Une déclaration humaine ne doit jamais faire disparaître, ni concurrencer,
    // une preuve de connecteur déjà posée sur une autre mission du même compte.
    expect(accountInvoiceReadinessOf(index, 'acc-1')).toEqual({ kind: 'measured', state: 'invoiced', blockers: [] })
  })

  it('toutes les missions non dues ce mois (forfait, jalon) : « not_due », jamais « bloqué »', () => {
    const index = buildAccountInvoiceReadinessIndex(new Set(['acc-1']), [
      { accountId: 'acc-1', state: 'not_due', blockers: [] },
    ])
    expect(accountInvoiceReadinessOf(index, 'acc-1')).toEqual({ kind: 'measured', state: 'not_due', blockers: [] })
  })

  it('une mission d’un AUTRE compte ne contamine pas ce compte (jointure par identité, jamais par position)', () => {
    const index = buildAccountInvoiceReadinessIndex(new Set(['acc-1', 'acc-2']), [
      { accountId: 'acc-2', state: 'blocked', blockers: ['missing_po'] },
    ])
    expect(accountInvoiceReadinessOf(index, 'acc-1')).toEqual({ kind: 'unmeasured' })
    expect(accountInvoiceReadinessOf(index, 'acc-2')).toEqual({
      kind: 'measured',
      state: 'blocked',
      blockers: ['missing_po'],
    })
  })
})
