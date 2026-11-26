import { assessInvoiceReadiness, invoicingNeedsTimesheet } from '@bellum/contracts'
import { buildTimesheetLine, summarizeTimesheets, type TimesheetSource } from './timesheet-view'

const base: TimesheetSource = {
  missionId: 'm-1',
  missionLabel: 'Run plateforme',
  accountName: 'ACME',
  contractKind: 'regie',
  startedOn: null,
  endsOn: null,
  consultantId: 'c-1',
  consultantName: 'A. Dupont',
  row: null,
  notApplicable: null,
}

const line = (source: Partial<TimesheetSource>, month = '2026-07-01', today = '2026-08-21') =>
  buildTimesheetLine({ ...base, ...source }, month, { today })

describe('la vue du 5 du mois', () => {
  it('distingue un mois ATTENDU d’un mois MANQUANT', () => {
    // Le mois en cours n'est pas un oubli : relancer quelqu'un pour un mois
    // qu'il n'a pas fini de vivre est la meilleure façon de faire ignorer les
    // relances suivantes.
    expect(line({}, '2026-08-01', '2026-08-21').status).toBe('expected')
    expect(line({}, '2026-07-01', '2026-08-21').status).toBe('missing')
  })

  it('ne réclame RIEN à un forfait', () => {
    const forfait = line({ contractKind: 'forfait' })
    expect(forfait.status).toBe('not_required')
    expect(forfait.blocksInvoicing).toBe(false)
    // Ni jours attendus : un forfait se facture aux jalons.
    expect(forfait.expectedDays).toBeNull()
  })

  it('un relevé DÉPOSÉ compte son écart, quelle que soit la nature du contrat', () => {
    // La nature décide si on RÉCLAME un relevé ; elle ne décide pas du sort
    // d'un relevé qui existe. Sans cette distinction, l'écran des relevés
    // disait « rien ne bloque » pendant que celui de la facturation annonçait
    // un écart non expliqué sur la même ligne.
    const filed = line({
      contractKind: 'inconnu',
      row: {
        id: 't-1',
        days: 12,
        status: 'submitted',
        expectedDays: 21,
        gapExplanation: null,
        approverName: null,
        validatedByClientAt: null,
        anomalies: [],
        remindersSent: 0,
        lastReminderAt: null,
        rejectedAt: null,
        rejectionReason: null,
        contestedDays: null,
        correctionDeadline: null,
        submittedByName: null,
        internalReviewedAt: null,
        internalReviewedByName: null,
      },
    })
    expect(filed.gap).toBe(-9)
    expect(filed.blocksInvoicing).toBe(true)
  })

  it('ne réclame rien non plus quand la nature du contrat est inconnue', () => {
    // Réclamer un relevé à une mission dont personne n'a dit la nature
    // produirait une alerte fausse sur tout l'historique.
    expect(line({ contractKind: 'inconnu' }).status).toBe('not_required')
  })

  it('rend `null` et non 0 quand rien n’a été déposé', () => {
    expect(line({}).days).toBeNull()
    expect(line({}).gap).toBeNull()
    expect(line({}).gapKind).toBe('unknown')
  })

  it('compte les jours attendus d’un mois PARTIEL', () => {
    // Une mission qui démarre le 20 juillet 2026 (un lundi) : 20→31 juillet,
    // soit 10 jours ouvrés. Sans ce calcul, elle se voyait reprocher 13 jours
    // manquants dès son premier mois.
    expect(line({ startedOn: '2026-07-20' }).expectedDays).toBe(10)
  })

  it('un écart NÉGATIF bloque la facturation', () => {
    // Le défaut d'origine : seul un écart positif produisait une anomalie. Un
    // relevé à 12 jours sur un mois à 23 passait « prêt à facturer ».
    const under = line({
      row: {
        id: 't-1',
        days: 12,
        status: 'submitted',
        expectedDays: 23,
        gapExplanation: null,
        approverName: null,
        validatedByClientAt: null,
        anomalies: [],
        remindersSent: 0,
        lastReminderAt: null,
        rejectedAt: null,
        rejectionReason: null,
        contestedDays: null,
        correctionDeadline: null,
        submittedByName: null,
        internalReviewedAt: null,
        internalReviewedByName: null,
      },
    })
    expect(under.gap).toBe(-11)
    expect(under.gapKind).toBe('under')
    expect(under.blocksInvoicing).toBe(true)
  })

  it('une EXPLICATION lève le blocage', () => {
    const explained = line({
      row: {
        id: 't-1',
        days: 12,
        status: 'submitted',
        expectedDays: 23,
        gapExplanation: 'Congés du 6 au 17',
        approverName: null,
        validatedByClientAt: null,
        anomalies: [],
        remindersSent: 0,
        lastReminderAt: null,
        rejectedAt: null,
        rejectionReason: null,
        contestedDays: null,
        correctionDeadline: null,
        submittedByName: null,
        internalReviewedAt: null,
        internalReviewedByName: null,
      },
    })
    expect(explained.blocksInvoicing).toBe(false)
  })

  // #2196.16 — la colonne « approbateur » : celui qui a ENREGISTRÉ la
  // validation client, jamais le contact client lui-même.
  it('nomme QUI a enregistré la validation client', () => {
    const validated = line({
      row: {
        id: 't-1',
        days: 21,
        status: 'validated',
        expectedDays: 21,
        gapExplanation: null,
        approverName: 'A. Martin',
        validatedByClientAt: '2026-08-03T09:00:00.000Z',
        anomalies: [],
        remindersSent: 0,
        lastReminderAt: null,
        rejectedAt: null,
        rejectionReason: null,
        contestedDays: null,
        correctionDeadline: null,
        submittedByName: null,
        internalReviewedAt: null,
        internalReviewedByName: null,
      },
    })
    expect(validated.approverName).toBe('A. Martin')
  })

  it('ne nomme PERSONNE tant que rien n’a été déposé — absent n’est pas une chaîne vide', () => {
    expect(line({}).approverName).toBeNull()
  })

  // #2415.5 — QUI a déclaré, distinct du consultant DONT c'est le mois : un
  // ops peut déclarer un relevé pour un consultant qui n'a pas lui-même
  // saisi ses jours.
  it('#2415.5 — nomme QUI a déclaré, distinct du consultant dont c’est le mois', () => {
    const filed = line({
      consultantName: 'J. Dupuis',
      row: {
        id: 't-1',
        days: 20,
        status: 'submitted',
        expectedDays: 20,
        gapExplanation: null,
        approverName: null,
        validatedByClientAt: null,
        anomalies: [],
        remindersSent: 0,
        lastReminderAt: null,
        rejectedAt: null,
        rejectionReason: null,
        contestedDays: null,
        correctionDeadline: null,
        submittedByName: 'M. Ops',
        internalReviewedAt: null,
        internalReviewedByName: null,
      },
    })
    expect(filed.consultantName).toBe('J. Dupuis')
    expect(filed.submittedByName).toBe('M. Ops')
  })

  it('#2415.5 — ne nomme personne quand la trace est historique — `null`, jamais inventé', () => {
    expect(line({}).submittedByName).toBeNull()
  })

  it('garde la charge FIGÉE au dépôt plutôt que de la recalculer', () => {
    // Un jour férié ajouté au catalogue de l'espace ne doit pas rouvrir l'écart
    // d'un relevé déjà validé.
    const frozen = line({
      row: {
        id: 't-1',
        days: 21,
        status: 'validated',
        expectedDays: 21,
        gapExplanation: null,
        approverName: null,
        validatedByClientAt: '2026-08-03T09:00:00.000Z',
        anomalies: [],
        remindersSent: 0,
        lastReminderAt: null,
        rejectedAt: null,
        rejectionReason: null,
        contestedDays: null,
        correctionDeadline: null,
        submittedByName: null,
        internalReviewedAt: null,
        internalReviewedByName: null,
      },
    })
    expect(frozen.expectedDays).toBe(21)
    expect(frozen.gap).toBe(0)
    expect(frozen.blocksInvoicing).toBe(false)
  })

  it('porte l’identifiant du RELEVÉ, et `null` quand rien n’a été déposé', () => {
    // C'est lui que visent « expliquer l'écart » et « enregistrer la
    // validation client ». Envoyer l'identifiant de la mission écrirait sur la
    // mauvaise ligne, et l'écran afficherait un succès.
    expect(line({}).timesheetId).toBeNull()
    expect(
      line({
        row: {
          id: 't-42',
          days: 20,
          status: 'submitted',
          expectedDays: 20,
          gapExplanation: null,
          approverName: null,
          validatedByClientAt: null,
          anomalies: [],
          remindersSent: 0,
          lastReminderAt: null,
          rejectedAt: null,
          rejectionReason: null,
          contestedDays: null,
          correctionDeadline: null,
          submittedByName: null,
          internalReviewedAt: null,
          internalReviewedByName: null,
        },
      }).timesheetId,
    ).toBe('t-42')
  })
})

describe('#2196.33 / #2196.34 — rappel AVANT l’échéance, distinct du retard', () => {
  // Le calendrier de retard (`dueReminders`, APRÈS la fin du mois) garde
  // exactement son échelle [5, 12, 20] : ce rappel-ci ne le touche pas, il ne
  // consomme aucun rang de relance et ne pousse jamais vers l'escalade.
  it('ne dit rien tant que le mois n’est pas presque fini', () => {
    // 2026-08-01 : le mois court jusqu'au 31 août. Le 20 août, il reste 11
    // jours — trop tôt pour un rappel.
    expect(line({}, '2026-08-01', '2026-08-20').preDeadlineReminder).toBeNull()
  })

  it('nomme le nombre de jours restants, jamais un compte silencieux', () => {
    // 3 jours avant la fin (31 août) : le 28 août.
    expect(line({}, '2026-08-01', '2026-08-28').preDeadlineReminder).toEqual({
      kind: 'before',
      daysRemaining: 3,
    })
    expect(line({}, '2026-08-01', '2026-08-30').preDeadlineReminder).toEqual({
      kind: 'before',
      daysRemaining: 1,
    })
  })

  it('distingue le jour même de l’échéance', () => {
    expect(line({}, '2026-08-01', '2026-08-31').preDeadlineReminder).toEqual({ kind: 'dueToday' })
  })

  it('se tait une fois le mois clos — c’est le rappel de retard qui prend le relais', () => {
    expect(line({}, '2026-07-01', '2026-08-21').status).toBe('missing')
    expect(line({}, '2026-07-01', '2026-08-21').preDeadlineReminder).toBeNull()
  })

  it('se tait dès qu’un relevé existe — un rappel n’a plus rien à annoncer', () => {
    const filed = line({
      row: {
        id: 't-9',
        days: 5,
        status: 'submitted',
        expectedDays: 5,
        gapExplanation: null,
        approverName: null,
        validatedByClientAt: null,
        anomalies: [],
        remindersSent: 0,
        lastReminderAt: null,
        rejectedAt: null,
        rejectionReason: null,
        contestedDays: null,
        correctionDeadline: null,
        submittedByName: null,
        internalReviewedAt: null,
        internalReviewedByName: null,
      },
    })
    expect(filed.preDeadlineReminder).toBeNull()
  })
})

describe('summarizeTimesheets', () => {
  it('ne compte pas « 0 jour déclaré » quand personne n’a déposé', () => {
    expect(summarizeTimesheets([line({}), line({})]).declaredDays).toBeNull()
  })

  it('range chaque ligne dans une seule case', () => {
    const rows = [
      // Mois de juillet, aujourd'hui le 21 août : le mois est CLOS et rien
      // n'est arrivé — c'est `late`, pas `awaiting` (#2196.6, 17/09/2026).
      line({}, '2026-07-01'),
      line({ contractKind: 'forfait' }),
      line({
        row: {
          id: 't-1',
          days: 21,
          status: 'validated',
          expectedDays: 21,
          gapExplanation: null,
          approverName: null,
          validatedByClientAt: null,
          anomalies: [],
          remindersSent: 0,
          lastReminderAt: null,
          rejectedAt: null,
          rejectionReason: null,
          contestedDays: null,
          correctionDeadline: null,
          submittedByName: null,
          internalReviewedAt: null,
          internalReviewedByName: null,
        },
      }),
    ]
    const summary = summarizeTimesheets(rows)
    expect(summary.total).toBe(3)
    expect(summary.awaiting).toBe(0)
    expect(summary.late).toBe(1)
    expect(summary.validated).toBe(1)
    expect(summary.notRequired).toBe(1)
    expect(summary.declaredDays).toBe(21)
  })

  /**
   * #2196.6 — « En retard » n'est pas « en attente ».
   *
   * Les deux vivaient fondues dans `awaiting` depuis l'origine : la résumé
   * pouvait dire « 12 en attente » sans dire combien de ces douze sont un mois
   * encore en cours (rien à reprocher) et combien sont un mois CLOS où rien
   * n'est arrivé (le cas le plus coûteux du module, cf. le docblock du
   * fichier). Le résumé du CRA (#2196.3, #2196.6) réclame les deux à part.
   */
  it('sépare « en attente » (le mois court encore) de « en retard » (le mois est clos)', () => {
    const summary = summarizeTimesheets([
      line({}, '2026-08-01', '2026-08-21'), // expected — mois en cours
      line({}, '2026-07-01', '2026-08-21'), // missing — mois clos, rien reçu
    ])
    expect(summary.awaiting).toBe(1)
    expect(summary.late).toBe(1)
  })

  /**
   * #2196.24 — un relevé ESCALADÉ ne compte ni « en retard » ni « en attente » :
   * il a franchi le seuil où le sujet remonte à un humain, et le confondre
   * avec les deux premiers referait disparaître exactement ce que la colonne
   * « Statut » existe pour montrer.
   */
  it('compte les relevés ESCALADÉS à part, hors de « en retard »', () => {
    const summary = summarizeTimesheets([
      line({
        row: {
          id: 't-esc',
          days: 0,
          status: 'escalated',
          expectedDays: 21,
          gapExplanation: null,
          approverName: null,
          validatedByClientAt: null,
          anomalies: [],
          remindersSent: 3,
          lastReminderAt: '2026-08-15T00:00:00.000Z',
          rejectedAt: null,
          rejectionReason: null,
          contestedDays: null,
          correctionDeadline: null,
          submittedByName: null,
          internalReviewedAt: null,
          internalReviewedByName: null,
        },
      }),
    ])
    expect(summary.escalated).toBe(1)
    expect(summary.late).toBe(0)
    expect(summary.awaiting).toBe(0)
  })
})

/**
 * Les deux écrans disent la MÊME chose du même relevé.
 *
 * Le défaut de la recette du 21/08/2026 : l'écran des relevés annonçait « rien
 * ne bloque » sur une ligne que l'écran de facturation refusait pour
 * `unexplained_gap`. Celui des deux qu'on croit décide de ce qu'on facture, et
 * rien ne permettait de savoir lequel avait raison.
 */
describe('la vue des relevés et celle de la facturation s’accordent', () => {
  const filed = (over: { gap?: number; explanation?: string | null; kind?: 'regie' | 'forfait' | 'inconnu' }) => {
    const days = 21 + (over.gap ?? 0)
    const view = buildTimesheetLine(
      {
        ...base,
        contractKind: over.kind ?? 'inconnu',
        row: {
          id: 't-1',
          days,
          status: 'submitted',
          expectedDays: 21,
          gapExplanation: over.explanation ?? null,
          approverName: null,
          validatedByClientAt: null,
          anomalies: [],
          remindersSent: 0,
          lastReminderAt: null,
          rejectedAt: null,
          rejectionReason: null,
          contestedDays: null,
          correctionDeadline: null,
          submittedByName: null,
          internalReviewedAt: null,
          internalReviewedByName: null,
        },
      },
      '2026-07-01',
      { today: '2026-08-21' },
    )
    const readiness = assessInvoiceReadiness({
      timesheet: {
        status: 'submitted',
        days,
        anomalies: [],
        gap: view.gap,
        gapExplanation: over.explanation ?? null,
      },
      dailyRateCents: 60_000,
      requiresPo: false,
      poNumber: null,
      invoicedAt: null,
      expectsTimesheet: invoicingNeedsTimesheet(over.kind ?? 'inconnu'),
    })
    return { view, blockedByReadiness: readiness.blockers.includes('unexplained_gap') }
  }

  it.each([
    ['un écart non expliqué', { gap: -9 }],
    ['un écart en trop', { gap: 3 }],
    ['un écart expliqué', { gap: -9, explanation: 'Congés' }],
    ['aucun écart', { gap: 0 }],
  ])('%s : les deux vues tranchent pareil', (_label, over) => {
    const { view, blockedByReadiness } = filed(over)
    expect(view.blocksInvoicing).toBe(blockedByReadiness)
  })
})

/**
 * Le rejet motivé, vu de la ligne et vu du résumé.
 *
 * Le geste manquait entièrement : un relevé pouvait être validé, contesté,
 * attendu ou manquant — jamais renvoyé à son auteur AVEC la raison. Ce qui suit
 * garde les trois choses qui font qu'un rejet est utile plutôt que décoratif :
 * il se VOIT, il BLOQUE, et il ne se confond avec aucun autre état.
 */
describe('un relevé rejeté', () => {
  const rejectedRow = (over: Partial<NonNullable<TimesheetSource['row']>> = {}) => ({
    id: 't-rejected',
    days: 21,
    status: 'rejected' as const,
    expectedDays: 21,
    gapExplanation: null,
    approverName: null,
    validatedByClientAt: null,
    anomalies: [],
    remindersSent: 0,
    lastReminderAt: null,
    rejectedAt: '2026-08-10T09:00:00.000Z',
    rejectionReason: 'Trois jours de juin imputés à juillet',
    contestedDays: null,
    correctionDeadline: null,
    submittedByName: null,
    internalReviewedAt: null,
    internalReviewedByName: null,
    ...over,
  })

  it('porte son motif et sa date jusqu’à l’écran', () => {
    // Le motif voyage : sans lui, l'écran afficherait « rejeté » tout court, et
    // le consultant à qui on renvoie le relevé ne saurait pas quoi corriger.
    const view = line({ row: rejectedRow() })
    expect(view.status).toBe('rejected')
    expect(view.rejectionReason).toBe('Trois jours de juin imputés à juillet')
    expect(view.rejectedAt).toBe('2026-08-10T09:00:00.000Z')
  })

  // #2415.7 — la quantité contestée et la deadline de correction voyagent
  // jusqu'à l'écran, comme le motif juste au-dessus.
  it('#2415.7 — porte la quantité contestée et la deadline de correction jusqu’à l’écran', () => {
    const view = line({ row: rejectedRow({ contestedDays: 3, correctionDeadline: '2026-08-20' }) })
    expect(view.contestedDays).toBe(3)
    expect(view.correctionDeadline).toBe('2026-08-20')
  })

  it('#2415.7 — reste `null` quand le rejet n’en porte pas encore (données historiques)', () => {
    const view = line({ row: rejectedRow() })
    expect(view.contestedDays).toBeNull()
    expect(view.correctionDeadline).toBeNull()
  })

  it('BLOQUE la facturation même quand l’écart est nul', () => {
    // C'est tout l'intérêt : 21 jours déclarés sur 21 attendus, écart à zéro, et
    // pourtant un humain vient de refuser la ligne. S'en remettre au seul écart
    // afficherait « rien ne bloque » sur un relevé que personne n'assume.
    const view = line({ row: rejectedRow() })
    expect(view.gap).toBe(0)
    expect(view.blocksInvoicing).toBe(true)
  })

  it('bloque aussi quand une explication d’écart traîne — le rejet prime', () => {
    const view = line({ row: rejectedRow({ days: 12, gapExplanation: 'Congés' }) })
    expect(view.blocksInvoicing).toBe(true)
  })

  it('n’est ni « en attente », ni « sans relevé » dans le résumé', () => {
    // Le piège précis : le `else` fourre-tout du résumé rangeait un rejet parmi
    // les lignes dont il n'y a rien à faire.
    const summary = summarizeTimesheets([line({ row: rejectedRow() })])
    expect(summary.rejected).toBe(1)
    expect(summary.notRequired).toBe(0)
    expect(summary.awaiting).toBe(0)
    expect(summary.submitted).toBe(0)
    expect(summary.blocking).toBe(1)
  })

  it('garde ses jours déclarés — on archive, on ne supprime pas', () => {
    // Un rejet ne fait pas disparaître ce qui a été saisi : le mois reste
    // comptabilisé pour ce qu'il déclare, avec un refus en plus.
    const summary = summarizeTimesheets([line({ row: rejectedRow({ days: 12 }) })])
    expect(summary.declaredDays).toBe(12)
  })

  it('laisse la trace du rejet après un REDÉPÔT — le statut change, le motif reste', () => {
    // `submitTimesheet` ne refuse que les relevés `validated` : un relevé rejeté
    // repasse donc en `submitted` sans qu'aucune porte ne s'y oppose, et sans
    // effacer les colonnes de rejet. Un rejet dont on ne peut pas sortir serait
    // une impasse ; un rejet qu'on efface en sortant serait un oubli.
    const view = line({ row: rejectedRow({ status: 'submitted', days: 21 }) })
    expect(view.status).toBe('submitted')
    expect(view.rejectionReason).toBe('Trois jours de juin imputés à juillet')
    // Redéposé et sans écart : plus rien ne bloque.
    expect(view.blocksInvoicing).toBe(false)
  })

  it('n’invente pas de rejet là où il n’y en a pas', () => {
    const view = line({
      row: {
        id: 't-1',
        days: 21,
        status: 'submitted',
        expectedDays: 21,
        gapExplanation: null,
        approverName: null,
        validatedByClientAt: null,
        anomalies: [],
        remindersSent: 0,
        lastReminderAt: null,
        rejectedAt: null,
        rejectionReason: null,
        contestedDays: null,
        correctionDeadline: null,
        submittedByName: null,
        internalReviewedAt: null,
        internalReviewedByName: null,
      },
    })
    expect(view.rejectedAt).toBeNull()
    expect(view.rejectionReason).toBeNull()
    expect(view.blocksInvoicing).toBe(false)
  })

  it('une ligne sans relevé n’a ni motif ni date de rejet', () => {
    expect(line({}).rejectedAt).toBeNull()
    expect(line({}).rejectionReason).toBeNull()
  })

  it('les DEUX vues tranchent pareil — l’écran des relevés et celui de la facturation', () => {
    // Le trou, trouvé par le compilateur : `ReadinessInput` recopiait la liste
    // des statuts au lieu de l'importer, si bien qu'un relevé rejeté ne
    // produisait AUCUN bloqueur — il tombait au même rang que `validated`, et
    // le mois partait « prêt à facturer » pendant que cet écran-ci disait
    // l'inverse sur la même ligne.
    const view = line({ row: rejectedRow() })
    const readiness = assessInvoiceReadiness({
      timesheet: {
        status: 'rejected',
        days: 21,
        anomalies: [],
        gap: view.gap,
        gapExplanation: null,
      },
      dailyRateCents: 60_000,
      requiresPo: false,
      poNumber: null,
      invoicedAt: null,
      expectsTimesheet: invoicingNeedsTimesheet('regie'),
    })

    expect(view.blocksInvoicing).toBe(true)
    expect(readiness.blockers).toContain('timesheet_rejected')
    expect(readiness.state).not.toBe('ready')
  })
})

/**
 * #2196.31 — l'exception « non applicable » PRIME sur la déduction du contrat,
 * pour CE mois seulement, et jamais sur un relevé déposé.
 */
describe('#2196.31 — une exception tracée prime sur la déduction du contrat', () => {
  const exception = {
    id: 'x-1',
    reason: 'Congé sans solde tout le mois',
    markedAt: '2026-08-03T09:00:00.000Z',
    markedByName: 'Louise Martin',
  }
  const placeholder = {
    id: 't-9',
    days: 0,
    status: 'expected' as const,
    expectedDays: null,
    gapExplanation: null,
    approverName: null,
    validatedByClientAt: null,
    anomalies: [],
    remindersSent: 1,
    lastReminderAt: null,
    rejectedAt: null,
    rejectionReason: null,
    contestedDays: null,
    correctionDeadline: null,
    submittedByName: null,
    internalReviewedAt: null,
    internalReviewedByName: null,
  }

  it('une régie MANQUANTE marquée non applicable passe `not_required`, sans charge attendue ni blocage', () => {
    const marked = line({ notApplicable: exception })
    expect(marked.status).toBe('not_required')
    expect(marked.expectedDays).toBeNull()
    expect(marked.gap).toBeNull()
    expect(marked.blocksInvoicing).toBe(false)
    // La trace voyage avec la ligne : qui, quand, pourquoi.
    expect(marked.notApplicable).toEqual(exception)
  })

  it('couvre aussi la ligne OUVERTE à vide (`openExpected`) — et n’y affiche pas « 0 jour »', () => {
    const marked = line({ row: placeholder, notApplicable: exception })
    expect(marked.status).toBe('not_required')
    expect(marked.days).toBeNull()
  })

  it('ne couvre JAMAIS un relevé déposé : le fait l’emporte sur l’exception', () => {
    const filed = line({ row: { ...placeholder, status: 'submitted', days: 18 }, notApplicable: exception })
    expect(filed.status).toBe('submitted')
    expect(filed.days).toBe(18)
  })

  it('sans exception, la déduction reprend — « Annuler » rend le mois manquant', () => {
    expect(line({ notApplicable: null }).status).toBe('missing')
  })

  it('le résumé la compte parmi les non requis, jamais parmi les retards', () => {
    const summary = summarizeTimesheets([line({ notApplicable: exception }), line({})])
    expect(summary.notRequired).toBe(1)
    expect(summary.late).toBe(1)
  })
})
