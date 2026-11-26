import type { BriefingAction, Task } from '@bellum/contracts'
import { BRIEFING_ACTION_KINDS, routeContractFor } from '@bellum/contracts'
import {
  BRIEFING_CONSEQUENCE_LABEL_KEYS,
  BRIEFING_VERDICT_LABEL_KEYS,
  buildAllBriefingActions,
  cardPermission,
  excludeObjectsAlreadyTasked,
} from './briefing-actions'
import { orderActionsForRole } from './briefing-role-order'

/**
 * L1 (31/10/2026) — LE MOTEUR DE CARTES : les familles sans producteur, les
 * champs du contrat que personne ne remplissait, et l'ordre global.
 *
 * Chaque test sait dire NON : il échoue sur `origin/main` d'avant ce lot pour
 * la raison qu'il nomme (genre absent, champ nul, ordre inverse).
 */

const NOW = new Date('2026-10-31T08:00:00Z')
const EMPTY = {
  now: NOW,
  meetings: [],
  conflicts: [],
  awaitingReply: [],
  unread: [],
  positiveReplies: [],
  accountsWithFreshSignal: [],
  staleNeeds: [],
  ownerId: 'u1',
}

function byKind(actions: BriefingAction[], kind: BriefingAction['kind']): BriefingAction[] {
  return actions.filter(action => action.kind === kind)
}

describe('#2095.6 — facture bloquée pour un AUTRE bloqueur que la donnée manquante', () => {
  it('produit une carte par mission, qui NOMME son bloqueur et ouvre la mission', () => {
    const actions = buildAllBriefingActions({
      ...EMPTY,
      invoicesBlocked: [{ id: 'm-1', label: 'Run SNCF', blocker: 'timesheet_disputed' }],
    })
    expect(byKind(actions, 'invoice_blocked')).toEqual([
      expect.objectContaining({
        id: 'invoice-blocked:m-1',
        labelKey: 'briefing.actions.invoiceBlockedTimesheetDisputed',
        labelVars: { label: 'Run SNCF' },
        href: '/missions/m-1',
        businessObject: expect.objectContaining({ kind: 'mission', id: 'm-1' }),
      }),
    ])
  })

  // #2095.71 — un relevé qui attend la validation du CLIENT ne se règle pas
  // aujourd'hui de notre côté : il descend sous une carte actionnable, même
  // d'une famille de rang plus bas.
  it('#2095.71 — un blocage qui attend un tiers descend sous un problème actionnable maintenant', () => {
    const actions = buildAllBriefingActions({
      ...EMPTY,
      invoicesBlocked: [{ id: 'm-1', label: 'Run SNCF', blocker: 'timesheet_not_validated' }],
      contactsBounced: [{ id: 'c-1', name: 'Jeanne Martin' }],
    })
    const kinds = actions.map(action => action.kind)
    expect(kinds.indexOf('contact_bounced')).toBeLessThan(kinds.indexOf('invoice_blocked'))
    const waiting = byKind(actions, 'invoice_blocked')[0]
    expect(waiting?.rankingAxes.find(reading => reading.axis === 'actionableNow')?.evaluated).toBe(false)
  })

  it('un blocage actionnable garde son rang — il passe devant le contact au rebond', () => {
    const actions = buildAllBriefingActions({
      ...EMPTY,
      invoicesBlocked: [{ id: 'm-1', label: 'Run SNCF', blocker: 'timesheet_rejected' }],
      contactsBounced: [{ id: 'c-1', name: 'Jeanne Martin' }],
    })
    const kinds = actions.map(action => action.kind)
    expect(kinds.indexOf('invoice_blocked')).toBeLessThan(kinds.indexOf('contact_bounced'))
  })
})

describe('#2095.10 / #2107.16 / #2095.49 — donnée critique manquante (famille Qualité des données)', () => {
  it('une mission active sans consultant affecté : la carte nomme le champ et ouvre la mission', () => {
    const actions = buildAllBriefingActions({
      ...EMPTY,
      criticalDataMissing: [{ field: 'mission_consultant', objectKind: 'mission', id: 'm-2', label: 'Audit BPCE' }],
    })
    expect(byKind(actions, 'critical_data_missing')).toEqual([
      expect.objectContaining({
        id: 'critical-data:mission_consultant:m-2',
        labelKey: 'briefing.actions.criticalDataMissionConsultant',
        href: '/missions/m-2',
      }),
    ])
  })

  it('un interlocuteur de facturation sans e-mail : ouvre la fiche du contact', () => {
    const actions = buildAllBriefingActions({
      ...EMPTY,
      criticalDataMissing: [{ field: 'billing_contact_email', objectKind: 'contact', id: 'c-3', label: 'Paul Durand' }],
    })
    expect(byKind(actions, 'critical_data_missing')[0]).toMatchObject({
      href: '/contacts/c-3',
      businessObject: { kind: 'contact', id: 'c-3' },
    })
  })
})

describe('#2095.45 — famille Missions : démarrage et avenant', () => {
  it('une mission qui démarre dans la fenêtre produit sa carte', () => {
    const actions = buildAllBriefingActions({
      ...EMPTY,
      missionsStarting: [{ id: 'm-4', label: 'Data Orange', daysUntilStart: 3, startsOn: '2026-11-03' }],
    })
    expect(byKind(actions, 'mission_starting')).toEqual([
      expect.objectContaining({
        id: 'mission-starting:m-4',
        labelVars: { label: 'Data Orange', days: 3 },
        href: '/missions/m-4',
        expiresAt: '2026-11-03T00:00:00.000Z',
      }),
    ])
  })

  it('un avenant envoyé non signé produit sa carte', () => {
    const actions = buildAllBriefingActions({
      ...EMPTY,
      amendmentsPending: [{ missionId: 'm-5', label: 'Run Total', documentName: 'Avenant n°2', days: 12 }],
    })
    expect(byKind(actions, 'mission_amendment_pending')[0]).toMatchObject({
      id: 'mission-amendment:m-5:Avenant n°2',
      href: '/missions/m-5',
      labelVars: { label: 'Run Total', document: 'Avenant n°2', days: 12 },
    })
  })
})

describe('#2095.41 — famille Contacts au-delà du rebond', () => {
  it('un contact qui n’est plus en poste produit sa carte, sur sa fiche', () => {
    const actions = buildAllBriefingActions({
      ...EMPTY,
      contactsLeft: [{ id: 'c-7', name: 'Lucie Bernard', companyName: 'Thales', leftAt: '2026-10-29T10:00:00Z' }],
    })
    expect(byKind(actions, 'contact_left')).toEqual([
      expect.objectContaining({
        id: 'contact-left:c-7',
        labelVars: { name: 'Lucie Bernard', company: 'Thales' },
        href: '/contacts/c-7',
        fact: expect.objectContaining({
          provenance: expect.objectContaining({ observedAt: '2026-10-29T10:00:00.000Z' }),
        }),
      }),
    ])
  })
})

describe('#2107.15 — connecteur cassé : CRM et déconnexion', () => {
  it('un CRM dont le jeton ne se rafraîchit plus produit une carte « à reconnecter »', () => {
    const actions = buildAllBriefingActions({
      ...EMPTY,
      brokenConnectors: [{ tool: 'crm', state: 'disconnected' }],
    })
    expect(byKind(actions, 'connector_broken')).toEqual([
      expect.objectContaining({
        id: 'connector-broken:crm',
        labelKey: 'briefing.actions.connectorBrokenCrm',
        context: expect.objectContaining({ labelKey: 'briefing.context.connectorDisconnected' }),
        href: '/integrations',
      }),
    ])
  })

  it('une messagerie déconnectée (jeton refusé) n’est pas « en lecture seule »', () => {
    const actions = buildAllBriefingActions({
      ...EMPTY,
      brokenConnectors: [{ tool: 'mailbox', state: 'disconnected' }],
    })
    expect(byKind(actions, 'connector_broken')[0]?.context?.labelKey).toBe('briefing.context.connectorDisconnected')
  })
})

describe('#2095.59 / #2095.85 — le verdict, la conséquence, la permission', () => {
  const everyFamily = buildAllBriefingActions({
    ...EMPTY,
    contactsBounced: [{ id: 'c-1', name: 'Jeanne' }],
    overdueInvoices: [{ id: 'm-1', label: 'Run', daysOverdue: 20 }],
    missionsEnding: [{ id: 'm-2', label: 'Audit', daysUntilEnd: 12 }],
    accountsWithFreshSignal: [
      { accountId: 'a-1', companyName: 'Vinci', detectedAt: '2026-10-30T08:00:00Z', detectionExact: true },
    ],
  })

  it('chaque genre de carte a SA clé de verdict — jamais un genre muet', () => {
    for (const kind of BRIEFING_ACTION_KINDS) {
      expect(BRIEFING_VERDICT_LABEL_KEYS).toContain(`briefing.verdict.${kindKey(kind)}`)
    }
  })

  it('le verdict est rempli, avec les variables de la carte', () => {
    for (const action of everyFamily) {
      expect(action.verdict).toEqual({
        labelKey: `briefing.verdict.${kindKey(action.kind)}`,
        labelVars: action.labelVars,
      })
    }
  })

  it('la conséquence n’est remplie QUE pour une famille qui la sait — jamais une menace devinée', () => {
    const overdue = everyFamily.find(action => action.kind === 'payment_overdue')
    expect(overdue?.consequence?.labelKey).toBe('briefing.consequence.paymentOverdue')
    // Un signal de compte ne sait rien de ce qui arrive si on ne fait rien.
    expect(everyFamily.find(action => action.kind === 'account')?.consequence).toBeNull()
    for (const key of BRIEFING_CONSEQUENCE_LABEL_KEYS) expect(key).toMatch(/^briefing\.consequence\./)
  })

  it('le temps estimé reste nul : aucune durée n’est OBSERVÉE dans ce module', () => {
    for (const action of everyFamily) expect(action.estimatedMinutes).toBeNull()
  })

  it('#2095.34 — la permission est celle que le catalogue exige pour l’écran ouvert', () => {
    expect(cardPermission('/pilotage/finance')).toEqual(['finance:read', 'finance:read:own'])
    expect(cardPermission('/missions/m-1')).toBeNull()
    expect(cardPermission(null)).toBeNull()
    for (const action of everyFamily) {
      expect(action.permission).toEqual(
        action.href ? (routeContractFor(action.href.split('?')[0] ?? '')?.requiredPermission ?? null) : null,
      )
    }
  })
})

describe('#2095.70 — une mission à J-30 passe avant un compte potentiel', () => {
  it('la fin de mission sort devant le signal de compte', () => {
    const actions = buildAllBriefingActions({
      ...EMPTY,
      accountsWithFreshSignal: [
        { accountId: 'a-1', companyName: 'Vinci', detectedAt: '2026-10-30T08:00:00Z', detectionExact: true },
      ],
      missionsEnding: [{ id: 'm-2', label: 'Audit', daysUntilEnd: 28 }],
    })
    expect(actions.map(action => action.kind)).toEqual(['mission_end', 'account'])
  })
})

describe('L1 — l’ordre GLOBAL survit à la lecture du rôle (l’ordre seul change, c76)', () => {
  const cards = buildAllBriefingActions({
    ...EMPTY,
    accountsWithFreshSignal: [
      { accountId: 'a-1', companyName: 'Vinci', detectedAt: '2026-10-30T08:00:00Z', detectionExact: true },
    ],
    missionsEnding: [{ id: 'm-2', label: 'Audit', daysUntilEnd: 28 }],
    invoicesBlocked: [{ id: 'm-9', label: 'Run', blocker: 'timesheet_not_validated' }],
    contactsBounced: [{ id: 'c-1', name: 'Jeanne' }],
  })

  it.each(['sales', 'owner', 'admin', 'recruiter'] as const)(
    '#2095.70 — lecture « %s » : la mission à J-30 reste devant le compte potentiel',
    role => {
      const kinds = orderActionsForRole(cards, role).map(action => action.kind)
      expect(kinds.indexOf('mission_end')).toBeLessThan(kinds.indexOf('account'))
    },
  )

  it.each(['sales', 'owner', 'admin', 'recruiter'] as const)(
    '#2095.71 — lecture « %s » : le blocage qui attend un tiers ferme la marche, sans disparaître',
    role => {
      const ordered = orderActionsForRole(cards, role)
      expect(ordered).toHaveLength(cards.length)
      expect(ordered[ordered.length - 1]?.kind).toBe('invoice_blocked')
    },
  )

  it('une mission à J-45 garde la place que sa lecture lui donne', () => {
    const later = buildAllBriefingActions({
      ...EMPTY,
      accountsWithFreshSignal: [
        { accountId: 'a-1', companyName: 'Vinci', detectedAt: '2026-10-30T08:00:00Z', detectionExact: true },
      ],
      missionsEndingSoon: [{ id: 'm-3', title: 'Run', renewal: 'j45', days: 44, thresholdDays: 45 }],
    })
    const kinds = orderActionsForRole(later, 'sales').map(action => action.kind)
    expect(kinds).toEqual(['account', 'mission_end'])
  })
})

describe('#2095.60 — proposer un angle', () => {
  it('le compte qui a bougé porte l’angle d’attaque DÉJÀ calculé pour lui', () => {
    const actions = buildAllBriefingActions({
      ...EMPTY,
      accountsWithFreshSignal: [
        {
          accountId: 'a-1',
          companyName: 'Vinci',
          detectedAt: '2026-10-30T08:00:00Z',
          detectionExact: true,
          angle: { id: 'ang-1', title: 'Migration cloud des filiales' },
        },
      ],
    })
    expect(actions[0]?.preparedArtifacts).toEqual([
      expect.objectContaining({
        id: 'angle:ang-1',
        kind: 'angle',
        labelKey: 'briefing.artifacts.angle',
        labelVars: { title: 'Migration cloud des filiales' },
        href: '/accounts/a-1',
      }),
    ])
  })

  it('sans angle calculé, rien de préparé — jamais un angle inventé', () => {
    const actions = buildAllBriefingActions({
      ...EMPTY,
      accountsWithFreshSignal: [
        { accountId: 'a-1', companyName: 'Vinci', detectedAt: '2026-10-30T08:00:00Z', detectionExact: true },
      ],
    })
    expect(actions[0]?.preparedArtifacts).toEqual([])
  })
})

describe('#2095.74 — un objet n’apparaît pas à la fois comme priorité et comme tâche du jour', () => {
  const card = buildAllBriefingActions({
    ...EMPTY,
    accountsWithFreshSignal: [
      {
        accountId: '11111111-1111-4111-8111-111111111111',
        companyName: 'Vinci',
        detectedAt: null,
        detectionExact: true,
      },
    ],
  })

  function task(partial: Partial<Task>): Task {
    return {
      id: 't-1',
      status: 'todo',
      dueOn: '2026-10-31',
      accountId: null,
      contactId: null,
      projectId: null,
      ...partial,
    } as Task
  }

  it('une tâche due aujourd’hui sur le même compte retire la carte', () => {
    const kept = excludeObjectsAlreadyTasked(card, [task({ accountId: '11111111-1111-4111-8111-111111111111' })], NOW)
    expect(kept).toEqual([])
  })

  it('une tâche en retard sur le même compte la retire aussi', () => {
    const kept = excludeObjectsAlreadyTasked(
      card,
      [task({ accountId: '11111111-1111-4111-8111-111111111111', dueOn: '2026-10-20' })],
      NOW,
    )
    expect(kept).toEqual([])
  })

  it('une tâche plus tard dans le mois NE la retire PAS — elle n’est pas dans la journée', () => {
    const kept = excludeObjectsAlreadyTasked(
      card,
      [task({ accountId: '11111111-1111-4111-8111-111111111111', dueOn: '2026-11-20' })],
      NOW,
    )
    expect(kept).toHaveLength(1)
  })

  it('une tâche fermée ne retire rien', () => {
    const kept = excludeObjectsAlreadyTasked(
      card,
      [task({ accountId: '11111111-1111-4111-8111-111111111111', status: 'done' })],
      NOW,
    )
    expect(kept).toHaveLength(1)
  })
})

/** `invoice_blocked` → `invoiceBlocked` : la clé i18n suit la casse des autres familles. */
function kindKey(kind: string): string {
  return kind.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())
}
