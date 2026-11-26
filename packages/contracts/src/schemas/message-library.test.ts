import { describe, expect, it } from 'vitest'
import {
  confirmMessageClaim,
  evaluateReadiness,
  messageLibraryEntrySchema,
  messageLibrarySelectionCriteriaSchema,
  relationshipStateOf,
  renderVerbatim,
  selectApprovedTemplate,
  selectBehaviorExamples,
  type MessageLibraryEntry,
} from './message-library.js'

function entry(overrides: Partial<MessageLibraryEntry> = {}): MessageLibraryEntry {
  return {
    id: 'ml-accepted-decideur-m1',
    title: 'M1 — Décideur — connexion acceptée',
    text: 'Bonjour {{Prenom}}, ravi d’échanger sur {{domaine}} chez {{Entreprise}}.',
    origin: 'beta-feedback #3437',
    sourceDocument: 'issue-3437',
    version: 1,
    date: '2026-09-30T00:00:00.000Z',
    channel: 'linkedin_draft',
    scenarioId: 'accepted_connection',
    persona: 'decideur',
    decisionRole: 'decideur',
    stage: 'premier_contact',
    route: 'invitation_acceptee',
    objective: 'ouvrir une conversation sans pitch',
    expectedVariables: ['Prenom', 'domaine', 'Entreprise'],
    mandatoryFacts: [],
    claims: [],
    status: 'approuve',
    mode: 'verbatim',
    usageConstraints: [],
    ...overrides,
  }
}

describe('messageLibraryEntrySchema', () => {
  it('accepts a well-formed entry', () => {
    expect(messageLibraryEntrySchema.safeParse(entry()).success).toBe(true)
  })

  it('rejects an unknown scenario id — the four scenarios are the shared registry, not a new enum', () => {
    const result = messageLibraryEntrySchema.safeParse({ ...entry(), scenarioId: 'made_up' })
    expect(result.success).toBe(false)
  })
})

describe('relationshipStateOf', () => {
  it('derives from OUTREACH_SCENARIOS instead of storing the relation a second time (GA-26)', () => {
    expect(relationshipStateOf(entry())).toBe('newly_connected')
    expect(relationshipStateOf(entry({ scenarioId: 'cold_approach' }))).toBe('no_relationship')
  })
})

describe('evaluateReadiness — the absolute rule', () => {
  it('is ready when approved with no dangling claim', () => {
    expect(evaluateReadiness(entry())).toEqual({ ready: true })
  })

  it('never activates a historique entry, even with every claim verified', () => {
    const result = evaluateReadiness(
      entry({
        status: 'historique',
        claims: [{ kind: 'resultat', statement: 'a doublé son pipeline', verifiedFactId: 'fact-1' }],
      }),
    )
    expect(result.ready).toBe(false)
    if (!result.ready) expect(result.reason).toContain('historique')
  })

  it('never activates an interdit entry', () => {
    const result = evaluateReadiness(entry({ status: 'interdit' }))
    expect(result.ready).toBe(false)
  })

  it('blocks on any claim without a verifiedFactId, across all eleven claim kinds', () => {
    const result = evaluateReadiness(
      entry({
        claims: [
          { kind: 'client', statement: 'nous travaillons déjà avec Renault', verifiedFactId: null },
          { kind: 'chiffre', statement: 'divisé par deux le délai', verifiedFactId: 'fact-2' },
        ],
      }),
    )
    expect(result.ready).toBe(false)
    if (!result.ready) {
      expect(result.blockedClaims).toHaveLength(1)
      expect(result.blockedClaims[0]?.kind).toBe('client')
    }
  })

  it('is ready once every claim carries a verifiedFactId', () => {
    const result = evaluateReadiness(
      entry({ claims: [{ kind: 'delai', statement: 'réponse sous 48h', verifiedFactId: 'fact-3' }] }),
    )
    expect(result).toEqual({ ready: true })
  })

  it('is not ready when status is a_revoir even without claims', () => {
    const result = evaluateReadiness(entry({ status: 'a_revoir' }))
    expect(result.ready).toBe(false)
  })

  // #3439 (recette prod, 30/09/2026) — « Sans cela, le scénario ne doit pas
  // être proposé » (corps de l'issue, les 4 conditions du scénario
  // référé). `mandatoryFacts` était déclaré, SEMÉ (SEQUENCE_3439,
  // REFERRAL_MANDATORY_FACTS) et jamais LU par `evaluateReadiness` — un
  // champ approuvé par erreur (status `approuve`, aucune `claims` en
  // attente) aurait pu passer `ready: true` sans qu'aucun des 4 faits
  // obligatoires n'ait jamais été confirmé. `verifiedFactId` n'existe que
  // sur `claims` : `mandatoryFacts` reste donc bloquant tant qu'aucun
  // mécanisme de confirmation par fait ne lui est ajouté (décision
  // produit distincte, non prise ici).
  it('#3439 — un fait obligatoire non confirmé bloque, même approuvé et sans claim en attente', () => {
    const result = evaluateReadiness(
      entry({ status: 'approuve', mandatoryFacts: ['identité du référent confirmée'], claims: [] }),
    )
    expect(result.ready).toBe(false)
    if (!result.ready) expect(result.reason).toContain('obligatoire')
  })

  const confirmation = (fact: string) => ({
    fact,
    confirmedBy: 'user-1',
    confirmedAt: '2026-10-01T08:00:00.000Z',
  })

  it('#3439.1 — chaque fait obligatoire CONFIRMÉ (qui, quand) lève le blocage, et lui seul', () => {
    const facts = ['identité du référent', 'accord de citation', 'relation documentée', 'périmètre confirmé']
    const partial = evaluateReadiness(
      entry({ mandatoryFacts: facts, factConfirmations: facts.slice(0, 3).map(confirmation) }),
    )
    expect(partial.ready).toBe(false)
    if (!partial.ready) {
      expect(partial.reason).toContain('périmètre confirmé')
      expect(partial.reason).not.toContain('identité du référent')
    }
    expect(evaluateReadiness(entry({ mandatoryFacts: facts, factConfirmations: facts.map(confirmation) }))).toEqual({
      ready: true,
    })
  })

  it('#3439.1 — une confirmation d’un fait qui n’est pas déclaré ne débloque rien', () => {
    const result = evaluateReadiness(
      entry({ mandatoryFacts: ['identité du référent'], factConfirmations: [confirmation('autre fait')] }),
    )
    expect(result.ready).toBe(false)
  })

  it('#3439.1 — confirmé ne contourne ni le statut archivé ni une affirmation sans donnée', () => {
    const base = { mandatoryFacts: ['x'], factConfirmations: [confirmation('x')] }
    expect(evaluateReadiness(entry({ ...base, status: 'interdit' })).ready).toBe(false)
    expect(
      evaluateReadiness(entry({ ...base, claims: [{ kind: 'client', statement: 'c', verifiedFactId: null }] })).ready,
    ).toBe(false)
  })

  it('#3439 — sans fait obligatoire déclaré, la règle ne change rien pour les entrées existantes', () => {
    expect(evaluateReadiness(entry({ mandatoryFacts: [] }))).toEqual({ ready: true })
  })
})

describe('selectApprovedTemplate — structured criteria, never keyword similarity', () => {
  it('selects the entry matching channel + scenario + persona, ignoring near-identical wording elsewhere', () => {
    const decoy = entry({
      id: 'ml-dormant-decideur-m1',
      scenarioId: 'dormant_connection',
      text: 'Bonjour {{Prenom}}, ravi d’échanger sur {{domaine}} chez {{Entreprise}}.', // same words, wrong scenario
    })
    const target = entry({ id: 'ml-accepted-decideur-m1' })
    const trace = selectApprovedTemplate([decoy, target], {
      channel: 'linkedin_draft',
      scenarioId: 'accepted_connection',
      persona: 'decideur',
    })
    expect(trace.selectedId).toBe('ml-accepted-decideur-m1')
    expect(trace.rejected).toContainEqual(
      expect.objectContaining({
        id: 'ml-dormant-decideur-m1',
        reason: 'scénario dormant_connection ≠ accepted_connection demandé',
      }),
    )
  })

  it('#3427 — un écarté porte son titre et passe devant les hors-critères quand il bloque l’usage', () => {
    const off = entry({ id: 'off', title: 'Hors critères', scenarioId: 'dormant_connection' })
    const blocked = entry({
      id: 'blocked',
      title: 'Invitation acceptée — décideur',
      claims: [{ kind: 'client', statement: 'référence Renault', verifiedFactId: null }],
    })
    const trace = selectApprovedTemplate([off, blocked], {
      channel: 'linkedin_draft',
      scenarioId: 'accepted_connection',
      persona: 'decideur',
    })
    expect(trace.selectedId).toBeNull()
    expect(trace.rejected[0]).toMatchObject({
      id: 'blocked',
      title: 'Invitation acceptée — décideur',
      matchesCriteria: true,
    })
    expect(trace.rejected[0]?.reason).toContain('non soutenue')
    expect(trace.rejected[1]).toMatchObject({ id: 'off', title: 'Hors critères', matchesCriteria: false })
  })

  it('#3427 — une bibliothèque VIDE se dit vide (et nomme le geste d’import), pas « aucun modèle » nu', () => {
    const trace = selectApprovedTemplate([], {
      channel: 'linkedin_draft',
      scenarioId: 'accepted_connection',
      persona: 'decideur',
    })
    expect(trace.selectedId).toBeNull()
    expect(trace.rejected).toEqual([])
    expect(trace.reasons.join(' ')).toMatch(/bibliothèque.*vide/i)
    expect(trace.reasons.join(' ')).toContain('Importer les séquences livrées')
  })

  it('TÉMOIN — une bibliothèque non vide ne se dit jamais vide', () => {
    const trace = selectApprovedTemplate([entry({ scenarioId: 'dormant_connection' })], {
      channel: 'linkedin_draft',
      scenarioId: 'accepted_connection',
      persona: 'decideur',
    })
    expect(trace.reasons.join(' ')).not.toMatch(/vide/i)
  })

  it('never returns an inspiration-mode entry', () => {
    const trace = selectApprovedTemplate([entry({ mode: 'inspiration' })], {
      channel: 'linkedin_draft',
      scenarioId: 'accepted_connection',
      persona: 'decideur',
    })
    expect(trace.selectedId).toBeNull()
    expect(trace.rejected[0]?.reason).toContain('inspiration')
  })

  it('never returns an entry blocked by the absolute rule, and names why', () => {
    const trace = selectApprovedTemplate(
      [entry({ claims: [{ kind: 'client', statement: 'référence Renault', verifiedFactId: null }] })],
      { channel: 'linkedin_draft', scenarioId: 'accepted_connection', persona: 'decideur' },
    )
    expect(trace.selectedId).toBeNull()
    expect(trace.rejected[0]?.reason).toContain('non soutenue')
  })

  it('is deterministic: the highest version wins on a tie', () => {
    const v1 = entry({ id: 'v1', version: 1 })
    const v2 = entry({ id: 'v2', version: 2 })
    const trace = selectApprovedTemplate([v1, v2], {
      channel: 'linkedin_draft',
      scenarioId: 'accepted_connection',
      persona: 'decideur',
    })
    expect(trace.selectedId).toBe('v2')
  })
})

describe('renderVerbatim', () => {
  it('substitutes every expected variable and reports which ones', () => {
    const result = renderVerbatim(entry(), { Prenom: 'Julie', domaine: 'cloud', Entreprise: 'Acme' })
    expect(result).toEqual({
      ok: true,
      text: 'Bonjour Julie, ravi d’échanger sur cloud chez Acme.',
      variablesSubstituted: { Prenom: 'Julie', domaine: 'cloud', Entreprise: 'Acme' },
    })
  })

  it('refuses to invent a missing variable — no fictional data', () => {
    const result = renderVerbatim(entry(), { Prenom: 'Julie', domaine: 'cloud', Entreprise: '' })
    expect(result).toEqual({ ok: false, reason: 'variables attendues manquantes', missingVariables: ['Entreprise'] })
  })

  it('refuses to render a blocked entry even with all variables present', () => {
    const blocked = entry({ status: 'historique' })
    const result = renderVerbatim(blocked, { Prenom: 'Julie', domaine: 'cloud', Entreprise: 'Acme' })
    expect(result.ok).toBe(false)
  })
})

describe('selectBehaviorExamples — #3443/#3446 test 6, l’exemple de comportement', () => {
  const criteria = { channel: 'call_brief', scenarioId: 'cold_approach', persona: 'manager' } as const
  const example = (o: Partial<MessageLibraryEntry> = {}) =>
    entry({
      id: 'ex-1',
      mode: 'inspiration',
      channel: 'call_brief',
      scenarioId: 'cold_approach',
      persona: 'manager',
      ...o,
    })

  it('rend un exemple inspiration par critères structurés, marqué « comportement seulement »', () => {
    const out = selectBehaviorExamples([example()], criteria)
    expect(out.examples.map(e => e.id)).toEqual(['ex-1'])
    expect(out.examples[0]?.usage).toBe('behavior_only')
  })

  it('n’écarte pas un modèle verbatim par erreur : un verbatim n’est jamais un exemple de comportement', () => {
    const out = selectBehaviorExamples([example({ id: 'v', mode: 'verbatim' })], criteria)
    expect(out.examples).toEqual([])
    expect(out.rejected).toContainEqual({
      id: 'v',
      reason: 'mode verbatim : un modèle à reprendre, pas un exemple de comportement',
    })
  })

  it('écarte un exemple archivé, interdit ou à revoir, et dit pourquoi', () => {
    const out = selectBehaviorExamples(
      [
        example({ id: 'h', status: 'historique' }),
        example({ id: 'i', status: 'interdit' }),
        example({ id: 'r', status: 'a_revoir' }),
      ],
      criteria,
    )
    expect(out.examples).toEqual([])
    expect(out.rejected.map(r => r.id).sort()).toEqual(['h', 'i', 'r'])
  })

  it('écarte un autre scénario, canal ou persona (jamais par ressemblance de mots)', () => {
    const out = selectBehaviorExamples(
      [
        example({ id: 'a', scenarioId: 'dormant_connection' }),
        example({ id: 'b', channel: 'email_draft' }),
        example({ id: 'c', persona: 'acheteur' }),
      ],
      criteria,
    )
    expect(out.examples).toEqual([])
    expect(out.rejected).toHaveLength(3)
  })

  it('une affirmation non soutenue reste NOMMÉE : Laura ne la reprend pas comme un fait', () => {
    const out = selectBehaviorExamples(
      [example({ claims: [{ kind: 'client', statement: 'références comparables', verifiedFactId: null }] })],
      criteria,
    )
    expect(out.examples[0]?.unverifiedClaims).toEqual(['références comparables'])
  })

  it('un fait obligatoire non confirmé écarte l’exemple', () => {
    const out = selectBehaviorExamples([example({ mandatoryFacts: ['x'] })], criteria)
    expect(out.examples).toEqual([])
  })

  it('aucun exemple : le dit, sans texte de remplacement', () => {
    const out = selectBehaviorExamples([], criteria)
    expect(out).toMatchObject({ examples: [], reasons: ['aucun exemple de comportement ne correspond aux critères'] })
  })
})

describe('selectApprovedTemplate — l’ÉTAPE de la séquence (#3437, #3438, #3440)', () => {
  const m1 = entry({ id: 'm1', title: 'M1 — Décideur', step: 'M1' })
  const m2 = entry({ id: 'm2', title: 'M2 — Décideur', step: 'M2' })
  const m3 = entry({ id: 'm3', title: 'M3 — Décideur', step: 'M3' })
  const criteria = { channel: 'linkedin_draft', scenarioId: 'accepted_connection', persona: 'decideur' } as const

  it('rend l’étape DEMANDÉE, pas l’une des trois au hasard de l’ordre de lecture', () => {
    for (const wanted of ['M1', 'M2', 'M3'] as const) {
      const trace = selectApprovedTemplate([m3, m1, m2], { ...criteria, step: wanted })
      expect(trace.selectedId).toBe(wanted.toLowerCase())
    }
  })

  it('NON — une étape sans modèle approuvé ne se remplace pas par une autre étape', () => {
    const blocked = entry({ id: 'm2', step: 'M2', status: 'a_revoir' })
    const trace = selectApprovedTemplate([m1, blocked, m3], { ...criteria, step: 'M2' })
    expect(trace.selectedId).toBeNull()
    expect(trace.rejected.find(r => r.id === 'm2')?.matchesCriteria).toBe(true)
    expect(trace.rejected.find(r => r.id === 'm1')?.reason).toMatch(/étape M1 ≠ M2/)
  })

  it('sans étape demandée, la plus précoce gagne (l’ouverture), quel que soit l’ordre de lecture', () => {
    expect(selectApprovedTemplate([m3, m2, m1], criteria).selectedId).toBe('m1')
    expect(selectApprovedTemplate([m3, m2], criteria).selectedId).toBe('m2')
  })

  it('une entrée sans étape reste sélectionnable quand aucune étape n’est demandée, et passe après les autres', () => {
    const legacy = entry({ id: 'legacy', title: 'Ancienne', step: undefined })
    expect(selectApprovedTemplate([legacy], criteria).selectedId).toBe('legacy')
    expect(selectApprovedTemplate([legacy, m3], criteria).selectedId).toBe('m3')
  })

  it('l’étape fait partie des critères structurés acceptés par le schéma', () => {
    expect(messageLibrarySelectionCriteriaSchema.safeParse({ ...criteria, step: 'M2' }).success).toBe(true)
    expect(messageLibrarySelectionCriteriaSchema.safeParse({ ...criteria, step: 'M9' }).success).toBe(false)
  })
})

// #3437 / #3438 (recette prod 03/10) — « M2 Décideur écarté sans nommer le chiffre non sourcé » et
// « rendre M2 manager/opérationnel servables » : l'écart NOMME l'affirmation, et un humain peut la
// confirmer — c'est lui, jamais le modèle, qui lève le blocage.
describe('affirmation non soutenue — nommée, et confirmable par un humain', () => {
  const claim = { kind: 'chiffre', statement: '6 semaines → 5 jours, 3 consultants', verifiedFactId: null } as const

  it('le motif d’écart NOMME le chiffre non sourcé', () => {
    const result = evaluateReadiness(entry({ claims: [claim], status: 'a_revoir' }))
    expect(result).toMatchObject({ ready: false })
    expect((result as { reason: string }).reason).toContain('affirmation non soutenue')
    expect((result as { reason: string }).reason).toContain('6 semaines → 5 jours, 3 consultants')
  })

  it('confirmer la dernière affirmation d’une entrée « à revoir » la rend servable, et trace qui/quand', () => {
    const confirmed = confirmMessageClaim(
      entry({ claims: [claim], status: 'a_revoir' }),
      0,
      'u-1',
      '2026-10-03T08:00:00.000Z',
    )
    expect(confirmed.claims[0]?.verifiedFactId).toBe('confirmed-by:u-1@2026-10-03T08:00:00.000Z')
    expect(confirmed.status).toBe('approuve')
    expect(evaluateReadiness(entry({ ...confirmed }))).toEqual({ ready: true })
  })

  it('⚠️ SAIT DIRE NON — une autre affirmation encore non confirmée garde l’entrée à revoir', () => {
    const second = { ...claim, statement: 'sous 48 h' }
    const confirmed = confirmMessageClaim(
      entry({ claims: [claim, second], status: 'a_revoir' }),
      0,
      'u-1',
      '2026-10-03T08:00:00.000Z',
    )
    expect(confirmed.status).toBe('a_revoir')
    expect(confirmed.claims[1]?.verifiedFactId).toBeNull()
  })

  it('⚠️ SAIT DIRE NON — un fait obligatoire non confirmé, ou un texte tronqué, n’est pas approuvé par ce geste', () => {
    expect(
      confirmMessageClaim(
        entry({ claims: [claim], status: 'a_revoir', mandatoryFacts: ['x'] }),
        0,
        'u-1',
        '2026-10-03T08:00:00.000Z',
      ).status,
    ).toBe('a_revoir')
    expect(
      confirmMessageClaim(
        entry({ claims: [claim], status: 'a_revoir', usageConstraints: ['texte tronqué — à compléter'] }),
        0,
        'u-1',
        '2026-10-03T08:00:00.000Z',
      ).status,
    ).toBe('a_revoir')
  })

  it('⚠️ SAIT DIRE NON — un statut archivé ou interdit ne devient jamais approuvé', () => {
    expect(
      confirmMessageClaim(entry({ claims: [claim], status: 'historique' }), 0, 'u-1', '2026-10-03T08:00:00.000Z')
        .status,
    ).toBe('historique')
  })

  it('une affirmation déjà confirmée garde son premier confirmant', () => {
    const once = confirmMessageClaim(
      entry({ claims: [claim], status: 'a_revoir' }),
      0,
      'u-1',
      '2026-10-03T08:00:00.000Z',
    )
    const twice = confirmMessageClaim(entry({ ...once }), 0, 'u-2', '2026-10-04T08:00:00.000Z')
    expect(twice.claims[0]?.verifiedFactId).toBe('confirmed-by:u-1@2026-10-03T08:00:00.000Z')
  })

  it('un index hors liste est refusé', () => {
    expect(() => confirmMessageClaim(entry({ claims: [claim] }), 3, 'u-1', '2026-10-03T08:00:00.000Z')).toThrow()
  })
})
