import { INTERVENTION_KINDS, INTERVENTION_THRESHOLDS, MISSION_BOARD_STALE_DAYS } from '@bellum/contracts'
import {
  detectAccountsWithoutNextAction,
  detectBlockedInvoicing,
  detectCreditsExhausted,
  detectInactiveReps,
  detectMissingTimesheets,
  detectMissionsWithoutEndDate,
  detectNeedsWithoutShortlist,
  detectOverduePayments,
  detectProjectsWithoutDecision,
  detectRenewalsAtRisk,
  detectStaffingCollisionInterventions,
  detectStalledSubmissions,
  detectUntouchedAccounts,
} from './intervention-rules'

/** Le 15 juin 2026 à midi — une date fixe, pour que les fenêtres se lisent. */
const NOW = new Date('2026-06-15T12:00:00Z')
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000)
const inDays = (days: number) => new Date(NOW.getTime() + days * 86_400_000).toISOString().slice(0, 10)

describe('règles de la file d’intervention', () => {
  describe('profil positionné sans retour', () => {
    const base = {
      id: 'sub-1',
      first_feedback_at: null,
      closed_at: null,
      owner_id: 'user-1',
      consultant_name: 'Marie Dupont',
      account_name: 'ACME',
    }

    it('alerte au-delà du seuil, avec le nom et le nombre de jours', () => {
      const [draft] = detectStalledSubmissions([{ ...base, submitted_at: daysAgo(20) }], NOW)
      expect(draft.kind).toBe('submission_stalled')
      expect(draft.subjectType).toBe('submission')
      expect(draft.detail).toContain('Marie Dupont')
      expect(draft.detail).toContain('ACME')
      expect(draft.detail).toContain('20 jours')
    })

    it('se tait en deçà du seuil', () => {
      const justUnder = INTERVENTION_THRESHOLDS.submissionSilenceDays - 1
      expect(detectStalledSubmissions([{ ...base, submitted_at: daysAgo(justUnder) }], NOW)).toHaveLength(0)
    })

    it('se tait dès qu’un retour est arrivé, ou que le dossier est clos', () => {
      expect(
        detectStalledSubmissions([{ ...base, submitted_at: daysAgo(60), first_feedback_at: daysAgo(1) }], NOW),
      ).toHaveLength(0)
      expect(
        detectStalledSubmissions([{ ...base, submitted_at: daysAgo(60), closed_at: daysAgo(2) }], NOW),
      ).toHaveLength(0)
    })

    it('n’alerte JAMAIS sans date d’envoi', () => {
      // Déduire la date de la création compterait notre propre sélection interne
      // comme du silence client.
      expect(detectStalledSubmissions([{ ...base, submitted_at: null }], NOW)).toHaveLength(0)
    })

    // #2335.7 (LAU-FINAL-076) — « le silence crée une action gouvernée, pas une
    // relance infinie ». Au-delà du délai maximal, ce n'est plus un rappel : un
    // humain doit trancher (clore, retirer), pas se faire répéter la même alerte.
    it('s’arrête au délai MAXIMAL — passé ce point, ce n’est plus un rappel', () => {
      expect(
        detectStalledSubmissions(
          [{ ...base, submitted_at: daysAgo(INTERVENTION_THRESHOLDS.submissionSilenceMaxDays) }],
          NOW,
        ),
      ).toHaveLength(0)
    })

    it('alerte encore juste EN DEÇÀ du délai maximal', () => {
      const justUnderMax = INTERVENTION_THRESHOLDS.submissionSilenceMaxDays - 1
      expect(detectStalledSubmissions([{ ...base, submitted_at: daysAgo(justUnderMax) }], NOW)).toHaveLength(1)
    })
  })

  describe('renouvellement à risque', () => {
    const base = { id: 'mis-1', label: 'ACME — Dev back', user_id: 'user-2', has_open_renewal: false }

    it('alerte dans la fenêtre', () => {
      const [draft] = detectRenewalsAtRisk([{ ...base, ends_on: inDays(10) }], NOW)
      expect(draft.kind).toBe('renewal_at_risk')
      expect(draft.detail).toContain('dans 10 jours')
    })

    it('alerte plus fort sur une échéance DÉPASSÉE', () => {
      // Le cas le plus urgent : s'arrêter à zéro laisserait filer les missions
      // déjà terminées sans suite.
      const [draft] = detectRenewalsAtRisk([{ ...base, ends_on: inDays(-5) }], NOW)
      expect(draft.detail).toContain('dépassée depuis 5 jours')
    })

    it('se tait au-delà de l’horizon, et quand un renouvellement est ouvert', () => {
      const far = INTERVENTION_THRESHOLDS.renewalHorizonDays + 5
      expect(detectRenewalsAtRisk([{ ...base, ends_on: inDays(far) }], NOW)).toHaveLength(0)
      expect(detectRenewalsAtRisk([{ ...base, ends_on: inDays(5), has_open_renewal: true }], NOW)).toHaveLength(0)
    })

    it('n’alerte JAMAIS sur une mission sans date de fin', () => {
      // Une mission au forfait ou reconduite tacitement n'en a pas ; lui en
      // inventer une produirait une alerte par mission et par jour.
      expect(detectRenewalsAtRisk([{ ...base, ends_on: null }], NOW)).toHaveLength(0)
    })
  })

  describe('facturation bloquée', () => {
    const base = {
      id: 'inv-1',
      mission_label: 'ACME — Dev back',
      period_month: '2026-04-01',
      state: 'blocked',
      invoiced_at: null,
      blockers: ['CRA non validé', 'bon de commande manquant'],
      owner_id: 'user-3',
    }

    it('cite les bloqueurs relevés plutôt que de les résumer', () => {
      const [draft] = detectBlockedInvoicing([base], NOW)
      expect(draft.kind).toBe('invoicing_blocked')
      expect(draft.detail).toContain('CRA non validé')
      expect(draft.detail).toContain('bon de commande manquant')
      expect(draft.detail).toContain('2026-04')
    })

    it('se tait sur un mois déjà facturé ou débloqué', () => {
      expect(detectBlockedInvoicing([{ ...base, invoiced_at: daysAgo(3) }], NOW)).toHaveLength(0)
      expect(detectBlockedInvoicing([{ ...base, state: 'ready' }], NOW)).toHaveLength(0)
    })

    it('attend que le mois soit clos depuis un moment', () => {
      // Alerter le 3 du mois sur le mois en cours signalerait tous les mois,
      // tous les mois.
      expect(detectBlockedInvoicing([{ ...base, period_month: '2026-06-01' }], NOW)).toHaveLength(0)
    })
  })

  describe('compte suivi non touché', () => {
    it('alerte au-delà du seuil', () => {
      const [draft] = detectUntouchedAccounts(
        [{ id: 'a1', name: 'ACME', last_action_at: daysAgo(45), owner_id: 'u' }],
        NOW,
      )
      expect(draft.kind).toBe('account_untouched')
      expect(draft.detail).toContain('45 jours')
    })

    it('alerte AUSSI quand rien n’a jamais été fait, et le dit autrement', () => {
      // « Mis en suivi et jamais ouvert » est exactement le cas que le
      // responsable veut voir — sans annoncer un nombre de jours inventé.
      const [draft] = detectUntouchedAccounts([{ id: 'a2', name: 'BETA', last_action_at: null, owner_id: null }], NOW)
      expect(draft.detail).toContain('aucune action jamais enregistrée')
      expect(draft.detail).not.toMatch(/\d+ jours/)
    })

    it('se tait sur un compte touché récemment', () => {
      expect(
        detectUntouchedAccounts([{ id: 'a3', name: 'C', last_action_at: daysAgo(2), owner_id: null }], NOW),
      ).toHaveLength(0)
    })
  })

  describe('commercial inactif', () => {
    it('alerte au-delà du seuil', () => {
      const [draft] = detectInactiveReps(
        [{ user_id: 'u1', name: 'Paul', joined_at: daysAgo(200), last_action_at: daysAgo(30) }],
        NOW,
      )
      expect(draft.kind).toBe('rep_inactive')
      expect(draft.subjectType).toBe('user')
      expect(draft.subjectId).toBe('u1')
      expect(draft.detail).toContain('30 jours')
    })

    it('n’alerte JAMAIS sur quelqu’un qui vient d’arriver', () => {
      // Sinon la première chose que son responsable verrait de lui serait une
      // alerte, avant même qu'il ait ouvert l'outil.
      expect(
        detectInactiveReps([{ user_id: 'u2', name: 'Nouveau', joined_at: daysAgo(2), last_action_at: null }], NOW),
      ).toHaveLength(0)
    })

    it('alerte sur quelqu’un installé qui n’a jamais rien fait', () => {
      const [draft] = detectInactiveReps(
        [{ user_id: 'u3', name: 'Léa', joined_at: daysAgo(90), last_action_at: null }],
        NOW,
      )
      expect(draft.detail).toContain('depuis son arrivée')
    })

    it('reste factuel — le produit ne juge pas, le responsable interprète', () => {
      const [draft] = detectInactiveReps(
        [{ user_id: 'u4', name: 'Sam', joined_at: daysAgo(90), last_action_at: daysAgo(40) }],
        NOW,
      )
      for (const judgment of ['inactif', 'problème', 'retard', 'insuffisant', 'faible']) {
        expect(draft.detail.toLowerCase()).not.toContain(judgment)
      }
    })
  })

  describe('crédits épuisés', () => {
    it('prévient AVANT le mur', () => {
      const [draft] = detectCreditsExhausted([{ workspace_id: 'w1', used: 92, limit: 100, ownerId: 'owner' }])
      expect(draft.kind).toBe('credits_exhausted')
      expect(draft.subjectType).toBe('workspace')
      expect(draft.detail).toContain('8 restants')
    })

    it('dit clairement que c’est bloqué quand il ne reste rien', () => {
      const [draft] = detectCreditsExhausted([{ workspace_id: 'w2', used: 100, limit: 100, ownerId: null }])
      expect(draft.detail).toContain('bloqués')
    })

    it('se tait bien en dessous du seuil', () => {
      expect(detectCreditsExhausted([{ workspace_id: 'w3', used: 10, limit: 100, ownerId: null }])).toHaveLength(0)
    })

    it('n’alerte JAMAIS sur un quota inconnu ou nul', () => {
      // Un espace sans enveloppe lue n'est pas un espace épuisé : lui envoyer
      // une alerte de blocage alors qu'il n'a rien consommé serait faux.
      expect(detectCreditsExhausted([{ workspace_id: 'w4', used: 0, limit: null, ownerId: null }])).toHaveLength(0)
      expect(detectCreditsExhausted([{ workspace_id: 'w5', used: 0, limit: 0, ownerId: null }])).toHaveLength(0)
    })
  })

  /* ═════════ Les cinq natures du cockpit du commercial ═════════ */

  describe('compte suivi sans prochaine action', () => {
    const base = { id: 'acc-1', name: 'ACME', owner_id: 'user-1' }

    it('alerte sur un compte assez ancien pour qu’une suite soit attendue', () => {
      const tenure = INTERVENTION_THRESHOLDS.accountNoNextActionDays + 12
      const [draft] = detectAccountsWithoutNextAction([{ ...base, created_at: daysAgo(tenure) }], NOW)
      expect(draft.kind).toBe('account_no_next_action')
      expect(draft.subjectType).toBe('account')
      expect(draft.subjectId).toBe('acc-1')
      expect(draft.ownerId).toBe('user-1')
      expect(draft.detail).toContain('ACME')
      expect(draft.detail).toContain(`${tenure} jours`)
    })

    it('se tait sur un compte trop jeune — la première chose vue d’un compte neuf ne peut pas être un reproche', () => {
      const justUnder = INTERVENTION_THRESHOLDS.accountNoNextActionDays - 1
      expect(detectAccountsWithoutNextAction([{ ...base, created_at: daysAgo(justUnder) }], NOW)).toHaveLength(0)
    })

    it('se tait quand la date de création est absente ou illisible', () => {
      expect(detectAccountsWithoutNextAction([{ ...base, created_at: null }], NOW)).toHaveLength(0)
      expect(detectAccountsWithoutNextAction([{ ...base, created_at: 'pas une date' }], NOW)).toHaveLength(0)
    })
  })

  describe('projet sans décision', () => {
    const base = { id: 'prj-1', label: 'Refonte du socle', owner_id: 'user-1' }

    it('applique la durée type de CHAQUE étape, pas une durée uniforme', () => {
      // `profiles_submitted` tombe dans « profil proposé » (3 j) et `dormant`
      // dans « en veille » (90 j). Le MÊME âge doit donc alerter sur l'un et se
      // taire sur l'autre : c'est tout l'intérêt d'une durée par étape.
      const rows = [
        { ...base, id: 'prj-court', stage: 'profiles_submitted', stage_entered_at: daysAgo(10) },
        { ...base, id: 'prj-long', stage: 'dormant', stage_entered_at: daysAgo(10) },
      ]
      const drafts = detectProjectsWithoutDecision(rows, NOW)
      expect(drafts.map(draft => draft.subjectId)).toEqual(['prj-court'])
      expect(drafts[0]?.kind).toBe('project_no_decision')
      expect(drafts[0]?.subjectType).toBe('project')
      expect(drafts[0]?.detail).toContain('10 jours')
      // La durée type est CITÉE : « immobile depuis 10 jours » ne dit pas si
      // c'est beaucoup.
      expect(drafts[0]?.detail).toContain(`${MISSION_BOARD_STALE_DAYS.profil_propose} jours`)
    })

    it('se tait à l’entonnoir de détection — un signal que personne n’a regardé n’est pas une affaire suivie', () => {
      const rows = [
        { ...base, stage: 'detected', stage_entered_at: daysAgo(400) },
        { ...base, stage: 'potential', stage_entered_at: daysAgo(400) },
      ]
      expect(detectProjectsWithoutDecision(rows, NOW)).toHaveLength(0)
    })

    it('se tait sur une issue DÉJÀ tranchée — la décision a été prise', () => {
      const rows = [
        { ...base, stage: 'won', stage_entered_at: daysAgo(400) },
        { ...base, stage: 'lost', stage_entered_at: daysAgo(400) },
      ]
      expect(detectProjectsWithoutDecision(rows, NOW)).toHaveLength(0)
    })

    it('se tait sans date d’entrée d’étape — « depuis toujours » ferait remonter ce dont on ne sait rien', () => {
      expect(
        detectProjectsWithoutDecision([{ ...base, stage: 'negotiation', stage_entered_at: null }], NOW),
      ).toHaveLength(0)
    })
  })

  describe('besoin ouvert sans shortlist', () => {
    const base = { id: 'need-1', title: 'Architecte de plateforme', owner_id: 'user-1' }

    it('alerte au-delà du seuil, avec l’âge d’étape', () => {
      const age = INTERVENTION_THRESHOLDS.needWithoutShortlistDays + 7
      const [draft] = detectNeedsWithoutShortlist([{ ...base, status_changed_at: daysAgo(age) }], NOW)
      expect(draft.kind).toBe('need_without_shortlist')
      expect(draft.detail).toContain('Architecte de plateforme')
      expect(draft.detail).toContain(`${age} jours`)
    })

    it('se tait en deçà du seuil', () => {
      const justUnder = INTERVENTION_THRESHOLDS.needWithoutShortlistDays - 1
      expect(detectNeedsWithoutShortlist([{ ...base, status_changed_at: daysAgo(justUnder) }], NOW)).toHaveLength(0)
    })

    it('se tait sans âge d’étape — un âge inventé est toujours rassurant', () => {
      expect(detectNeedsWithoutShortlist([{ ...base, status_changed_at: null }], NOW)).toHaveLength(0)
    })
  })

  describe('relevé manquant après relances', () => {
    const base = { id: 'ts-1', mission_label: 'Supervision', period_month: '2026-05-01', owner_id: 'user-1' }

    it('alerte au-delà du compteur de relances, et CITE le nombre envoyé', () => {
      const [draft] = detectMissingTimesheets([{ ...base, reminders_sent: 3 }])
      expect(draft.kind).toBe('timesheet_missing')
      expect(draft.subjectType).toBe('mission')
      expect(draft.detail).toContain('Supervision')
      expect(draft.detail).toContain('2026-05')
      expect(draft.detail).toContain('3 relances')
    })

    it('se tait sous le nombre de relances', () => {
      const justUnder = INTERVENTION_THRESHOLDS.timesheetRemindersBeforeAlert - 1
      expect(detectMissingTimesheets([{ ...base, reminders_sent: justUnder }])).toHaveLength(0)
    })

    it('se tait sur un compteur inconnu — on n’annonce pas des relances que personne n’a envoyées', () => {
      expect(detectMissingTimesheets([{ ...base, reminders_sent: null }])).toHaveLength(0)
    })
  })

  describe('encaissement en retard', () => {
    const base = {
      id: 'inv-1',
      mission_label: 'Supervision',
      period_month: '2026-03-01',
      paid_at: null,
      // #2419.4 — les deux montants du solde : ce qui clôt une facture est un
      // SOLDE, jamais une date d'encaissement.
      paid_amount_cents: null,
      invoiced_amount_cents: 10_000_00,
      disputed_at: null,
      dispute_resolved_at: null,
      owner_id: 'user-1',
    }
    /** Une échéance dépassée de `days` jours, au format `YYYY-MM-DD`. */
    const dueDaysAgo = (days: number) => daysAgo(days).toISOString().slice(0, 10)

    it('alerte au-delà de la franchise, comptée depuis l’ÉCHÉANCE', () => {
      const overdue = INTERVENTION_THRESHOLDS.paymentOverdueDays + 15
      const [draft] = detectOverduePayments([{ ...base, due_on: dueDaysAgo(overdue) }], NOW)
      expect(draft.kind).toBe('payment_overdue')
      expect(draft.subjectType).toBe('mission')
      expect(draft.detail).toContain('2026-03')
      expect(draft.detail).toContain('jours')
    })

    it('se tait en deçà de la franchise', () => {
      const justUnder = INTERVENTION_THRESHOLDS.paymentOverdueDays - 1
      expect(detectOverduePayments([{ ...base, due_on: dueDaysAgo(justUnder) }], NOW)).toHaveLength(0)
    })

    it('se tait sans échéance connue — `null` n’est pas « aujourd’hui »', () => {
      expect(detectOverduePayments([{ ...base, due_on: null }], NOW)).toHaveLength(0)
    })

    it('se tait sur un mois encaissé, et sur un LITIGE en cours — mais pas sur un litige levé', () => {
      const due = dueDaysAgo(INTERVENTION_THRESHOLDS.paymentOverdueDays + 30)
      expect(detectOverduePayments([{ ...base, due_on: due, paid_at: daysAgo(2) }], NOW)).toHaveLength(0)
      expect(detectOverduePayments([{ ...base, due_on: due, disputed_at: daysAgo(40) }], NOW)).toHaveLength(0)
      expect(
        detectOverduePayments(
          [{ ...base, due_on: due, disputed_at: daysAgo(40), dispute_resolved_at: daysAgo(5) }],
          NOW,
        ),
      ).toHaveLength(1)
    })

    /**
     * ─────────────────────────────────────────────────────────────────────
     * #2419.4 — UN PAIEMENT PARTIEL NE SORT PAS DE LA FILE
     * ─────────────────────────────────────────────────────────────────────
     * Cette règle sortait sur `if (row.paid_at) continue`, et son docblock
     * posait la doctrine fautive en toutes lettres : « c'est l'encaissement
     * qui clôt, pas le montant ». Un client qui règle 5 000 € sur 10 000 €
     * éteignait donc l'intervention : plus personne n'était prévenu que
     * 5 000 € dormaient.
     */
    it('alerte ENCORE sur un règlement PARTIEL, et nomme le reste dû', () => {
      const due = dueDaysAgo(INTERVENTION_THRESHOLDS.paymentOverdueDays + 30)
      const [draft] = detectOverduePayments(
        [{ ...base, due_on: due, paid_at: daysAgo(2), paid_amount_cents: 5_000_00 }],
        NOW,
      )
      expect(draft?.kind).toBe('payment_overdue')
      // Le détail ne dit plus « aucun encaissement » sur une ligne où de
      // l'argent est rentré : il nomme ce qui RESTE.
      // ⚠️ `Intl` sépare les milliers par une espace insécable étroite : un
      // test qui compare à une espace ordinaire échoue sur la bonne valeur.
      expect(draft?.detail).toContain('reste dû')
      expect(draft?.detail).toMatch(/5\s000,00\s?€/u)
      expect(draft?.detail).not.toContain('aucun encaissement')
    })

    /** Payé d'un montant NON MESURÉ : on n'accuse pas d'un silence. */
    it('se tait quand le montant encaissé est inconnu', () => {
      const due = dueDaysAgo(INTERVENTION_THRESHOLDS.paymentOverdueDays + 30)
      expect(
        detectOverduePayments([{ ...base, due_on: due, paid_at: daysAgo(2), paid_amount_cents: null }], NOW),
      ).toHaveLength(0)
    })

    /** Sans montant FACTURÉ, le rapport est indéterminé : la ligne ne peut
     *  pas être dite partielle. */
    it('se tait quand le montant facturé est inconnu', () => {
      const due = dueDaysAgo(INTERVENTION_THRESHOLDS.paymentOverdueDays + 30)
      expect(
        detectOverduePayments(
          [
            {
              ...base,
              due_on: due,
              paid_at: daysAgo(2),
              paid_amount_cents: 5_000_00,
              invoiced_amount_cents: null,
            },
          ],
          NOW,
        ),
      ).toHaveLength(0)
    })
  })

  describe('collision équipe', () => {
    it('alerte quand le même consultant est ouvert sur deux besoins distincts', () => {
      const [draft] = detectStaffingCollisionInterventions([
        { id: 'sub-1', needId: 'need-a', consultantId: 'c-1', consultantName: 'Antoine Rivière', stage: 'shortlisted' },
        { id: 'sub-2', needId: 'need-b', consultantId: 'c-1', consultantName: 'Antoine Rivière', stage: 'submitted' },
      ])
      expect(draft.kind).toBe('staffing_collision')
      expect(draft.subjectType).toBe('submission')
      expect(draft.subjectId).toBe('sub-1')
      expect(draft.ownerId).toBeNull()
      expect(draft.detail).toContain('Antoine Rivière')
      expect(draft.detail).toContain('2 besoins concurrents')
    })

    it('se tait quand les deux positionnements visent le même besoin', () => {
      expect(
        detectStaffingCollisionInterventions([
          {
            id: 'sub-1',
            needId: 'need-a',
            consultantId: 'c-1',
            consultantName: 'Antoine Rivière',
            stage: 'shortlisted',
          },
          { id: 'sub-2', needId: 'need-a', consultantId: 'c-1', consultantName: 'Antoine Rivière', stage: 'submitted' },
        ]),
      ).toHaveLength(0)
    })

    it('se tait quand un des deux positionnements est clos', () => {
      expect(
        detectStaffingCollisionInterventions([
          {
            id: 'sub-1',
            needId: 'need-a',
            consultantId: 'c-1',
            consultantName: 'Antoine Rivière',
            stage: 'shortlisted',
          },
          { id: 'sub-2', needId: 'need-b', consultantId: 'c-1', consultantName: 'Antoine Rivière', stage: 'rejected' },
        ]),
      ).toHaveLength(0)
    })
  })

  it('chaque nature déclarée au contrat a une règle qui sait la produire', () => {
    // La garde qui évite qu'une nature reste une case vide dans un écran : le
    // défaut exact que ce chantier corrige.
    const produced = new Set(
      [
        ...detectStalledSubmissions(
          [
            {
              id: 's',
              submitted_at: daysAgo(30),
              first_feedback_at: null,
              closed_at: null,
              owner_id: null,
              consultant_name: null,
              account_name: null,
            },
          ],
          NOW,
        ),
        ...detectRenewalsAtRisk(
          [{ id: 'm', label: 'M', ends_on: inDays(1), user_id: null, has_open_renewal: false }],
          NOW,
        ),
        ...detectBlockedInvoicing(
          [
            {
              id: 'i',
              mission_label: null,
              period_month: '2026-01-01',
              state: 'blocked',
              invoiced_at: null,
              blockers: null,
              owner_id: null,
            },
          ],
          NOW,
        ),
        ...detectUntouchedAccounts([{ id: 'a', name: 'A', last_action_at: null, owner_id: null }], NOW),
        ...detectInactiveReps([{ user_id: 'u', name: 'U', joined_at: daysAgo(90), last_action_at: null }], NOW),
        ...detectCreditsExhausted([{ workspace_id: 'w', used: 100, limit: 100, ownerId: null }]),
        ...detectAccountsWithoutNextAction([{ id: 'an', name: 'A', created_at: daysAgo(90), owner_id: null }], NOW),
        ...detectProjectsWithoutDecision(
          [{ id: 'p', label: 'P', stage: 'negotiation', stage_entered_at: daysAgo(90), owner_id: null }],
          NOW,
        ),
        ...detectNeedsWithoutShortlist([{ id: 'n', title: 'N', status_changed_at: daysAgo(90), owner_id: null }], NOW),
        ...detectMissingTimesheets([
          { id: 't', mission_label: null, period_month: '2026-01-01', reminders_sent: 9, owner_id: null },
        ]),
        ...detectOverduePayments(
          [
            {
              id: 'o',
              mission_label: null,
              period_month: '2026-01-01',
              due_on: '2026-01-31',
              paid_at: null,
              paid_amount_cents: null,
              invoiced_amount_cents: null,
              disputed_at: null,
              dispute_resolved_at: null,
              owner_id: null,
            },
          ],
          NOW,
        ),
        ...detectMissionsWithoutEndDate(
          [
            {
              id: 'me',
              label: 'M',
              ends_on: null,
              started_on: inDays(-90),
              contract_kind: 'regie',
              user_id: null,
            },
          ],
          NOW,
        ),
        ...detectStaffingCollisionInterventions([
          { id: 'sub-1', needId: 'need-a', consultantId: 'c-1', consultantName: 'X', stage: 'shortlisted' },
          { id: 'sub-2', needId: 'need-b', consultantId: 'c-1', consultantName: 'X', stage: 'submitted' },
        ]),
      ].map(draft => draft.kind),
    )
    expect([...produced].sort()).toEqual([...INTERVENTION_KINDS].sort())
  })
})
