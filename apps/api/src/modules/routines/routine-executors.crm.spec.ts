import { RoutineExecutors } from './routine-executors'
import type { CrmRoutinesService } from './crm-routines.service'

/**
 * CE QUE LES CINQ AUTOMATISATIONS CRM DU §13 ÉCRIVENT DANS LEUR TRACE
 * (D715/GA-196, 30/08/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT
 * ─────────────────────────────────────────────────────────────────────────────
 * `CrmRoutinesService.rows()` attrapait toute erreur SQL et rendait `[]` — la
 * même valeur qu'un vrai zéro. Une routine qui affirme « aucun projet
 * immobile » sur une requête qui vient de casser transforme une panne en
 * rapport rassurant. Même patron, même correctif que les trois routines du
 * PDF 5 (`routine-executors.delivery.spec.ts`) : `measured` voyage jusqu'à la
 * PHRASE que l'écran Réglages › Routines affiche.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI NE DOIT PAS RECULER : LA RÉSILIENCE
 * ─────────────────────────────────────────────────────────────────────────────
 * `parked_account_signal` et `contact_job_change` combinent chacune DEUX
 * lectures. Si une seule casse, ce que l'autre a mesuré doit quand même
 * sortir — une routine qui calcule cinq choses (ou deux) et qui, sur UN échec,
 * fait taire tout le reste, serait un autre défaut.
 */

/** Un exécuteur avec la SEULE dépendance que ces cinq routines empruntent. */
function executorOver(crmRoutines: Partial<CrmRoutinesService>): RoutineExecutors {
  return new RoutineExecutors(
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
    crmRoutines as CrmRoutinesService,
    undefined as never,
    undefined as never,
    undefined as never,
  )
}

const WS = 'ws-1'

const oldest = { label: 'Migration ERP', stage: 'proposal', days: 30 }
const plan = { company_name: 'Client SA', days: 45 }
const need = { title: 'Lead dev React', days: 10 }
const parked = { company_name: 'Compte Écarté SA', gate_reason: 'pas de budget' }
const due = { company_name: 'Compte Réexamen SA', gate_reason: 'pas de budget', gate_decided_at: '2026-01-01' }
const move = {
  full_name: 'Camille Roux',
  company_name: 'Ancien Client SA',
  new_employer: 'Nouvel Employeur SAS',
  known_since: '2024-03-01T00:00:00.000Z',
  new_account_id: null,
  // #2845 — requis par `ContactMove` depuis l'ajout de `c.id AS contact_id`.
  contact_id: 'contact-1',
}

describe('les traces des cinq automatisations CRM du §13 ne confondent pas « rien » et « illisible »', () => {
  describe('projets immobiles', () => {
    it('rien à dire : elle se tait sur un fait MESURÉ', async () => {
      const outcome = await executorOver({
        stalledProjects: async () => ({ measured: true, rows: [] }),
      }).run('stalled_projects', 'u1', new Date(), WS)
      expect(outcome.notified).toBe(false)
      expect(outcome.outcome).toBe('Aucun projet immobile.')
    })

    it('lecture cassée : elle NE dit PAS « aucun projet immobile »', async () => {
      const outcome = await executorOver({
        stalledProjects: async () => ({ measured: false, rows: [] }),
      }).run('stalled_projects', 'u1', new Date(), WS)
      expect(outcome.notified).toBe(false)
      expect(outcome.outcome).not.toContain('Aucun projet immobile')
      expect(outcome.outcome).toContain('pas pu')
    })

    it('des projets immobiles : elle notifie et nomme le plus ancien', async () => {
      const outcome = await executorOver({
        stalledProjects: async () => ({ measured: true, rows: [oldest] }),
      }).run('stalled_projects', 'u1', new Date(), WS)
      expect(outcome.notified).toBe(true)
      expect(outcome.notification?.body).toContain('Migration ERP')
    })
  })

  describe('plans de compte', () => {
    it('rien à dire : elle se tait sur un fait MESURÉ', async () => {
      const outcome = await executorOver({
        staleAccountPlans: async () => ({ measured: true, rows: [] }),
      }).run('stale_account_plans', 'u1', new Date(), WS)
      expect(outcome.notified).toBe(false)
      expect(outcome.outcome).toBe('Tous les plans sont à jour.')
    })

    it('lecture cassée : elle NE dit PAS « tous les plans sont à jour »', async () => {
      const outcome = await executorOver({
        staleAccountPlans: async () => ({ measured: false, rows: [] }),
      }).run('stale_account_plans', 'u1', new Date(), WS)
      expect(outcome.notified).toBe(false)
      expect(outcome.outcome).not.toContain('Tous les plans sont à jour')
      expect(outcome.outcome).toContain('pas pu')
    })

    it('des plans à rafraîchir : elle notifie et nomme le plus ancien', async () => {
      const outcome = await executorOver({
        staleAccountPlans: async () => ({ measured: true, rows: [plan] }),
      }).run('stale_account_plans', 'u1', new Date(), WS)
      expect(outcome.notified).toBe(true)
      expect(outcome.notification?.body).toContain('Client SA')
    })
  })

  describe('besoins sans shortlist', () => {
    it('rien à dire : elle se tait sur un fait MESURÉ', async () => {
      const outcome = await executorOver({
        needsWithoutShortlist: async () => ({ measured: true, rows: [] }),
      }).run('needs_without_shortlist', 'u1', new Date(), WS)
      expect(outcome.notified).toBe(false)
      expect(outcome.outcome).toBe('Chaque besoin ouvert a sa shortlist.')
    })

    it('lecture cassée : elle NE dit PAS « chaque besoin a sa shortlist »', async () => {
      const outcome = await executorOver({
        needsWithoutShortlist: async () => ({ measured: false, rows: [] }),
      }).run('needs_without_shortlist', 'u1', new Date(), WS)
      expect(outcome.notified).toBe(false)
      expect(outcome.outcome).not.toContain('Chaque besoin ouvert a sa shortlist')
      expect(outcome.outcome).toContain('pas pu')
    })

    it('des besoins sans shortlist : elle notifie et nomme le plus ancien', async () => {
      const outcome = await executorOver({
        needsWithoutShortlist: async () => ({ measured: true, rows: [need] }),
      }).run('needs_without_shortlist', 'u1', new Date(), WS)
      expect(outcome.notified).toBe(true)
      expect(outcome.notification?.body).toContain('Lead dev React')
    })
  })

  describe('comptes écartés à revoir — DEUX lectures combinées', () => {
    it('rien à dire : les DEUX lectures ont mesuré, et rien ne bouge', async () => {
      const outcome = await executorOver({
        parkedAccountsWithSignal: async () => ({ measured: true, rows: [] }),
        accountsDueForReexamination: async () => ({ measured: true, rows: [] }),
      }).run('parked_account_signal', 'u1', new Date(), WS)
      expect(outcome.notified).toBe(false)
      expect(outcome.outcome).toBe('Aucun compte écarté à revoir.')
    })

    it('les DEUX lectures cassent : elle NE dit PAS « aucun compte écarté »', async () => {
      const outcome = await executorOver({
        parkedAccountsWithSignal: async () => ({ measured: false, rows: [] }),
        accountsDueForReexamination: async () => ({ measured: false, rows: [] }),
      }).run('parked_account_signal', 'u1', new Date(), WS)
      expect(outcome.notified).toBe(false)
      expect(outcome.outcome).not.toContain('Aucun compte écarté à revoir')
      expect(outcome.outcome).toContain('pas pu')
    })

    it('RÉSILIENCE : le signal casse, le réexamen mesure et trouve — la moitié qui marche sort', async () => {
      const outcome = await executorOver({
        parkedAccountsWithSignal: async () => ({ measured: false, rows: [] }),
        accountsDueForReexamination: async () => ({ measured: true, rows: [due] }),
      }).run('parked_account_signal', 'u1', new Date(), WS)
      expect(outcome.notified).toBe(true)
      expect(outcome.notification?.body).toContain('Compte Réexamen SA')
    })

    it('RÉSILIENCE : le réexamen casse, le signal mesure et trouve — la moitié qui marche sort', async () => {
      const outcome = await executorOver({
        parkedAccountsWithSignal: async () => ({ measured: true, rows: [parked] }),
        accountsDueForReexamination: async () => ({ measured: false, rows: [] }),
      }).run('parked_account_signal', 'u1', new Date(), WS)
      expect(outcome.notified).toBe(true)
      expect(outcome.notification?.body).toContain('Compte Écarté SA')
    })
  })

  describe('changements de poste', () => {
    it('rien à dire : elle se tait sur un fait MESURÉ', async () => {
      const outcome = await executorOver({
        contactsWhoMayHaveMoved: async () => ({ measured: true, rows: [] }),
      }).run('contact_job_change', 'u1', new Date(), WS)
      expect(outcome.notified).toBe(false)
      expect(outcome.outcome).toBe('Aucun changement de poste repéré.')
    })

    it('lecture cassée : elle NE dit PAS « aucun changement de poste repéré »', async () => {
      const outcome = await executorOver({
        contactsWhoMayHaveMoved: async () => ({ measured: false, rows: [] }),
      }).run('contact_job_change', 'u1', new Date(), WS)
      expect(outcome.notified).toBe(false)
      expect(outcome.outcome).not.toContain('Aucun changement de poste repéré')
      expect(outcome.outcome).toContain('pas pu')
    })

    it('RÉSILIENCE : une des deux jointures casse mais l’autre a trouvé — la routine le montre quand même', async () => {
      const outcome = await executorOver({
        // measured=false (une des deux sources a cassé) mais il y a une ligne
        // réelle, trouvée par l'autre : elle ne doit pas être TUE au nom d'une
        // prudence que rien ne demande.
        contactsWhoMayHaveMoved: async () => ({ measured: false, rows: [move] }),
        openDoorFromMove: async () => false,
        pauseSequencesForJobChange: async () => 0,
      }).run('contact_job_change', 'u1', new Date(), WS)
      expect(outcome.notified).toBe(true)
      expect(outcome.notification?.body).toContain('Camille Roux')
    })

    // #2845 — un contact SANS changement ne pause rien : `pauseSequencesForJobChange`
    // n'est même pas sollicitée en dehors d'un `move` détecté, et un retour à
    // zéro ne doit rien ajouter au texte.
    it('#2845 — aucune pause ne s’ajoute au texte quand rien n’a été mis en pause', async () => {
      const outcome = await executorOver({
        contactsWhoMayHaveMoved: async () => ({ measured: true, rows: [move] }),
        openDoorFromMove: async () => false,
        pauseSequencesForJobChange: async () => 0,
      }).run('contact_job_change', 'u1', new Date(), WS)
      expect(outcome.outcome).toBe('1 contact(s) à vérifier.')
      expect(outcome.notification?.body).toBe('Camille Roux, rattaché à Ancien Client SA.')
    })

    // #2845 — la séquence active de ce contact se met en PAUSE : la trace le dit.
    it('#2845 — une séquence mise en pause se lit dans l’outcome ET la notification', async () => {
      const pauseCalls: [string, string][] = []
      const outcome = await executorOver({
        contactsWhoMayHaveMoved: async () => ({ measured: true, rows: [move] }),
        openDoorFromMove: async () => false,
        pauseSequencesForJobChange: async (workspaceId: string, contactId: string) => {
          pauseCalls.push([workspaceId, contactId])
          return 1
        },
      }).run('contact_job_change', 'u1', new Date(), WS)
      expect(pauseCalls).toEqual([[WS, 'contact-1']])
      expect(outcome.outcome).toBe('1 contact(s) à vérifier, 1 séquence(s) mise(s) en pause.')
      expect(outcome.notification?.body).toContain('1 séquence(s) en pause en attendant vérification.')
    })
  })
})

/**
 * #3918.2 (lot M01, 09/10/2026) — « un contact connu a changé de poste » au
 * registre canonique : le détecteur réel existait, son appelant n'écrivait
 * aucun `TriggerEvent`.
 */
describe('#3918.2 — contact_job_change écrit au registre canonique', () => {
  function executorWithRegistry(crmRoutines: Partial<CrmRoutinesService>, record: jest.Mock): RoutineExecutors {
    const args: unknown[] = Array.from({ length: 20 }, () => undefined)
    args[6] = crmRoutines
    args[20] = record
    return new (RoutineExecutors as unknown as new (...a: unknown[]) => RoutineExecutors)(...args)
  }

  it('un TriggerEvent `contact_changement_poste` par contact repéré, sujet = le contact, fait nommé', async () => {
    const record = jest.fn().mockResolvedValue(true)
    await executorWithRegistry(
      {
        contactsWhoMayHaveMoved: async () => ({ measured: true, rows: [move] }),
        openDoorFromMove: async () => false,
        pauseSequencesForJobChange: async () => 0,
      },
      record,
    ).run('contact_job_change', 'u1', new Date('2026-10-09T07:00:00Z'), WS)
    expect(record).toHaveBeenCalledTimes(1)
    const [event, source] = record.mock.calls[0] ?? []
    expect(event).toMatchObject({
      type: 'contact_changement_poste',
      source: 'routines',
      object: { subjectType: 'contact', subjectId: 'contact-1' },
      scope: { workspaceId: WS, ownerId: null },
    })
    expect(event.evidence).toContain('Camille Roux')
    expect(event.evidence).toContain('Nouvel Employeur SAS')
    expect(event.evidence).toContain('Ancien Client SA')
    expect(source).toBe('routines/routine-executors.contactJobChange')
  })

  it('rien de repéré : rien n’est écrit au registre', async () => {
    const record = jest.fn()
    await executorWithRegistry({ contactsWhoMayHaveMoved: async () => ({ measured: true, rows: [] }) }, record).run(
      'contact_job_change',
      'u1',
      new Date(),
      WS,
    )
    expect(record).not.toHaveBeenCalled()
  })

  it('un registre en échec ne fait jamais taire la routine', async () => {
    const record = jest.fn().mockRejectedValue(new Error('registre indisponible'))
    const outcome = await executorWithRegistry(
      {
        contactsWhoMayHaveMoved: async () => ({ measured: true, rows: [move] }),
        openDoorFromMove: async () => false,
        pauseSequencesForJobChange: async () => 0,
      },
      record,
    ).run('contact_job_change', 'u1', new Date(), WS)
    expect(outcome.notified).toBe(true)
  })
})
