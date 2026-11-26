import {
  APPROVAL_THRESHOLD_UNBOUNDED,
  AUTOMATION_LEVEL_ORDER,
  DEFAULT_APPROVAL_SETTINGS,
  type ApprovalSettings,
  type WorkflowStep,
} from '@bellum/contracts'
import {
  atLeast,
  canAssign,
  canDecide,
  canSnooze,
  decideApproval,
  demandsAHuman,
  levelForStep,
  resolveSettings,
} from './approval-policy'

/**
 * La politique d'approbation (addendum final p25).
 *
 * Elle est pure, donc testable exhaustivement — et elle DOIT l'être : c'est la
 * seule chose entre « le copilote a préparé un envoi » et « quatre cents
 * personnes ont reçu un email ». Les tests décrivent le barème en français
 * plutôt qu'en niveaux, pour qu'une relecture produit puisse le vérifier.
 */

function step(over: Partial<WorkflowStep> = {}): WorkflowStep {
  return {
    key: 'k',
    intentType: 'create_crm_note',
    intent: 'Écrire une note',
    capability: 'crm',
    permission: 'crm:write',
    estimatedCredits: 0,
    risk: 'low',
    expectedResult: 'La note existe',
    dependsOn: [],
    retry: { maxAttempts: 1, backoffSeconds: 30, retryOnUnknown: false },
    ...over,
  }
}

const SETTINGS = DEFAULT_APPROVAL_SETTINGS

describe('niveau exigé par un pas', () => {
  it('un pas irréversible demande au moins un clic, quel que soit le réglage', () => {
    // Un espace peut se dire « confiant » ; ça ne rend pas un email rattrapable.
    const permissive: ApprovalSettings = { ...SETTINGS, defaultLevel: 'n1_prepare' }
    expect(levelForStep(step({ risk: 'irreversible' }), permissive)).toBe('n2_user_approval')
  })

  it('un pas qui coûte des crédits demande au moins un clic', () => {
    const permissive: ApprovalSettings = { ...SETTINGS, defaultLevel: 'n1_prepare' }
    expect(levelForStep(step({ estimatedCredits: 1 }), permissive)).toBe('n2_user_approval')
  })

  it('une écriture INTERNE réversible et gratuite suit le réglage de l’espace', () => {
    // #4016 L6 — l'exemple était une note CRM : elle garde désormais son go
    // (bloc suivant). Une épingle de mémoire, elle, reste chez nous.
    const internal = step({ intentType: 'pin_memory_fact', capability: 'memory' })
    expect(levelForStep(internal, { ...SETTINGS, defaultLevel: 'n4_bounded_auto' })).toBe('n4_bounded_auto')
    expect(levelForStep(internal, { ...SETTINGS, defaultLevel: 'n5_extended_auto' })).toBe('n5_extended_auto')
    expect(levelForStep(internal, SETTINGS)).toBe('n2_user_approval')
  })
})

describe('niveau exigé par un run', () => {
  it('prend le pas le plus exigeant', () => {
    const decision = decideApproval({
      steps: [step(), step({ key: 'send', risk: 'irreversible' })],
      workflowMinimum: 'n1_prepare',
      targetCount: 1,
      estimatedCredits: 0,
      settings: SETTINGS,
    })
    expect(decision.requiredLevel).toBe('n2_user_approval')
    expect(decision.reasons).toContain('irreversible')
  })

  it('passe en validation responsable au seuil de volume — et dit pourquoi', () => {
    const decision = decideApproval({
      steps: [step()],
      workflowMinimum: 'n2_user_approval',
      targetCount: SETTINGS.bulkThreshold,
      estimatedCredits: 0,
      settings: SETTINGS,
    })
    expect(decision.requiredLevel).toBe('n3_manager_approval')
    expect(decision.needsManager).toBe(true)
    expect(decision.reasons).toContain('bulk')
  })

  it('passe en validation responsable au seuil de dépense', () => {
    const decision = decideApproval({
      steps: [step({ estimatedCredits: SETTINGS.spendThreshold })],
      workflowMinimum: 'n2_user_approval',
      targetCount: 1,
      estimatedCredits: SETTINGS.spendThreshold,
      settings: SETTINGS,
    })
    expect(decision.requiredLevel).toBe('n3_manager_approval')
    expect(decision.reasons).toContain('spend')
  })

  it('ne redescend JAMAIS sous le seuil, même avec un réglage permissif', () => {
    // Le garde-fou du rapport est non négociable : les seuils se déplacent, le
    // principe non. Un espace qui met tout en automatique borné ne doit pas
    // pouvoir envoyer à 300 personnes sans que personne n'ait dit oui.
    const permissive: ApprovalSettings = { defaultLevel: 'n5_extended_auto', bulkThreshold: 10, spendThreshold: 20 }
    const decision = decideApproval({
      steps: [step()],
      workflowMinimum: 'n1_prepare',
      targetCount: 300,
      estimatedCredits: 0,
      settings: permissive,
    })
    expect(atLeast(decision.requiredLevel, 'n3_manager_approval')).toBe(true)
  })

  it('un run unitaire et gratuit reste au clic de l’auteur', () => {
    const decision = decideApproval({
      steps: [step()],
      workflowMinimum: 'n2_user_approval',
      targetCount: 1,
      estimatedCredits: 0,
      settings: SETTINGS,
    })
    expect(decision.requiredLevel).toBe('n2_user_approval')
    expect(decision.needsManager).toBe(false)
  })
})

describe('qui peut trancher', () => {
  it('un clic simple appartient à l’auteur, et à lui seul', () => {
    expect(
      canDecide({ requiredLevel: 'n2_user_approval', deciderRole: 'sales', deciderId: 'u1', requesterId: 'u1' }),
    ).toEqual({ allowed: true })
    expect(
      canDecide({ requiredLevel: 'n2_user_approval', deciderRole: 'owner', deciderId: 'u2', requesterId: 'u1' })
        .allowed,
    ).toBe(false)
  })

  it('une validation responsable exige quelqu’un qui gère l’équipe', () => {
    expect(
      canDecide({ requiredLevel: 'n3_manager_approval', deciderRole: 'sales', deciderId: 'u2', requesterId: 'u1' })
        .allowed,
    ).toBe(false)
    expect(
      canDecide({ requiredLevel: 'n3_manager_approval', deciderRole: 'admin', deciderId: 'u2', requesterId: 'u1' }),
    ).toEqual({ allowed: true })
  })

  it('un responsable ne s’auto-approuve pas', () => {
    // Un garde-fou que la personne pressée peut lever seule n'en est pas un.
    const verdict = canDecide({
      requiredLevel: 'n3_manager_approval',
      deciderRole: 'owner',
      deciderId: 'u1',
      requesterId: 'u1',
    })
    expect(verdict.allowed).toBe(false)
    expect(verdict.reason).toContain('demandeur')
  })

  it('un lecteur ne valide rien', () => {
    expect(
      canDecide({ requiredLevel: 'n3_manager_approval', deciderRole: 'viewer', deciderId: 'u2', requesterId: 'u1' })
        .allowed,
    ).toBe(false)
  })
})

// #2864 — la délégation d'une demande à un collègue du MÊME espace.
describe('déléguer une demande (#2864)', () => {
  const base = { requesterId: 'u1', currentAssigneeId: null }

  it('refuse un destinataire qui n’est PAS membre de l’espace', () => {
    const verdict = canAssign({
      ...base,
      requiredLevel: 'n2_user_approval',
      assignerId: 'u1',
      assignerRole: 'sales',
      assigneeId: 'u-autre-espace',
      assigneeRole: null,
    })
    expect(verdict.allowed).toBe(false)
    expect(verdict.reason).toContain('membre')
  })

  it('l’auteur délègue un clic simple à un collègue, qui peut alors trancher', () => {
    expect(
      canAssign({
        ...base,
        requiredLevel: 'n2_user_approval',
        assignerId: 'u1',
        assignerRole: 'sales',
        assigneeId: 'u2',
        assigneeRole: 'sales',
      }),
    ).toEqual({ allowed: true })
    expect(
      canDecide({
        requiredLevel: 'n2_user_approval',
        deciderRole: 'sales',
        deciderId: 'u2',
        requesterId: 'u1',
        assigneeId: 'u2',
      }),
    ).toEqual({ allowed: true })
  })

  it('un tiers sans responsabilité ne s’attribue pas la demande d’un autre', () => {
    const verdict = canAssign({
      ...base,
      requiredLevel: 'n2_user_approval',
      assignerId: 'u3',
      assignerRole: 'sales',
      assigneeId: 'u3',
      assigneeRole: 'sales',
    })
    expect(verdict.allowed).toBe(false)
  })

  it('une validation responsable ne se délègue qu’à un responsable', () => {
    expect(
      canAssign({
        ...base,
        requiredLevel: 'n3_manager_approval',
        assignerId: 'u1',
        assignerRole: 'sales',
        assigneeId: 'u2',
        assigneeRole: 'sales',
      }).allowed,
    ).toBe(false)
    expect(
      canAssign({
        ...base,
        requiredLevel: 'n3_manager_approval',
        assignerId: 'u1',
        assignerRole: 'sales',
        assigneeId: 'u2',
        assigneeRole: 'admin',
      }),
    ).toEqual({ allowed: true })
  })

  it('la délégation n’ouvre pas l’auto-validation responsable', () => {
    expect(
      canDecide({
        requiredLevel: 'n3_manager_approval',
        deciderRole: 'owner',
        deciderId: 'u1',
        requesterId: 'u1',
        assigneeId: 'u1',
      }).allowed,
    ).toBe(false)
  })

  it('un lecteur ne reçoit rien à trancher', () => {
    expect(
      canAssign({
        ...base,
        requiredLevel: 'n2_user_approval',
        assignerId: 'u1',
        assignerRole: 'sales',
        assigneeId: 'u2',
        assigneeRole: 'viewer',
      }).allowed,
    ).toBe(false)
  })
})

// #2856 — reporter une demande : le demandeur, le délégué, ou un responsable.
describe('reporter une demande (#2856)', () => {
  it('le demandeur, le délégué et un responsable peuvent reporter ; un tiers non', () => {
    const input = { requesterId: 'u1', currentAssigneeId: 'u2' }
    expect(canSnooze({ ...input, actorId: 'u1', actorRole: 'sales' }).allowed).toBe(true)
    expect(canSnooze({ ...input, actorId: 'u2', actorRole: 'sales' }).allowed).toBe(true)
    expect(canSnooze({ ...input, actorId: 'u4', actorRole: 'admin' }).allowed).toBe(true)
    expect(canSnooze({ ...input, actorId: 'u3', actorRole: 'sales' }).allowed).toBe(false)
  })
})

describe('réglages d’un espace', () => {
  it('NULL veut dire « suit le défaut produit », pas « zéro »', () => {
    // Un espace créé avant cette fonctionnalité n'a rien en base. Lire 0 comme
    // seuil de volume ferait passer chaque action unitaire en validation
    // responsable — le produit deviendrait inutilisable du jour au lendemain.
    expect(resolveSettings({})).toEqual(DEFAULT_APPROVAL_SETTINGS)
    expect(resolveSettings({ approval_bulk_threshold: null }).bulkThreshold).toBe(
      DEFAULT_APPROVAL_SETTINGS.bulkThreshold,
    )
  })

  it('ignore un niveau inconnu en base plutôt que de le propager', () => {
    expect(resolveSettings({ approval_default_level: 'n9_yolo' }).defaultLevel).toBe(
      DEFAULT_APPROVAL_SETTINGS.defaultLevel,
    )
  })

  it('respecte les valeurs choisies par l’espace', () => {
    expect(
      resolveSettings({
        approval_default_level: 'n4_bounded_auto',
        approval_bulk_threshold: 50,
        approval_spend_threshold: 100,
      }),
    ).toEqual({ defaultLevel: 'n4_bounded_auto', bulkThreshold: 50, spendThreshold: 100 })
  })

  it('garde n5 : un espace peut confier son travail INTERNE borné', () => {
    // Décision : `n5` reste acceptable en base. Le retirer punirait le travail
    // interne (rafraîchissement, digest, contrôle de santé) pour un défaut qui
    // n'était pas le sien — le plancher des pas EXTERNES le tient déjà.
    expect(resolveSettings({ approval_default_level: 'n5_extended_auto' }).defaultLevel).toBe('n5_extended_auto')
  })

  it('refuse une posture que la politique ne sait pas TENIR', () => {
    // `n0_advice` et `n1_prepare` promettent « rien ne s'écrit ». Cette politique
    // n'a aucun moyen de tenir cette promesse : un pas ordinaire résolu à `n1`
    // atterrit dans « à approuver » et part au premier clic, exactement comme
    // `n2`. Un réglage qui annonce autre chose que ce qu'il fait est pire que
    // pas de réglage — on retombe donc sur le défaut produit, comme pour une
    // valeur illisible.
    expect(resolveSettings({ approval_default_level: 'n1_prepare' }).defaultLevel).toBe(
      DEFAULT_APPROVAL_SETTINGS.defaultLevel,
    )
    expect(resolveSettings({ approval_default_level: 'n0_advice' }).defaultLevel).toBe(
      DEFAULT_APPROVAL_SETTINGS.defaultLevel,
    )
  })
})

/**
 * LE PLANCHER — ce qu'aucun réglage d'espace ne peut retirer.
 *
 * Ces tests décrivent un INVARIANT, pas une ligne : « un pas dont l'effet SORT
 * du produit, ou qu'on ne peut pas rattraper, ne s'exécute jamais sans qu'un
 * humain ait dit oui ». Ils balaient TOUS les niveaux, parce que le défaut
 * d'origine ne se voyait que sur deux d'entre eux — `n4` et `n5`, qu'aucun
 * écran ne pose aujourd'hui et que la colonne `workspaces.approval_default_level`
 * accepte pourtant.
 */
describe('le plancher d’un pas qui engage', () => {
  /** Tous les niveaux du barème, sans exception. Corpus LU, pas recopié. */
  const EVERY_LEVEL = [...AUTOMATION_LEVEL_ORDER]

  it('lit un corpus non vide — sans ça, les `it.each` ci-dessous ne gardent rien', () => {
    expect(EVERY_LEVEL.length).toBe(6)
    expect(EVERY_LEVEL).toContain('n5_extended_auto')
    expect(EVERY_LEVEL).toContain('n4_bounded_auto')
  })

  it.each(EVERY_LEVEL)('un pas irréversible exige un humain, même à %s', level => {
    const settings: ApprovalSettings = { ...SETTINGS, defaultLevel: level }
    expect(demandsAHuman(levelForStep(step({ risk: 'irreversible' }), settings))).toBe(true)
  })

  it.each(EVERY_LEVEL)('un envoi d’e-mail exige un humain, même à %s', level => {
    // Réversible sur le papier (`risk: 'low'`), gratuit, sans famille sensible :
    // rien dans ce pas ne le distingue d'une note CRM — sauf que son effet
    // ATTEINT quelqu'un. C'est la forme que le barème d'origine ne voyait pas.
    const settings: ApprovalSettings = { ...SETTINGS, defaultLevel: level }
    const emailStep = step({ intentType: 'send_email', capability: 'email', risk: 'low' })
    expect(demandsAHuman(levelForStep(emailStep, settings))).toBe(true)
  })

  it('un run qui contient un envoi ne part pas seul, même en autonomie étendue', () => {
    const permissive: ApprovalSettings = { ...SETTINGS, defaultLevel: 'n5_extended_auto' }
    const decision = decideApproval({
      steps: [step(), step({ key: 'send', intentType: 'send_email', risk: 'irreversible' })],
      workflowMinimum: 'n4_bounded_auto',
      targetCount: 1,
      estimatedCredits: 0,
      settings: permissive,
    })
    expect(demandsAHuman(decision.requiredLevel)).toBe(true)
    expect(decision.reasons).toContain('irreversible')
  })

  it('le seuil de volume tient AUSSI en autonomie étendue — le niveau rendu le dit', () => {
    // ⚠️ Le test voisin affirmait la même chose avec `atLeast(requiredLevel,
    // 'n3')`, qui répondait « vrai » pour `n5` : il mesurait avec l'ordre qui
    // PORTAIT le défaut, et restait vert pendant que 300 envois partaient seuls.
    // Ce qui compte n'est pas un rang, c'est qu'un responsable tranche.
    const permissive: ApprovalSettings = { defaultLevel: 'n5_extended_auto', bulkThreshold: 10, spendThreshold: 20 }
    const decision = decideApproval({
      steps: [step()],
      workflowMinimum: 'n1_prepare',
      targetCount: 300,
      estimatedCredits: 0,
      settings: permissive,
    })
    expect(decision.requiredLevel).toBe('n3_manager_approval')
    expect(decision.needsManager).toBe(true)
  })

  it('laisse un travail INTERNE, réversible et gratuit profiter de l’autonomie', () => {
    // Le plancher ne doit pas manger ce qui est légitime : une notification et un
    // rappel à soi-même sont exactement ce que `n4` sert à automatiser — sept
    // routines du catalogue en vivent.
    const bounded: ApprovalSettings = { ...SETTINGS, defaultLevel: 'n4_bounded_auto' }
    expect(levelForStep(step({ intentType: 'notify_user' }), bounded)).toBe('n4_bounded_auto')
    expect(levelForStep(step({ intentType: 'schedule_reminder' }), bounded)).toBe('n4_bounded_auto')
    expect(demandsAHuman('n4_bounded_auto')).toBe(false)
  })
})

/**
 * #4016 L6 — ACTION OS N4/N5 AUTONOME (décision Louis 11/10/2026).
 *
 * ⚠️⚠️ RENVERSEMENT DATÉ de `c14_automatisation` (« aucune autonomie globale »)
 * pour le travail INTERNE : en N4, un run interne part seul tant qu'il reste
 * sous les seuils réglés par l'admin (jusqu'à « sans plafond ») ; en N5, il part
 * seul SANS plafond. Ce qui ne bouge pas, et que ces tests tiennent : un envoi
 * (GA-375, GA-239) et une écriture dans le CRM du client (« pour le CRM faut
 * quand même un go du user ») demandent un humain à TOUS les niveaux.
 */
describe('#4016 L6 — N4/N5 autonome, le CRM garde son go', () => {
  const at = (level: ApprovalSettings['defaultLevel'], over: Partial<ApprovalSettings> = {}): ApprovalSettings => ({
    ...SETTINGS,
    defaultLevel: level,
    ...over,
  })

  it.each(AUTOMATION_LEVEL_ORDER)('une écriture CRM demande un go à %s', level => {
    for (const intentType of ['create_crm_note', 'create_crm_task', 'close_crm_task', 'create_mail_draft'] as const) {
      expect(demandsAHuman(levelForStep(step({ intentType }), at(level)))).toBe(true)
    }
  })

  it('un pas qui dépense des crédits part seul en N4 et en N5 — la dépense est tenue par le seuil du RUN', () => {
    const enrich = step({ intentType: 'enrich_contact', capability: 'enrichment', estimatedCredits: 2 })
    expect(levelForStep(enrich, at('n4_bounded_auto'))).toBe('n4_bounded_auto')
    expect(levelForStep(enrich, at('n5_extended_auto'))).toBe('n5_extended_auto')
    // Hors posture autonome, inchangé : un clic.
    expect(levelForStep(enrich, at('n2_user_approval'))).toBe('n2_user_approval')
  })

  it('N4 est BORNÉ : sous les seuils le run part seul, au seuil un responsable tranche', () => {
    const enrich = step({ intentType: 'enrich_contact', capability: 'enrichment', estimatedCredits: 2 })
    const under = decideApproval({
      steps: [enrich],
      workflowMinimum: 'n4_bounded_auto',
      targetCount: 5,
      estimatedCredits: 10,
      settings: at('n4_bounded_auto'),
    })
    expect(demandsAHuman(under.requiredLevel)).toBe(false)
    const over = decideApproval({
      steps: [enrich],
      workflowMinimum: 'n4_bounded_auto',
      targetCount: 5,
      estimatedCredits: SETTINGS.spendThreshold,
      settings: at('n4_bounded_auto'),
    })
    expect(over.requiredLevel).toBe('n3_manager_approval')
    expect(over.reasons).toContain('spend')
  })

  it('N4 avec des seuils « sans plafond » : un très gros run interne part seul', () => {
    const decision = decideApproval({
      steps: [step({ intentType: 'pin_memory_fact', capability: 'memory', estimatedCredits: 3 })],
      workflowMinimum: 'n4_bounded_auto',
      targetCount: 1_000_000,
      estimatedCredits: 5_000_000,
      settings: at('n4_bounded_auto', {
        bulkThreshold: APPROVAL_THRESHOLD_UNBOUNDED,
        spendThreshold: APPROVAL_THRESHOLD_UNBOUNDED,
      }),
    })
    expect(decision.requiredLevel).toBe('n4_bounded_auto')
    expect(decision.reasons).toEqual([])
  })

  it('N5 est SANS PLAFOND pour un run interne : ni le volume ni la dépense ne le relèvent', () => {
    const decision = decideApproval({
      steps: [step({ intentType: 'pin_memory_fact', capability: 'memory', estimatedCredits: 1 })],
      workflowMinimum: 'n5_extended_auto',
      targetCount: 300,
      estimatedCredits: 500,
      settings: at('n5_extended_auto'),
    })
    expect(decision.requiredLevel).toBe('n5_extended_auto')
    expect(decision.needsManager).toBe(false)
  })

  it('SAIT DIRE NON — en N5, un run qui écrit dans le CRM reste au go, et le volume le monte au responsable', () => {
    const decision = decideApproval({
      steps: [step({ intentType: 'pin_memory_fact', capability: 'memory' }), step()],
      workflowMinimum: 'n5_extended_auto',
      targetCount: 300,
      estimatedCredits: 0,
      settings: at('n5_extended_auto'),
    })
    expect(decision.requiredLevel).toBe('n3_manager_approval')
    expect(decision.reasons).toContain('bulk')
  })

  it('SAIT DIRE NON — en N5, un envoi en masse attend toujours un responsable', () => {
    const decision = decideApproval({
      steps: [step({ key: 'send', intentType: 'send_email', capability: 'email', risk: 'irreversible' })],
      workflowMinimum: 'n5_extended_auto',
      targetCount: 300,
      estimatedCredits: 0,
      settings: at('n5_extended_auto'),
    })
    expect(decision.requiredLevel).toBe('n3_manager_approval')
  })

  it('une famille sensible (export, suppression en masse) garde son plancher en N5', () => {
    const exportStep = step({ intentType: 'pin_memory_fact', sensitiveFamily: 'data_export' })
    expect(demandsAHuman(levelForStep(exportStep, at('n5_extended_auto')))).toBe(true)
  })
})
