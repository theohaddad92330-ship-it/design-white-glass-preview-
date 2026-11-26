import {
  classifyExpressMessageSignal,
  buildMessageLearningSummary,
  computeBehavioralMessageLearningSignals,
  computeExpressMessageLearningSignals,
  computeQualityFlagSignals,
  MESSAGE_LEARNING_RULE_PROPOSAL_MIN_SAMPLE,
  globalMessageLearningSignals,
  proposeCampaignMessageLearningRule,
  proposeGlobalMessageLearningRule,
  proposeMessageMessageLearningRule,
  proposeUserMessageLearningRule,
  proposeWorkspaceMessageLearningRule,
} from './message-learning-signals'

// #2385.2 (épopée #2877 — moteur d'apprentissage des messages, absent) — la
// PLUS PETITE tranche prouvable : `outreach_transitions` (#2366.8) trace déjà
// « approved »/« cancelled » au niveau ÉTAT du message, mais rien ne le
// CLASSE comme signal EXPRESS de learning. Ce module ne fait QUE la lecture :
// aucune règle n'est proposée ni appliquée (#2385.11, NO-GO tenu par
// construction — rien ici n'affirme un apprentissage).

describe('classifyExpressMessageSignal', () => {
  it('classe « approved » comme un signal validé', () => {
    expect(classifyExpressMessageSignal({ to_state: 'approved' })).toBe('approved')
  })

  it('classe « cancelled » comme un signal rejeté', () => {
    expect(classifyExpressMessageSignal({ to_state: 'cancelled' })).toBe('rejected')
  })

  it('rend `null` pour un état qui ne dit rien du jugement de l’utilisateur', () => {
    // #2385.6 — ne jamais conclure « mauvais message » sans exclure timing,
    // compte, canal : un `bounced` ou un `expired` n'est pas un jugement sur
    // le TEXTE du message, donc il ne devient pas un signal.
    expect(classifyExpressMessageSignal({ to_state: 'bounced' })).toBeNull()
    expect(classifyExpressMessageSignal({ to_state: 'sent' })).toBeNull()
    expect(classifyExpressMessageSignal({ to_state: 'expired' })).toBeNull()
  })
})

describe('computeExpressMessageLearningSignals', () => {
  it('rend un échantillon à zéro — jamais un taux — quand rien n’est classable', () => {
    const result = computeExpressMessageLearningSignals([{ to_state: 'sent' }, { to_state: 'delivered' }])
    expect(result).toEqual({ approved: 0, approvedWithoutEdit: 0, approvedAfterEdit: 0, rejected: 0, sample: 0 })
  })

  it('compte séparément les deux signaux EXPRESS classables aujourd’hui', () => {
    const result = computeExpressMessageLearningSignals([
      { to_state: 'approved', subject_id: 'm1' },
      { to_state: 'approved', subject_id: 'm2' },
      { to_state: 'cancelled', subject_id: 'm3' },
      { to_state: 'sent', subject_id: 'm4' }, // ignoré : ne dit rien du jugement sur le message
    ])
    expect(result).toEqual({ approved: 2, approvedWithoutEdit: 2, approvedAfterEdit: 0, rejected: 1, sample: 3 })
  })

  // #2385.2 reste (registre 25/09) — « modifié » distingué de « validé tel
  // quel » : `outreach_message_versions.kind = 'user_edit'` dit déjà QU'un
  // humain a réécrit le brouillon (jamais LEQUEL des quatre sous-signaux —
  // ton/CTA/template — doctrine : le corps du message ne sort jamais).
  it('distingue un message APPROUVÉ APRÈS ÉDITION d’un message approuvé tel quel', () => {
    const result = computeExpressMessageLearningSignals(
      [
        { to_state: 'approved', subject_id: 'm-edited' },
        { to_state: 'approved', subject_id: 'm-as-is' },
      ],
      new Set(['m-edited']),
    )
    expect(result).toEqual({ approved: 2, approvedWithoutEdit: 1, approvedAfterEdit: 1, rejected: 0, sample: 2 })
  })

  it('un rejet ne compte jamais comme « approuvé après édition », même édité', () => {
    const result = computeExpressMessageLearningSignals(
      [{ to_state: 'cancelled', subject_id: 'm-edited-then-rejected' }],
      new Set(['m-edited-then-rejected']),
    )
    expect(result).toEqual({ approved: 0, approvedWithoutEdit: 0, approvedAfterEdit: 0, rejected: 1, sample: 1 })
  })
})

// #2385.3 (première tranche, épopée #2877, lot g20 26/09) — les faits
// comportementaux existaient déjà (`outreach_transitions`), rien ne les
// agrégeait en signal DATÉ. `optOut` reste HORS de cette tranche (voir
// docblock de `computeBehavioralMessageLearningSignals`).
describe('computeBehavioralMessageLearningSignals', () => {
  it('rend tous les compteurs à zéro et un délai `null` — jamais 0 — quand rien n’est mesurable', () => {
    const result = computeBehavioralMessageLearningSignals([])
    expect(result).toEqual({
      sent: 0,
      delivered: 0,
      replied: 0,
      bounced: 0,
      failed: 0,
      expired: 0,
      medianReplyDelayHours: null,
      optOut: 0,
      meetingBooked: 0,
      sample: 0,
    })
  })

  it('compte séparément chacun des six états comportementaux', () => {
    const result = computeBehavioralMessageLearningSignals([
      { to_state: 'sent', subject_id: 'm1', occurred_at: '2026-09-01T00:00:00Z' },
      { to_state: 'delivered', subject_id: 'm1', occurred_at: '2026-09-01T00:05:00Z' },
      { to_state: 'bounced', subject_id: 'm2', occurred_at: '2026-09-01T00:00:00Z' },
      { to_state: 'failed', subject_id: 'm3', occurred_at: '2026-09-01T00:00:00Z' },
      { to_state: 'expired', subject_id: 'm4', occurred_at: '2026-09-01T00:00:00Z' },
      // #2385.6 — un état sans signification comportementale (le statut de
      // départ du message) n'est jamais compté ici.
      { to_state: 'drafted', subject_id: 'm5', occurred_at: '2026-09-01T00:00:00Z' },
    ])
    expect(result.sent).toBe(1)
    expect(result.delivered).toBe(1)
    expect(result.bounced).toBe(1)
    expect(result.failed).toBe(1)
    expect(result.expired).toBe(1)
    expect(result.sample).toBe(5)
  })

  it('mesure le délai de réponse sur le MÊME sujet — jamais entre deux messages différents', () => {
    const result = computeBehavioralMessageLearningSignals([
      { to_state: 'sent', subject_id: 'm1', occurred_at: '2026-09-01T00:00:00Z' },
      { to_state: 'replied', subject_id: 'm1', occurred_at: '2026-09-02T00:00:00Z' },
      // Un second message répond sans jamais avoir été vu « sent » ici (envoyé
      // avant la fenêtre lue) : sa réponse ne doit fabriquer aucun délai.
      { to_state: 'replied', subject_id: 'm2', occurred_at: '2026-09-01T12:00:00Z' },
    ])
    expect(result.medianReplyDelayHours).toBe(24)
    expect(result.replied).toBe(2)
  })

  it('rend la MÉDIANE, jamais une moyenne, sur plusieurs délais mesurés', () => {
    const result = computeBehavioralMessageLearningSignals([
      { to_state: 'sent', subject_id: 'm1', occurred_at: '2026-09-01T00:00:00Z' },
      { to_state: 'replied', subject_id: 'm1', occurred_at: '2026-09-01T01:00:00Z' }, // 1h
      { to_state: 'sent', subject_id: 'm2', occurred_at: '2026-09-01T00:00:00Z' },
      { to_state: 'replied', subject_id: 'm2', occurred_at: '2026-09-01T03:00:00Z' }, // 3h
      { to_state: 'sent', subject_id: 'm3', occurred_at: '2026-09-01T00:00:00Z' },
      { to_state: 'replied', subject_id: 'm3', occurred_at: '2026-09-04T00:00:00Z' }, // 72h — un outlier
    ])
    expect(result.medianReplyDelayHours).toBe(3)
  })

  it('ignore une réponse antérieure à l’envoi — une horloge désordonnée ne fabrique jamais un délai négatif', () => {
    const result = computeBehavioralMessageLearningSignals([
      { to_state: 'sent', subject_id: 'm1', occurred_at: '2026-09-02T00:00:00Z' },
      { to_state: 'replied', subject_id: 'm1', occurred_at: '2026-09-01T00:00:00Z' },
    ])
    expect(result.medianReplyDelayHours).toBeNull()
  })

  // #2385.3 (LOT écrivain 28/09) — optOut / meetingBooked, deux faits REJOINTS
  // depuis d'autres tables (`contact_stops`, `user_actions`), résolus par
  // l'APPELANT en deux ensembles de `subject_id` : cette fonction reste pure,
  // elle ne fait qu'une intersection.
  it('sans ensemble fourni (comportement d’avant ce lot), les deux compteurs restent à 0', () => {
    const result = computeBehavioralMessageLearningSignals([
      { to_state: 'sent', subject_id: 'm1', occurred_at: '2026-09-01T00:00:00Z' },
    ])
    expect(result.optOut).toBe(0)
    expect(result.meetingBooked).toBe(0)
  })

  it('compte les messages de l’échantillon dont le contact a depuis arrêté tout envoi', () => {
    const result = computeBehavioralMessageLearningSignals(
      [
        { to_state: 'sent', subject_id: 'm1', occurred_at: '2026-09-01T00:00:00Z' },
        { to_state: 'sent', subject_id: 'm2', occurred_at: '2026-09-01T00:00:00Z' },
      ],
      { stoppedMessageIds: new Set(['m1']) },
    )
    expect(result.optOut).toBe(1)
  })

  it('compte les messages de l’échantillon dont le contact porte un RDV obtenu', () => {
    const result = computeBehavioralMessageLearningSignals(
      [{ to_state: 'sent', subject_id: 'm1', occurred_at: '2026-09-01T00:00:00Z' }],
      { meetingBookedMessageIds: new Set(['m1']) },
    )
    expect(result.meetingBooked).toBe(1)
  })

  it('ne compte QUE les messages réellement dans l’échantillon — un id hors sample n’ajoute rien', () => {
    const result = computeBehavioralMessageLearningSignals(
      [{ to_state: 'sent', subject_id: 'm1', occurred_at: '2026-09-01T00:00:00Z' }],
      { stoppedMessageIds: new Set(['m1', 'm-hors-echantillon']) },
    )
    expect(result.optOut).toBe(1)
  })
})

// #2385.5 (épopée #2877) — la PLUS PETITE tranche prouvable du moteur
// d'apprentissage à 5 niveaux : un candidat de règle GOUVERNÉ au niveau
// workspace (`messageLearningRuleScopeSchema`, `@bellum/contracts`), dérivé
// UNIQUEMENT des compteurs déjà mesurés — jamais une probabilité, jamais une
// règle CRÉÉE ni APPLIQUÉE (#2385.11 : ceci reste un candidat affiché en
// back-office, pas un apprentissage affirmé). Les niveaux message/campagne/
// utilisateur/global restent hors de cette tranche — aucun code ne les
// peuple encore, seul le schéma les gouverne déjà (#2385.5, socle contracts).
describe('proposeWorkspaceMessageLearningRule', () => {
  const zeroExpress = { approved: 0, approvedWithoutEdit: 0, approvedAfterEdit: 0, rejected: 0, sample: 0 }
  const zeroBehavioral = {
    sent: 0,
    delivered: 0,
    replied: 0,
    bounced: 0,
    failed: 0,
    expired: 0,
    medianReplyDelayHours: null,
    optOut: 0,
    meetingBooked: 0,
    sample: 0,
  }

  it('rend `null` sous le seuil — un échantillon trop petit ne devient jamais un candidat', () => {
    const express = { ...zeroExpress, approved: 2, approvedWithoutEdit: 2, sample: 2 }
    expect(MESSAGE_LEARNING_RULE_PROPOSAL_MIN_SAMPLE).toBeGreaterThan(2)
    expect(proposeWorkspaceMessageLearningRule('w1', express, zeroBehavioral)).toBeNull()
  })

  it('propose un candidat GOUVERNÉ au niveau workspace, jamais confondu avec un autre niveau', () => {
    const express = {
      approved: 8,
      approvedWithoutEdit: 6,
      approvedAfterEdit: 2,
      rejected: 2,
      sample: MESSAGE_LEARNING_RULE_PROPOSAL_MIN_SAMPLE,
    }
    const candidate = proposeWorkspaceMessageLearningRule('w1', express, zeroBehavioral)

    expect(candidate).not.toBeNull()
    expect(candidate?.scope).toEqual({ level: 'workspace', workspaceId: 'w1' })
    expect(candidate?.version).toBe(1)
    expect(candidate?.status).toBe('proposed')
    expect(candidate?.basedOnSample).toBe(express.sample)
  })

  it('le résumé rapporte des COMPTES mesurés, jamais un pourcentage ni une probabilité', () => {
    const express = {
      approved: 8,
      approvedWithoutEdit: 6,
      approvedAfterEdit: 2,
      rejected: 2,
      sample: MESSAGE_LEARNING_RULE_PROPOSAL_MIN_SAMPLE,
    }
    const candidate = proposeWorkspaceMessageLearningRule('w1', express, zeroBehavioral)

    expect(candidate?.summary).toContain('6')
    expect(candidate?.summary).toContain('2')
    expect(candidate?.summary).not.toMatch(/%|probabilité|chance/i)
  })
})

// #2385.5 (LOT écrivain 28/09, passe 2) — le niveau UTILISATEUR, le second à
// se peupler après `workspace` : même donnée (`outreach_transitions.user_id`),
// même calcul, un scope différent — jamais confondu avec `workspace`.
describe('proposeUserMessageLearningRule', () => {
  const zeroBehavioral = {
    sent: 0,
    delivered: 0,
    replied: 0,
    bounced: 0,
    failed: 0,
    expired: 0,
    medianReplyDelayHours: null,
    optOut: 0,
    meetingBooked: 0,
    sample: 0,
  }

  it('rend `null` sous le même seuil que le niveau workspace', () => {
    const express = {
      approved: 2,
      approvedWithoutEdit: 2,
      approvedAfterEdit: 0,
      rejected: 0,
      sample: 2,
    }
    expect(proposeUserMessageLearningRule('u1', express, zeroBehavioral)).toBeNull()
  })

  it('propose un candidat GOUVERNÉ au niveau utilisateur — jamais `workspace`', () => {
    const express = {
      approved: 8,
      approvedWithoutEdit: 6,
      approvedAfterEdit: 2,
      rejected: 2,
      sample: MESSAGE_LEARNING_RULE_PROPOSAL_MIN_SAMPLE,
    }
    const candidate = proposeUserMessageLearningRule('u1', express, zeroBehavioral)

    expect(candidate).not.toBeNull()
    expect(candidate?.scope).toEqual({ level: 'user', userId: 'u1' })
    expect(candidate?.status).toBe('proposed')
  })
})

// #2385.5 (LOT écrivain 28/09, passe 2) — le niveau CAMPAGNE, troisième à se
// peupler : même calcul, `campaign_label` en scope au lieu de `userId`.
describe('proposeCampaignMessageLearningRule', () => {
  const zeroBehavioral = {
    sent: 0,
    delivered: 0,
    replied: 0,
    bounced: 0,
    failed: 0,
    expired: 0,
    medianReplyDelayHours: null,
    optOut: 0,
    meetingBooked: 0,
    sample: 0,
  }

  it('rend `null` sous le seuil', () => {
    const express = { approved: 2, approvedWithoutEdit: 2, approvedAfterEdit: 0, rejected: 0, sample: 2 }
    expect(proposeCampaignMessageLearningRule('rentree-2026', express, zeroBehavioral)).toBeNull()
  })

  it('propose un candidat GOUVERNÉ au niveau campagne — jamais `user` ni `workspace`', () => {
    const express = {
      approved: 8,
      approvedWithoutEdit: 6,
      approvedAfterEdit: 2,
      rejected: 2,
      sample: MESSAGE_LEARNING_RULE_PROPOSAL_MIN_SAMPLE,
    }
    const candidate = proposeCampaignMessageLearningRule('rentree-2026', express, zeroBehavioral)

    expect(candidate).not.toBeNull()
    expect(candidate?.scope).toEqual({ level: 'campaign', campaignId: 'rentree-2026' })
  })
})

// #2385.5 (lot SRC4 28/09) — le niveau MESSAGE, le dernier des 5 niveaux
// gouvernés à se peupler. Même mécanisme, mais le seuil ferme pratiquement
// TOUJOURS ce niveau : un seul message n'a qu'un signal express TERMINAL
// (approuvé OU rejeté, une fois) — voir le docblock de
// `proposeMessageMessageLearningRule`. Les deux tests ci-dessous le prouvent
// dans les deux sens : sous le seuil (le cas réel), et gouverné correctement
// si jamais atteint (la garantie structurelle, testée comme les 3 autres
// niveaux).
describe('proposeMessageMessageLearningRule', () => {
  const zeroBehavioral = {
    sent: 0,
    delivered: 0,
    replied: 0,
    bounced: 0,
    failed: 0,
    expired: 0,
    medianReplyDelayHours: null,
    optOut: 0,
    meetingBooked: 0,
    sample: 0,
  }

  it('rend `null` sur le signal terminal RÉEL d’un seul message — #2385.1 : jamais une règle depuis un cas isolé', () => {
    // Le cas réel : un message est approuvé ou rejeté UNE fois, sample = 1.
    const express = { approved: 1, approvedWithoutEdit: 1, approvedAfterEdit: 0, rejected: 0, sample: 1 }
    expect(proposeMessageMessageLearningRule('msg-1', express, zeroBehavioral)).toBeNull()
  })

  it('propose un candidat GOUVERNÉ au niveau message — jamais `campaign`, `user` ni `workspace`', () => {
    // Le seuil ATTEINT (synthétique — un seul message ne l'atteint pas en
    // usage réel, voir le test ci-dessus) : la garantie structurelle du
    // niveau reste vérifiée, comme pour les 3 autres niveaux peuplés.
    const express = {
      approved: 8,
      approvedWithoutEdit: 6,
      approvedAfterEdit: 2,
      rejected: 2,
      sample: MESSAGE_LEARNING_RULE_PROPOSAL_MIN_SAMPLE,
    }
    const candidate = proposeMessageMessageLearningRule('msg-1', express, zeroBehavioral)

    expect(candidate).not.toBeNull()
    expect(candidate?.scope).toEqual({ level: 'message', messageId: 'msg-1' })
    expect(candidate?.status).toBe('proposed')
  })
})

describe('computeQualityFlagSignals (#2385.4)', () => {
  it('compte chaque nature déclarée et les messages DISTINCTS signalés', () => {
    expect(
      computeQualityFlagSignals([
        { kind: 'wrong_fact', message_id: 'm1' },
        { kind: 'wrong_cta', message_id: 'm1' },
        { kind: 'wrong_persona', message_id: 'm2' },
        { kind: 'wrong_fact', message_id: 'm3' },
      ]),
    ).toEqual({ wrongFact: 2, wrongCta: 1, wrongPersona: 1, flaggedMessages: 3 })
  })

  it("aucune déclaration = zéro DÉCLARATION (jamais lu « zéro faux fait » : le relecteur n'a rien dit)", () => {
    expect(computeQualityFlagSignals([])).toEqual({ wrongFact: 0, wrongCta: 0, wrongPersona: 0, flaggedMessages: 0 })
  })

  it('ignore une nature inconnue — une valeur hors liste ne fabrique pas de signal', () => {
    expect(computeQualityFlagSignals([{ kind: 'bad_tone', message_id: 'm1' }]).flaggedMessages).toBe(0)
  })
})

describe('buildMessageLearningSummary (#2877, écran agrégat)', () => {
  const none = {
    express: { approved: 0, approvedWithoutEdit: 0, approvedAfterEdit: 0, rejected: 0, sample: 0 },
    behavioral: {
      sent: 0,
      delivered: 0,
      replied: 0,
      bounced: 0,
      failed: 0,
      expired: 0,
      medianReplyDelayHours: null,
      optOut: 0,
      meetingBooked: 0,
      sample: 0,
    },
    quality: { wrongFact: 0, wrongCta: 0, wrongPersona: 0, flaggedMessages: 0 },
    proposedRule: null,
    history: [],
  }

  it('un espace sans aucun signal ne rend aucun bloc : pas une rangée de zéros', () => {
    const summary = buildMessageLearningSummary(none)
    expect(summary).toEqual({
      express: null,
      behavioral: null,
      quality: null,
      proposedRule: null,
      globalRule: null,
      history: [],
    })
  })

  it('rend les comptes mesurés, sans taux, et laisse le délai médian non mesuré à null', () => {
    const summary = buildMessageLearningSummary({
      ...none,
      express: { approved: 7, approvedWithoutEdit: 5, approvedAfterEdit: 2, rejected: 3, sample: 10 },
      behavioral: { ...none.behavioral, sent: 6, replied: 2, bounced: 1, optOut: 1, meetingBooked: 1, sample: 9 },
      quality: { wrongFact: 2, wrongCta: 0, wrongPersona: 1, flaggedMessages: 3 },
    })
    expect(summary.express).toEqual({ approvedWithoutEdit: 5, approvedAfterEdit: 2, rejected: 3, sample: 10 })
    expect(summary.behavioral).toMatchObject({ sent: 6, replied: 2, meetingBooked: 1, medianReplyDelayHours: null })
    expect(summary.quality).toEqual({ wrongFact: 2, wrongCta: 0, wrongPersona: 1, flaggedMessages: 3 })
    expect(JSON.stringify(summary)).not.toMatch(/rate|probab/i)
  })

  it("porte la règle proposée et l'historique tels quels, décidées comprises", () => {
    const history = [
      {
        version: 2,
        status: 'proposed' as const,
        summary: 'b',
        basedOnSample: 12,
        createdAt: '2026-10-02T08:00:00.000Z',
        decidedAt: null,
      },
      {
        version: 1,
        status: 'rejected' as const,
        summary: 'a',
        basedOnSample: 8,
        createdAt: '2026-09-30T08:00:00.000Z',
        decidedAt: '2026-10-01T08:00:00.000Z',
      },
    ]
    const summary = buildMessageLearningSummary({
      ...none,
      proposedRule: {
        scope: { level: 'workspace', workspaceId: 'w' },
        version: 1,
        status: 'proposed',
        summary: 'b',
        basedOnSample: 12,
      },
      history,
    })
    expect(summary.proposedRule).toEqual({ summary: 'b', basedOnSample: 12 })
    expect(summary.history).toEqual(history)
  })
})

// #2877.1 — le niveau GLOBAL atteint l'écran de l'espace : le texte et la taille
// d'échantillon de la règle commune, rien d'un espace nommé (portée absente).
describe('buildMessageLearningSummary — règle GLOBALE (#2877.1)', () => {
  const base = {
    express: { approved: 0, approvedWithoutEdit: 0, approvedAfterEdit: 0, rejected: 0, sample: 0 },
    behavioral: {
      sent: 0,
      delivered: 0,
      replied: 0,
      bounced: 0,
      failed: 0,
      expired: 0,
      medianReplyDelayHours: null,
      optOut: 0,
      meetingBooked: 0,
      sample: 0,
    },
    quality: { wrongFact: 0, wrongCta: 0, wrongPersona: 0, flaggedMessages: 0 },
    proposedRule: null,
    history: [],
  }

  it('porte la règle commune sans sa portée interne', () => {
    const summary = buildMessageLearningSummary({
      ...base,
      globalRule: { scope: { level: 'global' }, version: 1, status: 'proposed', summary: 'g', basedOnSample: 40 },
    })
    expect(summary.globalRule).toEqual({ summary: 'g', basedOnSample: 40 })
  })

  it('sans règle commune : null, pas une règle vide', () => {
    expect(buildMessageLearningSummary({ ...base, globalRule: null }).globalRule).toBeNull()
    expect(buildMessageLearningSummary(base).globalRule).toBeNull()
  })
})

// #2877 (#2385.5, niveau GLOBAL — Louis 11/10/2026 : « sers-toi d'un max de data
// possible et juste anonymise au besoin ») — le cinquième niveau se peuple
// depuis les cellules COMMUNES (k ≥ 3 espaces), jamais depuis un espace nommé.
describe('niveau GLOBAL — globalMessageLearningSignals + proposeGlobalMessageLearningRule', () => {
  const cells = [
    { signal: 'approved_without_edit', count: 7 },
    { signal: 'approved_after_edit', count: 4 },
    { signal: 'rejected', count: 2 },
    { signal: 'sent', count: 11 },
    { signal: 'replied', count: 3 },
    { signal: 'bounced', count: 1 },
  ]

  it('relit les comptes communs en signaux express et comportementaux — un signal absent vaut « non mesuré », pas un taux', () => {
    const { express, behavioral } = globalMessageLearningSignals(cells)
    expect(express).toEqual({ approved: 11, approvedWithoutEdit: 7, approvedAfterEdit: 4, rejected: 2, sample: 13 })
    expect(behavioral).toMatchObject({ sent: 11, replied: 3, bounced: 1, sample: 15, medianReplyDelayHours: null })
  })

  it('propose un candidat GOUVERNÉ au niveau global — aucun identifiant d’espace dans sa portée', () => {
    const { express, behavioral } = globalMessageLearningSignals(cells)
    const candidate = proposeGlobalMessageLearningRule(express, behavioral)
    expect(candidate?.scope).toEqual({ level: 'global' })
    expect(candidate?.status).toBe('proposed')
    expect(candidate?.summary).not.toMatch(/%|probab/i)
  })

  it('sait dire NON — sous le seuil d’échantillon, aucun candidat global', () => {
    const { express, behavioral } = globalMessageLearningSignals([{ signal: 'rejected', count: 2 }])
    expect(proposeGlobalMessageLearningRule(express, behavioral)).toBeNull()
  })
})
