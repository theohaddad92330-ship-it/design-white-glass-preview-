import { BLOCKER_ACTIONS, type InvoiceReadiness } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import {
  MISSION_CHAIN_STEPS,
  deriveMissionChain,
  missingChainSteps,
  type MissionChainInput,
  type MissionChainLink,
} from './missionChain'

/**
 * LA CHAÎNE DE LA SIGNATURE AU CASH — #2199.
 *
 * Ce qui se vérifie ici est la RÈGLE, jamais le semis : les cinq étapes sont
 * toujours rendues, un blocage est NOMMÉ, et une étape non mesurée dit qu'elle
 * ne l'est pas — jamais « 0 », jamais « fait ».
 */

const NOW = new Date('2026-09-16T12:00:00.000Z')

function readiness(overrides: Partial<InvoiceReadiness> = {}): InvoiceReadiness {
  return {
    missionId: '11111111-1111-4111-8111-111111111111',
    missionLabel: 'Migration du socle applicatif',
    accountName: 'Cliente Industrie',
    accountId: '22222222-2222-4222-8222-222222222222',
    periodMonth: '2026-08-01',
    state: 'blocked',
    blockers: [],
    days: null,
    preparedAmountCents: null,
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
    ...overrides,
  }
}

function input(overrides: Partial<MissionChainInput> = {}): MissionChainInput {
  return {
    mission: { renewal: 'far' },
    readiness: readiness(),
    readinessKnown: true,
    consultantId: '33333333-3333-4333-8333-333333333333',
    now: NOW,
    ...overrides,
  }
}

function stepOf(links: readonly MissionChainLink[], step: (typeof MISSION_CHAIN_STEPS)[number]): MissionChainLink {
  const found = links.find(item => item.step === step)
  if (!found) throw new Error(`La chaîne ne rend pas l’étape « ${step} ».`)
  return found
}

describe('la chaîne d’une mission', () => {
  it('rend TOUJOURS les cinq étapes, dans l’ordre', () => {
    // Une chaîne à quatre maillons se lit « il n'y a que quatre étapes », et
    // l'étape absente est justement celle dont personne ne s'occupe.
    expect(deriveMissionChain(input()).map(item => item.step)).toEqual([...MISSION_CHAIN_STEPS])
  })

  it('les rend même quand RIEN n’est mesurable — cinq maillons, cinq raisons', () => {
    const links = deriveMissionChain(input({ readiness: undefined, readinessKnown: false, mission: {} }))
    expect(missingChainSteps(links)).toEqual([])
    for (const item of links) {
      expect(item.state).toBe('not_measured')
      // « Non mesuré » répond à « combien ? », pas à « pourquoi je ne sais
      // pas ? » — et c'est la seconde qui dit s'il y a un geste à faire.
      expect(item.reasonKey).not.toBeNull()
    }
  })

  /* ---------------------------------------------------------------------- */
  /*  CRA                                                                    */
  /* ---------------------------------------------------------------------- */

  it('le CRA validé est FAIT, et mène aux relevés', () => {
    const link = stepOf(deriveMissionChain(input({ readiness: readiness({ blockers: [] }) })), 'timesheet')
    expect(link.state).toBe('done')
    expect(link.route).toBe('/missions/cra')
  })

  it('un blocage porte SON GESTE, lu dans la table qui le déclare', () => {
    // #2199.13, .14 — « relancer le client » n'est pas « redéposer le relevé » :
    // le geste dit quoi faire, et accessoirement de quelle main.
    const links = deriveMissionChain(input({ readiness: readiness({ blockers: ['timesheet_not_validated'] }) }))
    expect(stepOf(links, 'timesheet').actionKey).toBe(BLOCKER_ACTIONS['timesheet_not_validated'].action)
    // …et une étape que rien ne bloque n'invente aucun geste.
    expect(stepOf(links, 'reposition').actionKey).toBeNull()
  })

  it('un CRA bloqué NOMME son motif — jamais un compte', () => {
    const link = stepOf(
      deriveMissionChain(input({ readiness: readiness({ blockers: ['timesheet_not_validated', 'missing_po'] }) })),
      'timesheet',
    )
    expect(link.state).toBe('blocked')
    expect(link.blocker).toBe('timesheet_not_validated')
  })

  it('un mois NON DÛ n’a pas de relevé, et ce n’est pas un blocage', () => {
    const link = stepOf(deriveMissionChain(input({ readiness: readiness({ state: 'not_due' }) })), 'timesheet')
    expect(link.state).toBe('not_applicable')
    expect(link.reasonKey).toBe('notMonthly')
  })

  /* ---------------------------------------------------------------------- */
  /*  CA facturable                                                          */
  /* ---------------------------------------------------------------------- */

  it('le CA facturable ne REDIT pas le motif de l’étape précédente', () => {
    // Le même motif sous deux libellés ferait chercher deux réparations pour
    // une seule cause (loi 4 du tome 7).
    const links = deriveMissionChain(input({ readiness: readiness({ blockers: ['missing_timesheet'] }) }))
    expect(stepOf(links, 'timesheet').blocker).toBe('missing_timesheet')
    const billable = stepOf(links, 'billable')
    expect(billable.state).toBe('pending')
    expect(billable.blocker).toBeNull()
    expect(billable.reasonKey).toBe('waitingOnTimesheet')
  })

  it('un bloqueur qui lui est PROPRE est nommé sur son étape', () => {
    const links = deriveMissionChain(input({ readiness: readiness({ blockers: ['missing_timesheet', 'missing_po'] }) }))
    expect(stepOf(links, 'billable').blocker).toBe('missing_po')
    expect(stepOf(links, 'billable').state).toBe('blocked')
  })

  it('« prêt à facturer » est une étape FRANCHIE', () => {
    const links = deriveMissionChain(input({ readiness: readiness({ state: 'ready', blockers: [] }) }))
    expect(stepOf(links, 'billable').state).toBe('done')
    // …et la facture, elle, n'est pas encore partie.
    expect(stepOf(links, 'invoice').state).toBe('pending')
    expect(stepOf(links, 'invoice').reasonKey).toBe('readyToInvoice')
  })

  /* ---------------------------------------------------------------------- */
  /*  Facture préparée et encaissement                                       */
  /* ---------------------------------------------------------------------- */

  it('une facture consignée est FAITE, et l’encaissement attend', () => {
    const links = deriveMissionChain(
      input({
        readiness: readiness({
          state: 'invoiced',
          blockers: [],
          invoicedAt: '2026-09-10T00:00:00.000Z',
          dueOn: '2026-10-10',
        }),
      }),
    )
    expect(stepOf(links, 'invoice').state).toBe('done')
    expect(stepOf(links, 'collection').state).toBe('pending')
    expect(stepOf(links, 'collection').route).toBe('/missions/encaissements')
  })

  it('un paiement enregistré ferme l’encaissement', () => {
    const links = deriveMissionChain(
      input({
        readiness: readiness({
          state: 'invoiced',
          blockers: [],
          invoicedAt: '2026-08-10T00:00:00.000Z',
          paidAt: '2026-09-02T00:00:00.000Z',
          dueOn: '2026-09-10',
        }),
      }),
    )
    expect(stepOf(links, 'collection').state).toBe('done')
  })

  it('une facture ÉCHUE et impayée bloque, et le dit', () => {
    const links = deriveMissionChain(
      input({
        readiness: readiness({
          state: 'invoiced',
          blockers: [],
          invoicedAt: '2026-07-10T00:00:00.000Z',
          dueOn: '2026-08-10',
        }),
      }),
    )
    expect(stepOf(links, 'collection').state).toBe('blocked')
    expect(stepOf(links, 'collection').reasonKey).toBe('overdue')
    // ⚠️ Un retard de paiement n'est PAS un `InvoiceBlocker` : lui en fabriquer
    // un ferait entrer une valeur que la base ne connaît pas.
    expect(stepOf(links, 'collection').blocker).toBeNull()
  })

  it('« pas encore facturé » n’est pas « non mesuré »', () => {
    const links = deriveMissionChain(input({ readiness: readiness({ state: 'blocked', blockers: ['missing_rate'] }) }))
    expect(stepOf(links, 'collection').state).toBe('pending')
    expect(stepOf(links, 'collection').reasonKey).toBe('notInvoicedYet')
  })

  /* ---------------------------------------------------------------------- */
  /*  Repositionnement                                                       */
  /* ---------------------------------------------------------------------- */

  it('le repositionnement s’ouvre quand la fenêtre de renouvellement s’ouvre', () => {
    const link = stepOf(deriveMissionChain(input({ mission: { renewal: 'j30' } })), 'reposition')
    expect(link.state).toBe('pending')
    expect(link.reasonKey).toBe('window.j30')
    expect(link.route).toBe('/consultants/$id/reverse-market')
    expect(link.params).toEqual({ id: '33333333-3333-4333-8333-333333333333' })
  })

  it('loin de la fin, la question ne se pose pas — et ce n’est pas « non mesuré »', () => {
    expect(stepOf(deriveMissionChain(input({ mission: { renewal: 'far' } })), 'reposition').state).toBe(
      'not_applicable',
    )
  })

  it('sans date de fin, il dit qu’il ne sait pas — jamais « trop tôt »', () => {
    const link = stepOf(deriveMissionChain(input({ mission: { renewal: 'unknown' } })), 'reposition')
    expect(link.state).toBe('not_measured')
    expect(link.reasonKey).toBe('noEndDate')
  })

  it('il ne se conclut JAMAIS « fait » — aucune donnée ne dit qu’un consultant a été repositionné', () => {
    const windows = ['far', 'j60', 'j45', 'j30', 'j15', 'imminent', 'overdue', 'unknown'] as const
    for (const renewal of windows) {
      expect(stepOf(deriveMissionChain(input({ mission: { renewal } })), 'reposition').state).not.toBe('done')
    }
  })

  it('sans identité de consultant, il n’ouvre AUCUNE porte', () => {
    // On n'ouvre pas la fiche d'un homonyme deviné — même règle que
    // `assigneesOf`, qui rend `id: null` plutôt qu'un identifiant inventé.
    const link = stepOf(deriveMissionChain(input({ mission: { renewal: 'j15' }, consultantId: null })), 'reposition')
    expect(link.route).toBeNull()
    expect(link.params).toEqual({})
    // …mais l'étape reste VISIBLE et garde son état : c'est la porte qui
    // manque, pas la position.
    expect(link.state).toBe('pending')
  })

  /* ---------------------------------------------------------------------- */
  /*  Ce qu'on n'affiche jamais                                              */
  /* ---------------------------------------------------------------------- */

  it('aucun maillon ne porte de nombre — ni compte, ni taux', () => {
    const links = deriveMissionChain(input({ readiness: readiness({ blockers: ['missing_po', 'missing_rate'] }) }))
    for (const item of links) {
      for (const value of Object.values(item)) {
        expect(typeof value).not.toBe('number')
      }
    }
  })
})
