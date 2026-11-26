import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  applyMarketMemoryToLead,
  buildLeadDismissal,
  classifyLeadEvidence,
  dismissalStaysInWorkspace,
  LEAD_ACTIONS,
  LEAD_CONVERSION_FIELDS,
  LEAD_DISMISSAL_SCOPE,
  LEAD_DISMISS_REASONS,
  LEAD_EVIDENCE_LABELS,
  LEAD_EVIDENCE_LEVELS,
  LEAD_MIN_MEASURED_AXES,
  LEAD_MISSING_INFO,
  LEAD_PROPOSAL_REASON_LABELS,
  LEAD_PROPOSAL_REASONS,
  LEAD_VERIFICATION_LABELS,
  LEAD_VERIFICATIONS,
  LEAD_RANKING_AXES,
  LEAD_RANKING_AXIS_LABELS,
  leadConversionSchema,
  leadDecisionInputSchema,
  marketMemoryChangeIsLegal,
  rankQualificationLead,
  type LeadRankingInput,
} from './qualification-lead.js'

/**
 * #2172 — LA FILE « PISTES À QUALIFIER ».
 *
 * Une piste n'est pas une opportunité : c'est un signal qu'il faut aller
 * VÉRIFIER. Ce que ce contrat tient tient donc trois choses qu'aucun écran ne
 * doit pouvoir réinventer — les cinq niveaux de PREUVE, les six axes du rang,
 * et les deux gardes qui bornent ce qu'un écartement et la mémoire marché ont
 * le droit d'écrire.
 */

const BASE: LeadRankingInput = {
  offerFit: 'partial',
  lastFactAt: '2026-09-10T00:00:00.000Z',
  informationReachable: true,
  hasContactOrAccess: true,
  userRequested: false,
  knownConstraints: 'none',
}
const NOW = new Date('2026-09-15T00:00:00.000Z')

describe('#2172.4-.9 — les cinq niveaux de preuve', () => {
  it('en porte exactement cinq, nommés, et chacun traduit', () => {
    expect(LEAD_EVIDENCE_LEVELS).toEqual([
      'isolated_signal',
      'converging_signals',
      'detected_need',
      'crm_or_exchange',
      'copilot_proposal',
    ])
    for (const level of LEAD_EVIDENCE_LEVELS) {
      expect(LEAD_EVIDENCE_LABELS[level].fr.length).toBeGreaterThan(3)
      expect(LEAD_EVIDENCE_LABELS[level].en.length).toBeGreaterThan(3)
    }
  })

  it('ne sont PAS un entonnoir : le module n’expose aucune table de rang', () => {
    // La tentation est d'en faire une échelle et de trier dessus — c'est ce que
    // fait `accountTopOpportunities` pour les OPPORTUNITÉS, où l'échelle est
    // ordonnée par construction (`RANK: Record<EvidenceLevel, number>`). Ici,
    // « proposée par Laura » n'est pas au-dessus de « signal isolé » : c'est une
    // autre ORIGINE. La garde LIT le module — sinon elle serait vraie par
    // vacuité — et refuse qu'un rang numérique y réapparaisse.
    // ⚠️ Les COMMENTAIRES partent avant la lecture — le docstring du module
    // nomme justement la table interdite pour l'expliquer, et une garde qui
    // lirait les commentaires attraperait sa propre explication.
    const source = readFileSync(new URL('./qualification-lead.ts', import.meta.url), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^.*?\/\/.*$/gm, match => match.split('//')[0] ?? '')
    expect(source.length).toBeGreaterThan(2000)
    expect(source).toMatch(/LEAD_EVIDENCE_LEVELS/)
    expect(source).not.toMatch(/Record<LeadEvidenceLevel,\s*number>/)
  })

  it('classe par ORIGINE : ce que quelqu’un a formulé passe avant ce que Laura propose', () => {
    expect(
      classifyLeadEvidence({
        kind: 'signal',
        stage: 'detected',
        sourceFactCount: 1,
        expressed: false,
        proposedByCopilot: false,
      }),
    ).toBe('isolated_signal')
    expect(
      classifyLeadEvidence({
        kind: 'signal',
        stage: 'detected',
        sourceFactCount: 2,
        expressed: false,
        proposedByCopilot: false,
      }),
    ).toBe('converging_signals')
    expect(
      classifyLeadEvidence({
        kind: 'pain',
        stage: 'potential',
        sourceFactCount: 1,
        expressed: false,
        proposedByCopilot: false,
      }),
    ).toBe('detected_need')
    expect(
      classifyLeadEvidence({
        kind: 'imported',
        stage: 'detected',
        sourceFactCount: 0,
        expressed: false,
        proposedByCopilot: false,
      }),
    ).toBe('crm_or_exchange')
    expect(
      classifyLeadEvidence({
        kind: 'signal',
        stage: 'detected',
        sourceFactCount: 1,
        expressed: true,
        proposedByCopilot: true,
      }),
    ).toBe('crm_or_exchange')
    expect(
      classifyLeadEvidence({
        kind: 'signal',
        stage: 'detected',
        sourceFactCount: 1,
        expressed: false,
        proposedByCopilot: true,
      }),
    ).toBe('copilot_proposal')
  })

  it('rend `null` quand AUCUN fait ne soutient la piste — on ne lui invente pas d’origine', () => {
    expect(
      classifyLeadEvidence({
        kind: 'signal',
        stage: 'detected',
        sourceFactCount: 0,
        expressed: false,
        proposedByCopilot: false,
      }),
    ).toBeNull()
  })
})

describe('#2172.20-.25 — le rang, décomposé, jamais une probabilité', () => {
  it('nomme ses six axes, et chacun est traduit', () => {
    expect(LEAD_RANKING_AXES).toEqual([
      'offer_fit',
      'freshness',
      'information_reachable',
      'contact_or_access',
      'user_request',
      'known_constraints',
    ])
    for (const axis of LEAD_RANKING_AXES) {
      expect(LEAD_RANKING_AXIS_LABELS[axis].fr.length).toBeGreaterThan(3)
      expect(LEAD_RANKING_AXIS_LABELS[axis].en.length).toBeGreaterThan(3)
    }
  })

  it('rend un score DÉCOMPOSÉ : six verdicts, un par axe, dans l’ordre du contrat', () => {
    const ranking = rankQualificationLead(BASE, NOW)
    expect(ranking.axes.map(a => a.axis)).toEqual([...LEAD_RANKING_AXES])
    expect(ranking.score).not.toBeNull()
  })

  it('SORT du dénominateur l’axe non évaluable — et le NOMME', () => {
    const measuredAtZero = rankQualificationLead({ ...BASE, informationReachable: false }, NOW)
    const withHole = rankQualificationLead({ ...BASE, informationReachable: null }, NOW)
    // « Non mesuré » n'est pas « mesuré à zéro » : l'axe SORT du dénominateur,
    // il ne vaut pas 0 dedans. Le score doit donc être strictement meilleur que
    // celui du même dossier où l'information est mesurée ABSENTE.
    expect(withHole.measuredCount).toBe(5)
    expect(measuredAtZero.measuredCount).toBe(6)
    expect(withHole.score ?? 0).toBeGreaterThan(measuredAtZero.score ?? 0)
    expect(withHole.notMeasured).toContain('information_reachable')
    expect(withHole.axes.find(a => a.axis === 'information_reachable')?.measured).toBe(false)
  })

  it('une date ABSENTE est « non mesurée », jamais une fraîcheur nulle (GA-18/19)', () => {
    const ranking = rankQualificationLead({ ...BASE, lastFactAt: null }, NOW)
    expect(ranking.notMeasured).toContain('freshness')
    const freshness = ranking.axes.find(a => a.axis === 'freshness')
    expect(freshness?.measured).toBe(false)
    // Et surtout : pas de `value: 0` caché derrière le verdict.
    expect(freshness && 'value' in freshness).toBe(false)
  })

  it('refuse de noter sous trois axes mesurés — un score nu n’existe pas', () => {
    expect(LEAD_MIN_MEASURED_AXES).toBe(3)
    const ranking = rankQualificationLead(
      {
        offerFit: 'strong',
        lastFactAt: null,
        informationReachable: null,
        hasContactOrAccess: true,
        userRequested: null,
        knownConstraints: null,
      },
      NOW,
    )
    expect(ranking.measuredCount).toBe(2)
    expect(ranking.score).toBeNull()
    expect(ranking.notMeasured.length).toBe(4)
  })

  it('un axe mesuré à zéro RESTE dans le dénominateur — « bloquant » est une mesure', () => {
    const blocking = rankQualificationLead({ ...BASE, knownConstraints: 'blocking' }, NOW)
    expect(blocking.notMeasured).not.toContain('known_constraints')
    expect(blocking.measuredCount).toBe(6)
    expect(blocking.score).toBeLessThan(rankQualificationLead(BASE, NOW).score ?? 100)
  })
})

describe('#2172.26/.27 — la mémoire marché ne crée JAMAIS l’urgence ni le besoin', () => {
  const memory = { structuralFit: 'strong' as const }

  it('peut remonter la compatibilité STRUCTURELLE d’une piste', () => {
    const after = applyMarketMemoryToLead({ ...BASE, offerFit: 'partial' }, memory)
    expect(after.offerFit).toBe('strong')
  })

  it('ne touche NI la fraîcheur, NI la demande, NI l’accès — byte pour byte', () => {
    const before = { ...BASE, offerFit: 'none' as const }
    const after = applyMarketMemoryToLead(before, memory)
    expect(after.lastFactAt).toBe(before.lastFactAt)
    expect(after.userRequested).toBe(before.userRequested)
    expect(after.hasContactOrAccess).toBe(before.hasContactOrAccess)
    expect(after.informationReachable).toBe(before.informationReachable)
    expect(after.knownConstraints).toBe(before.knownConstraints)
  })

  it('ne DESCEND jamais une compatibilité mieux établie par les faits du compte', () => {
    const after = applyMarketMemoryToLead({ ...BASE, offerFit: 'strong' }, { structuralFit: 'none' })
    expect(after.offerFit).toBe('strong')
  })

  it('SAIT DIRE NON : une mémoire marché qui avancerait la date est refusée', () => {
    // La garde est un invariant, pas une convention : on lui donne le résultat
    // d'une implémentation VOLONTAIREMENT fautive (celle qui « rafraîchit » la
    // piste) et elle doit le rejeter.
    const fautif = { ...BASE, lastFactAt: NOW.toISOString() }
    expect(marketMemoryChangeIsLegal(BASE, fautif)).toBe(false)
    expect(marketMemoryChangeIsLegal(BASE, { ...BASE, userRequested: true })).toBe(false)
    expect(marketMemoryChangeIsLegal(BASE, { ...BASE, offerFit: 'strong' })).toBe(true)
  })

  it('SAIT DIRE NON : elle ne fabrique pas un niveau de preuve', () => {
    // Le niveau vient des FAITS du compte. La mémoire marché n'entre pas dans
    // `classifyLeadEvidence` — la signature ne la connaît pas, et c'est la
    // forme la plus forte de la garde.
    expect(Object.keys(applyMarketMemoryToLead(BASE, memory))).toEqual(Object.keys(BASE))
  })
})

describe('#2172.42-.49/.54 — l’écartement : sept motifs, mémorisés, bornés à l’espace', () => {
  it('porte exactement les sept motifs, dans l’ordre, `other` en dernier', () => {
    expect(LEAD_DISMISS_REASONS).toEqual([
      'out_of_target',
      'no_real_demand',
      'bad_timing',
      'no_access',
      'false_data',
      'already_handled',
      'other',
    ])
  })

  it('pose une pierre tombale DATÉE et MOTIVÉE — on archive, on ne supprime pas', () => {
    const dismissal = buildLeadDismissal({
      leadKey: 'lead-1',
      reason: 'bad_timing',
      note: 'Budget arbitré en janvier',
      at: NOW,
    })
    expect(dismissal.reason).toBe('bad_timing')
    expect(dismissal.dismissedAt).toBe(NOW.toISOString())
    expect(dismissal.note).toBe('Budget arbitré en janvier')
    expect(dismissal.scope).toBe(LEAD_DISMISSAL_SCOPE)
    expect(LEAD_DISMISSAL_SCOPE).toBe('workspace')
  })

  it('n’écrit RIEN dans la donnée marché globale', () => {
    const dismissal = buildLeadDismissal({ leadKey: 'lead-1', reason: 'out_of_target', note: null, at: NOW })
    expect(dismissal.marketMemoryWrite).toBeNull()
    expect(dismissalStaysInWorkspace(dismissal)).toBe(true)
  })

  it('SAIT DIRE NON : un écartement qui remonterait au marché est refusé', () => {
    expect(
      dismissalStaysInWorkspace({
        ...buildLeadDismissal({ leadKey: 'lead-1', reason: 'false_data', note: null, at: NOW }),
        scope: 'global',
      }),
    ).toBe(false)
    expect(
      dismissalStaysInWorkspace({
        ...buildLeadDismissal({ leadKey: 'lead-1', reason: 'false_data', note: null, at: NOW }),
        marketMemoryWrite: { fact: 'out_of_target' },
      }),
    ).toBe(false)
  })
})

describe('#2172.42-.49 — le corps d’une décision : la portée n’est pas un paramètre', () => {
  it('refuse un écartement sans motif, une veille sans échéance, et une veille qui refuse', () => {
    expect(leadDecisionInputSchema.safeParse({ decision: 'dismissed', reason: 'no_access' }).success).toBe(true)
    expect(leadDecisionInputSchema.safeParse({ decision: 'dismissed' }).success).toBe(false)
    expect(leadDecisionInputSchema.safeParse({ decision: 'snoozed', snoozed_until: '2026-10-01' }).success).toBe(true)
    expect(leadDecisionInputSchema.safeParse({ decision: 'snoozed' }).success).toBe(false)
    expect(
      leadDecisionInputSchema.safeParse({ decision: 'snoozed', snoozed_until: '2026-10-01', reason: 'bad_timing' })
        .success,
    ).toBe(false)
  })

  it('SAIT DIRE NON : un appelant ne peut pas écarter « pour tout le monde »', () => {
    expect(
      leadDecisionInputSchema.safeParse({ decision: 'dismissed', reason: 'out_of_target', scope: 'global' }).success,
    ).toBe(false)
  })
})

describe('#2172.28-.35/.36-.41/.53 — les actions et la conversion', () => {
  it('porte les huit actions de la file', () => {
    expect(LEAD_ACTIONS).toEqual([
      'qualify_now',
      'add_to_pipe',
      'create_need',
      'analyse_account',
      'find_contacts',
      'ask_laura',
      'snooze',
      'dismiss',
    ])
  })

  it('ne demande QUE cinq champs à la conversion — tout le reste est déjà connu', () => {
    expect(LEAD_CONVERSION_FIELDS).toEqual(['owner_id', 'objective', 'initial_stage', 'next_action', 'need'])
    expect(Object.keys(leadConversionSchema.shape).sort()).toEqual([...LEAD_CONVERSION_FIELDS].sort())
  })

  it('REFUSE une ressaisie de ce qui est déjà su', () => {
    const ok = leadConversionSchema.safeParse({
      owner_id: 'user-1',
      objective: 'Cadrer la supervision 24/7',
      initial_stage: 'qualified',
      next_action: { title: 'Appeler le DSI', due_on: '2026-09-22' },
      need: null,
    })
    expect(ok.success).toBe(true)

    const resaisie = leadConversionSchema.safeParse({
      owner_id: 'user-1',
      objective: 'Cadrer la supervision 24/7',
      initial_stage: 'qualified',
      next_action: { title: 'Appeler le DSI', due_on: '2026-09-22' },
      need: null,
      company_name: 'Transports Aurignac',
    })
    expect(resaisie.success).toBe(false)
  })
})

describe('#2172.17/.18 — la raison et la vérification sont des CODES traduits', () => {
  it('porte les deux tables, FR et EN, sans trou', () => {
    expect(LEAD_PROPOSAL_REASONS.length).toBe(4)
    expect(LEAD_VERIFICATIONS.length).toBe(5)
    for (const code of LEAD_PROPOSAL_REASONS) {
      expect(LEAD_PROPOSAL_REASON_LABELS[code].fr.length).toBeGreaterThan(10)
      expect(LEAD_PROPOSAL_REASON_LABELS[code].en.length).toBeGreaterThan(10)
    }
    for (const code of LEAD_VERIFICATIONS) {
      // Une vérification vague (« à qualifier ») ne dit rien : elle nomme le
      // geste ET son objet, donc elle est forcément longue.
      expect(LEAD_VERIFICATION_LABELS[code].fr.length).toBeGreaterThan(25)
      expect(LEAD_VERIFICATION_LABELS[code].en.length).toBeGreaterThan(25)
    }
  })
})

describe('#2172.16 — l’information qui MANQUE est nommée, jamais blanche', () => {
  it('porte un libellé FR et EN pour chaque manque', () => {
    expect(Object.keys(LEAD_MISSING_INFO).length).toBeGreaterThanOrEqual(5)
    for (const gap of Object.values(LEAD_MISSING_INFO)) {
      expect(gap.fr.length).toBeGreaterThan(5)
      expect(gap.en.length).toBeGreaterThan(5)
    }
  })
})
