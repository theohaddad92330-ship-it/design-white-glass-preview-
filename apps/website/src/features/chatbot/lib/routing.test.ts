import { describe, expect, it } from 'vitest'
import {
  answeredAxes,
  bookingVerdict,
  COLD_FROM,
  HOT_FROM,
  MAX_QUESTIONS,
  MAX_SCORE,
  nextQuestion,
  promptState,
  QUESTION_ORDER,
  resolveRoute,
  scoreLead,
  SCORING_AXES,
  stanceFor,
  WARM_FROM,
  type LeadState,
} from './routing'

/** Une ESN de 40 consultants, dirigeant, projet chiffré ce trimestre — le cas
 *  n°10 du golden set du §7.1. */
const HOT: LeadState = {
  companyType: 'esn',
  teamSize: '16-150',
  persona: 'founder',
  painFit: 'covered',
  tooling: 'excel_or_none',
  trigger: 'funded_project',
  decision: 'decider',
  horizon: 'this_quarter',
}

describe('le barème', () => {
  it('rend zéro sur un visiteur dont on ne sait rien', () => {
    expect(scoreLead({})).toBe(0)
  })

  it('atteint son maximum sur le profil idéal — et ce maximum est CALCULÉ', () => {
    expect(scoreLead(HOT)).toBe(MAX_SCORE)
    // Le §4.6 annonce 30 et ses propres tables en font 32. Ce test fige la
    // valeur qui décide, pas celle qui est écrite dans le document.
    expect(MAX_SCORE).toBe(32)
  })

  it('ne pénalise JAMAIS une absence — c’est la règle conservée du §4.6', () => {
    const partial: LeadState = { companyType: 'esn' }
    expect(scoreLead(partial)).toBe(4)
    expect(scoreLead(partial)).toBeGreaterThan(scoreLead({}))
  })

  it('ignore une valeur hors barème plutôt que de la compter', () => {
    expect(scoreLead({ companyType: 'directeur' as never })).toBe(0)
  })

  it('compte chaque axe une seule fois', () => {
    let running = 0
    for (const axis of SCORING_AXES) {
      const upTo = Object.fromEntries(
        SCORING_AXES.slice(0, SCORING_AXES.indexOf(axis) + 1).map(key => [key, HOT[key]]),
      ) as LeadState
      const score = scoreLead(upTo)
      expect(score).toBeGreaterThan(running)
      running = score
    }
    expect(running).toBe(MAX_SCORE)
  })

  it('classe une entreprise hors cible sans la disqualifier', () => {
    // « autre » vaut 0 sur l'axe type, mais la personne reste notable ailleurs.
    expect(scoreLead({ companyType: 'other', trigger: 'funded_project' })).toBe(5)
  })
})

describe('les quatre paliers, nommés par ce que Laura FAIT', () => {
  it.each([
    [HOT_FROM, 'engage'],
    [HOT_FROM + 5, 'engage'],
    [WARM_FROM, 'guide'],
    [HOT_FROM - 1, 'guide'],
    [COLD_FROM, 'inform'],
    [WARM_FROM - 1, 'inform'],
    [COLD_FROM - 1, 'be_honest'],
    [0, 'be_honest'],
  ] as const)('%i → %s', (score, stance) => {
    expect(stanceFor(score)).toBe(stance)
  })

  it('ne nomme jamais le visiteur — aucun palier ne s’appelle « chaud »', () => {
    const names = [0, 6, 12, 20, 32].map(stanceFor)
    for (const name of names) {
      expect(name).not.toMatch(/hot|warm|cold|chaud|ti[èe]de|froid|lead/i)
    }
  })
})

describe('le déblocage du rendez-vous — le défaut n°7 du transcript', () => {
  const qualified: LeadState = { companyType: 'esn', teamSize: '16-150', persona: 'founder', painFit: 'covered' }

  it('ne débloque rien quand personne n’a rien demandé', () => {
    expect(bookingVerdict({ state: qualified, booking: false, exchanges: 5 })).toEqual({
      unlocked: false,
      reason: 'not_requested',
    })
  })

  it('pose une question AVANT le lien quand on ne sait rien de la personne', () => {
    // Le cas n°4 du golden set : « je veux un rdv » à froid.
    expect(bookingVerdict({ state: {}, booking: true, exchanges: 1 })).toEqual({
      unlocked: false,
      reason: 'ask_first',
    })
  })

  it('exige les TROIS conditions, pas deux', () => {
    // Score suffisant et axes suffisants, mais la conversation vient de commencer.
    expect(bookingVerdict({ state: qualified, booking: true, exchanges: 2 }).unlocked).toBe(false)
    // Assez d'échanges, mais rien n'est renseigné.
    expect(bookingVerdict({ state: { companyType: 'esn' }, booking: true, exchanges: 9 }).unlocked).toBe(false)
    // Les trois réunies.
    expect(bookingVerdict({ state: qualified, booking: true, exchanges: 3 })).toEqual({
      unlocked: true,
      reason: 'qualified',
    })
  })

  it('lâche le lien SANS CONDITION à la deuxième demande — retenir, c’est perdre', () => {
    // Le cas n°5 du golden set. Rien n'est connu, un seul échange : le §4.9 est
    // pourtant catégorique, on ne retient jamais un lien plus d'un tour.
    expect(bookingVerdict({ state: { bookRequests: 2 }, booking: true, exchanges: 1 })).toEqual({
      unlocked: true,
      reason: 'insisted',
    })
  })
})

describe('la route', () => {
  it('donne la démo, le compte et le support sans rien demander', () => {
    expect(resolveRoute({}, 'demo')).toBe('demo')
    expect(resolveRoute({}, 'signup')).toBe('signup')
    expect(resolveRoute({}, 'bug')).toBe('support')
    expect(resolveRoute({}, 'existing_customer')).toBe('support')
    expect(resolveRoute({}, 'press')).toBe('human')
    expect(resolveRoute({}, 'candidate')).toBe('human')
  })

  it('ne donne le rendez-vous que si le verdict l’a débloqué', () => {
    expect(resolveRoute({}, 'book', { unlocked: false, reason: 'ask_first' })).toBe('demo')
    expect(resolveRoute({}, 'book', { unlocked: true, reason: 'insisted' })).toBe('calendly')
  })

  it('suit la posture quand aucune intention n’est explicite', () => {
    expect(resolveRoute(HOT, null)).toBe('calendly')
    // 4 + 4 + 3 + 3 = 14, soit le palier « guide ».
    expect(
      resolveRoute({ companyType: 'esn', teamSize: '16-150', persona: 'sales_director', painFit: 'adjacent' }, null),
    ).toBe('demo')
    expect(resolveRoute({ horizon: 'no_date' }, null)).toBe('resource')
  })
})

describe('la question suivante', () => {
  it('suit l’ordre de conversation, pas celui du barème', () => {
    expect(nextQuestion({})).toBe('companyType')
    expect(nextQuestion({ companyType: 'esn' })).toBe('painFit')
    expect(nextQuestion({ companyType: 'esn', painFit: 'covered' })).toBe('persona')
    expect(QUESTION_ORDER[0]).toBe('companyType')
    expect(QUESTION_ORDER[1]).toBe('painFit')
  })

  it('ne repose jamais une question déjà répondue', () => {
    const state: LeadState = { companyType: 'esn', persona: 'founder' }
    const asked = answeredAxes(state)
    expect(asked).toContain('companyType')
    expect(asked).toContain('persona')
    expect(asked).not.toContain(nextQuestion(state))
  })

  it('se tait au-delà de six questions — au-delà, on recommande', () => {
    expect(answeredAxes(HOT).length).toBeGreaterThanOrEqual(MAX_QUESTIONS)
    expect(nextQuestion(HOT)).toBeNull()
    const six: LeadState = {
      companyType: 'esn',
      painFit: 'covered',
      persona: 'founder',
      decision: 'decider',
      teamSize: '6-15',
      tooling: 'generic_crm',
    }
    expect(answeredAxes(six)).toHaveLength(MAX_QUESTIONS)
    expect(nextQuestion(six)).toBeNull()
  })

  it('couvre les huit axes, sans doublon ni oubli', () => {
    expect([...QUESTION_ORDER].sort()).toEqual([...SCORING_AXES].sort())
  })
})

describe('ce que le prompt reçoit — et surtout ce qu’il ne reçoit pas', () => {
  const context = { state: { ...HOT, firstName: 'Théo' }, booking: true, exchanges: 4 }

  it('ne contient NI le score, NI le maximum, NI le palier chiffré', () => {
    const serialized = JSON.stringify(promptState(context))
    expect(serialized).not.toContain(String(scoreLead(HOT)))
    expect(serialized).not.toContain(String(MAX_SCORE))
    expect(serialized).not.toMatch(/score/i)
  })

  it('porte ce qui est connu, ce qui a été demandé et ce qui vient ensuite', () => {
    const partial = promptState({
      state: { companyType: 'esn', pain: 'je perds du temps' },
      booking: false,
      exchanges: 1,
    })
    expect(partial.known.companyType).toBe('esn')
    expect(partial.known.pain).toBe('je perds du temps')
    expect(partial.asked).toEqual(['companyType'])
    expect(partial.next).toBe('painFit')
  })

  it('tutoie par défaut — c’est la forme du site et du produit', () => {
    expect(promptState({ state: {}, booking: false, exchanges: 1 }).addressForm).toBe('tu')
    expect(promptState({ state: { addressForm: 'vous' }, booking: false, exchanges: 1 }).addressForm).toBe('vous')
  })

  it('retient le prénom, et ne l’invente pas quand il n’a pas été donné', () => {
    expect(promptState(context).firstName).toBe('Théo')
    expect(promptState({ state: {}, booking: false, exchanges: 1 }).firstName).toBeUndefined()
  })

  it('dit si le lien de rendez-vous est débloqué', () => {
    expect(promptState(context).bookingUnlocked).toBe(true)
    expect(promptState({ state: {}, booking: true, exchanges: 1 }).bookingUnlocked).toBe(false)
  })
})
