import { INTERVENTION_THRESHOLDS, localMonthKey } from '@bellum/contracts'
import {
  detectBlockedInvoicing,
  detectMissingTimesheets,
  detectNeedsWithoutShortlist,
  detectStalledSubmissions,
} from '../playbooks/intervention-rules'
import { DEMO_DELIVERY_CLIENT } from './demo-dataset'

/**
 * #2567.3 (18/09/2026) — LES CINQ DOMAINES CLIENT RESTANTS DE LA RÉTENTION
 * QUOTIDIENNE, PROUVÉS PAR EXÉCUTION, PAS PAR AFFIRMATION.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE GARDE VÉRIFIE, ET CE QU'ELLE NE VÉRIFIE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * `demo-coverage.ts` classe `interventions` SEEDÉE (mémoire du dépôt : « une
 * classification de couverture affirme, la garde ne vérifie pas » — ce test
 * existe pour que ce ne soit plus vrai ici). Il n'ouvre PAS de connexion
 * Postgres : il rejoue les mêmes fonctions PURES que le balayeur nocturne
 * (`detectStalledSubmissions` / `detectMissingTimesheets` /
 * `detectBlockedInvoicing` / `detectNeedsWithoutShortlist`,
 * `playbooks/intervention-rules.ts`) sur des lignes qui reproduisent, champ
 * pour champ, ce que `DemoSeedService.seedRetentionDomainsSource` /
 * `seedRetentionDomainsDerived` écrivent réellement en base (voir leurs
 * docblocks, `demo-seed.service.ts`) — pour BESOINS et VIVIER, les lignes
 * viennent directement de `DEMO_DELIVERY_CLIENT.openNeeds`, jamais recopiées.
 *
 * Chaque domaine porte DEUX preuves : la dérivation PRODUIT l'intervention sur
 * le semis réel, et elle NE LA PRODUIT PLUS dès qu'on dégrade le seul fait qui
 * la déclenche (le rouge qu'un simple commentaire ne peut pas simuler).
 *
 * Le domaine BONS DE COMMANDE n'a pas de test à lui : il se lit DANS le détail
 * d'`invoicing_blocked` (le bloqueur `missing_po`, cité tel quel) — c'est la
 * convention déjà posée par le registre K, vérifiée ici par la même assertion
 * que FACTURATION.
 */
describe('#2567.3 — CRA, facturation, bons de commande, besoins et vivier sont semés en démo', () => {
  const now = new Date('2026-09-18T12:00:00.000Z')
  const day = 86_400_000
  const daysAgo = (n: number): Date => new Date(now.getTime() - n * day)
  /** Même calcul que `DemoSeedService.seedRetentionDomainsSource` : le 1er du
   *  mois qui contient (`now` - `daysBack` jours). */
  const monthStart = (daysBack: number): string => `${localMonthKey(new Date(now.getTime() - daysBack * day))}-01`

  describe('CRA — le relevé jamais déposé de « Cadrage données transport — lot 2 »', () => {
    const period = monthStart(52)

    it('detectMissingTimesheets produit timesheet_missing sur le semis (#2567.3)', () => {
      const drafts = detectMissingTimesheets([
        {
          id: 'seed-cra',
          mission_label: 'Cadrage données transport — lot 2',
          period_month: period,
          reminders_sent: INTERVENTION_THRESHOLDS.timesheetRemindersBeforeAlert,
          owner_id: 'owner-1',
        },
      ])
      expect(drafts).toHaveLength(1)
      expect(drafts[0].kind).toBe('timesheet_missing')
      expect(drafts[0].detail).toContain('Cadrage données transport — lot 2')
    })

    it('preuve du rouge : une relance de moins, et la dérivation ne produit RIEN', () => {
      const drafts = detectMissingTimesheets([
        {
          id: 'seed-cra',
          mission_label: 'Cadrage données transport — lot 2',
          period_month: period,
          reminders_sent: INTERVENTION_THRESHOLDS.timesheetRemindersBeforeAlert - 1,
          owner_id: 'owner-1',
        },
      ])
      expect(drafts).toEqual([])
    })
  })

  describe('Facturation + bons de commande — le même mois, bloqué pour quatre raisons', () => {
    const period = monthStart(52)
    const blockedRow = {
      id: 'seed-facturation',
      mission_label: 'Cadrage données transport — lot 2',
      period_month: period,
      state: 'blocked',
      invoiced_at: null,
      blockers: ['missing_timesheet', 'missing_cost', 'missing_po', 'missing_billing_contact'],
      owner_id: 'owner-1',
    }

    it('detectBlockedInvoicing produit invoicing_blocked, et son détail cite missing_po (#2567.3)', () => {
      const drafts = detectBlockedInvoicing([blockedRow], now)
      expect(drafts).toHaveLength(1)
      expect(drafts[0].kind).toBe('invoicing_blocked')
      // Le domaine BONS DE COMMANDE n'ouvre pas de sixième nature : il se lit
      // ICI, dans le détail — même convention que le registre K pour
      // `invoicing_blocked`.
      expect(drafts[0].detail).toContain('missing_po')
    })

    it('preuve du rouge : un mois déjà facturé ne produit RIEN', () => {
      const drafts = detectBlockedInvoicing([{ ...blockedRow, invoiced_at: now.toISOString() }], now)
      expect(drafts).toEqual([])
    })
  })

  describe('Besoins — « Ingénieur systèmes — supervision des systèmes temps réel » sans profil positionné', () => {
    const need = DEMO_DELIVERY_CLIENT.openNeeds.find(candidate =>
      candidate.title.includes('supervision des systèmes temps réel'),
    )

    it('le besoin existe, sa shortlist est vide, son âge d’étape dépasse le seuil', () => {
      expect(need).toBeDefined()
      expect(need!.shortlist).toEqual([])
      expect(need!.status_changed_days_ago).toBeGreaterThanOrEqual(INTERVENTION_THRESHOLDS.needWithoutShortlistDays)
    })

    it('detectNeedsWithoutShortlist produit need_without_shortlist sur ce même besoin (#2567.3)', () => {
      const drafts = detectNeedsWithoutShortlist(
        [
          {
            id: 'seed-besoin',
            title: need!.title,
            status_changed_at: daysAgo(need!.status_changed_days_ago),
            owner_id: 'owner-1',
          },
        ],
        now,
      )
      expect(drafts).toHaveLength(1)
      expect(drafts[0].kind).toBe('need_without_shortlist')
    })

    it('preuve du rouge : sous le seuil de cinq jours, la dérivation ne produit RIEN', () => {
      const drafts = detectNeedsWithoutShortlist(
        [
          {
            id: 'seed-besoin',
            title: need!.title,
            status_changed_at: daysAgo(INTERVENTION_THRESHOLDS.needWithoutShortlistDays - 1),
            owner_id: 'owner-1',
          },
        ],
        now,
      )
      expect(drafts).toEqual([])
    })
  })

  describe('Vivier — Marc Ouedraogo, positionné sans retour sur « socle conteneurisé du portail »', () => {
    const need = DEMO_DELIVERY_CLIENT.openNeeds.find(candidate =>
      candidate.title.includes('socle conteneurisé du portail'),
    )
    // Le type inféré de `shortlist` varie d'un besoin à l'autre (certains le
    // déclarent `[]`, donc `never[]`) : la CALLBACK est typée explicitement,
    // sinon TypeScript résout `candidate` en `never` sur l'union des besoins.
    const entry = need?.shortlist.find(
      (candidate: { consultant: string; submitted_days_ago: number | null }) =>
        candidate.consultant === 'Marc Ouedraogo',
    )

    it('le profil existe, soumis au-delà du seuil de silence, sans clôture ni retour', () => {
      expect(entry).toBeDefined()
      expect(entry!.submitted_days_ago).not.toBeNull()
      expect(entry!.submitted_days_ago as number).toBeGreaterThanOrEqual(INTERVENTION_THRESHOLDS.submissionSilenceDays)
    })

    it('detectStalledSubmissions produit submission_stalled sur ce même profil (#2567.3)', () => {
      const drafts = detectStalledSubmissions(
        [
          {
            id: 'seed-vivier',
            submitted_at: daysAgo(entry!.submitted_days_ago as number),
            first_feedback_at: null,
            closed_at: null,
            owner_id: 'owner-1',
            consultant_name: entry!.consultant,
            account_name: DEMO_DELIVERY_CLIENT.account.company_name,
          },
        ],
        now,
      )
      expect(drafts).toHaveLength(1)
      expect(drafts[0].kind).toBe('submission_stalled')
    })

    it('preuve du rouge : un retour client reçu éteint la ligne', () => {
      const drafts = detectStalledSubmissions(
        [
          {
            id: 'seed-vivier',
            submitted_at: daysAgo(entry!.submitted_days_ago as number),
            first_feedback_at: now,
            closed_at: null,
            owner_id: 'owner-1',
            consultant_name: entry!.consultant,
            account_name: DEMO_DELIVERY_CLIENT.account.company_name,
          },
        ],
        now,
      )
      expect(drafts).toEqual([])
    })
  })
})
