import { OUTREACH_SEQUENCE_TEMPLATES } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import {
  clearJourneyDraft,
  initialJourney,
  journeyCadence,
  journeyCanContinue,
  journeyFromSearch,
  journeyLaunchRequest,
  journeyRuleRequest,
  journeySteps,
  JOURNEY_OBJECTIVES,
  loadJourneyDraft,
  reduceJourney,
  saveJourneyDraft,
  type JourneyEvent,
  type JourneyState,
} from './sequence-journey'

const run = (events: JourneyEvent[], from: JourneyState = initialJourney()) =>
  events.reduce((state, event) => reduceJourney(state, event), from)

const marie = { id: 'c1', full_name: 'Marie Dubois', title: 'DSI', email: 'marie@acme.fr' }
const paul = { id: 'c2', full_name: 'Paul Martin', title: 'DAF', email: 'paul@acme.fr' }

describe('l’assistant « Créer une séquence » — Audience · Objectif · Messages · Vérification (Théo C sequences-assistant.R1)', () => {
  it('quatre étapes linéaires, sans branche oui/non : audience → objectif → messages → vérification', () => {
    expect(journeySteps()).toEqual(['audience', 'objective', 'messages', 'review'])
  })

  it('part de l’AUDIENCE, « dès que je l’enregistre » par défaut, sans rien de choisi', () => {
    const state = initialJourney()
    expect(state.step).toBe('audience')
    expect(state.trigger).toBe('manual')
    expect(journeyCanContinue(state)).toBe(false)
  })

  it('une audience multi-contacts : plusieurs personnes cochées, c129 (renverse c74)', () => {
    const state = run([
      { type: 'toggleContact', contact: marie },
      { type: 'toggleContact', contact: paul },
    ])
    expect(state.contacts.size).toBe(2)
    expect(journeyCanContinue(state)).toBe(true)
    expect(reduceJourney(state, { type: 'toggleContact', contact: marie }).contacts.size).toBe(1)
  })

  it('le nom se saisit dès l’étape 1 (N5) et ne bloque pas la suite', () => {
    const state = run([{ type: 'setName', name: 'Ouverture Data · grands comptes' }])
    expect(state.name).toBe('Ouverture Data · grands comptes')
    expect(journeyCanContinue(reduceJourney(state, { type: 'toggleContact', contact: marie }))).toBe(true)
  })

  it('« sur signal » (ex-automatisation) : le signal remplace les contacts ; un délai hors bornes bloque', () => {
    const state = run([{ type: 'chooseTrigger', trigger: 'signal' }])
    expect(journeyCanContinue(state)).toBe(true) // le recrutement est proposé par défaut
    const inactive = reduceJourney(state, { type: 'chooseSignal', signal: 'inactive_account' })
    expect(journeyCanContinue(reduceJourney(inactive, { type: 'setDays', days: '0' }))).toBe(false)
    expect(journeyCanContinue(reduceJourney(inactive, { type: 'setDays', days: '60' }))).toBe(true)
  })

  it('trois objectifs nommés choisissent le modèle (N4), plus « seulement une action préparée » (A2)', () => {
    expect(JOURNEY_OBJECTIVES.map(objective => objective.key)).toEqual([
      'open_conversation',
      'present_expertise',
      'resume_exchange',
      'prepared_only',
    ])
    for (const objective of JOURNEY_OBJECTIVES) {
      expect(Object.keys(OUTREACH_SEQUENCE_TEMPLATES)).toContain(objective.template)
    }
    const state = run([{ type: 'chooseObjective', objective: 'resume_exchange' }])
    expect(state.template).toBe('dormant_connection')
    expect(run([{ type: 'chooseObjective', objective: 'prepared_only' }]).template).toBe('single_message')
  })

  it('le retour arrière ne perd RIEN : nom, contacts, objectif et cadence survivent', () => {
    const atReview = run([
      { type: 'setName', name: 'Ma campagne' },
      { type: 'toggleContact', contact: marie },
      { type: 'toggleContact', contact: paul },
      { type: 'next' },
      { type: 'chooseObjective', objective: 'present_expertise' },
      { type: 'next' },
      { type: 'setStepDay', index: 1, offsetDays: 6 },
      { type: 'next' },
    ])
    expect(atReview.step).toBe('review')
    const back = run([{ type: 'back' }, { type: 'back' }, { type: 'back' }], atReview)
    expect(back.step).toBe('audience')
    expect(back.name).toBe('Ma campagne')
    expect([...back.contacts.keys()]).toEqual(['c1', 'c2'])
    expect(back.template).toBe('nurturing')
    expect(journeyCadence(back)[1]?.offsetDays).toBe(6)
    expect(run([{ type: 'next' }, { type: 'next' }, { type: 'next' }], back)).toEqual(atReview)
  })

  it('« retour » sur la première étape ne plante pas ; « continuer » sans réponse ne saute pas l’étape', () => {
    expect(reduceJourney(initialJourney(), { type: 'back' }).step).toBe('audience')
    expect(reduceJourney(initialJourney(), { type: 'next' }).step).toBe('audience')
  })
})

describe('l’étape Messages — la cadence se lit et se règle dans l’assistant (N1, A3)', () => {
  const atMessages = () =>
    run([
      { type: 'toggleContact', contact: marie },
      { type: 'next' },
      { type: 'chooseObjective', objective: 'open_conversation' },
      { type: 'next' },
    ])

  it('affiche la cadence du modèle choisi : canal et jour de chaque touche', () => {
    const state = atMessages()
    expect(state.step).toBe('messages')
    const template = OUTREACH_SEQUENCE_TEMPLATES.prospection_3_touches.steps
    expect(journeyCadence(state).map(step => [step.kind, step.offsetDays])).toEqual(
      template.map(step => [step.kind, step.offset_days]),
    )
  })

  it('un canal ou un délai modifié devient une cadence PERSONNALISÉE ; le modèle intact reste le modèle', () => {
    const state = atMessages()
    expect(journeyLaunchRequest(state).customSteps).toBeNull()
    const edited = run(
      [
        { type: 'setStepKind', index: 0, kind: 'task' },
        { type: 'setStepDay', index: 2, offsetDays: 12 },
      ],
      state,
    )
    const launch = journeyLaunchRequest(edited)
    expect(launch.customSteps?.map(step => [step.kind, step.offsetDays])).toEqual([
      ['task', 0],
      ['reminder', 4],
      ['email', 12],
    ])
  })

  it('on ajoute et on retire une touche, la dernière ne se retire pas', () => {
    const added = reduceJourney(atMessages(), { type: 'addStep' })
    expect(journeyCadence(added)).toHaveLength(4)
    const reduced = run(
      [
        { type: 'removeStep', index: 0 },
        { type: 'removeStep', index: 0 },
        { type: 'removeStep', index: 0 },
      ],
      added,
    )
    expect(journeyCadence(reduced)).toHaveLength(1)
  })

  it('changer d’objectif repart de la cadence du nouveau modèle (aucune cadence orpheline)', () => {
    const edited = reduceJourney(atMessages(), { type: 'setStepDay', index: 1, offsetDays: 9 })
    const other = reduceJourney(edited, { type: 'chooseObjective', objective: 'resume_exchange' })
    expect(journeyLaunchRequest(other).customSteps).toBeNull()
  })

  it('le lancement porte le nom saisi et les contacts, la fenêtre de création refait les dernières gardes', () => {
    const state = run([{ type: 'setName', name: 'Data' }], atMessages())
    const launch = journeyLaunchRequest(state)
    expect(launch.name).toBe('Data')
    expect(launch.contacts.map(contact => contact.id)).toEqual(['c1'])
    expect(launch.template).toBe('prospection_3_touches')
  })
})

describe('le départ sur signal garde son moteur (c128 : une automatisation EST une séquence sur signal)', () => {
  it('la règle d’un parcours « sur signal » est la MÊME requête que l’ancien écran Automatisations', () => {
    const state = run([
      { type: 'chooseTrigger', trigger: 'signal' },
      { type: 'chooseSignal', signal: 'inactive_account' },
      { type: 'setDays', days: '45' },
      { type: 'choosePlaybook', playbook: 'win_back' },
    ])
    expect(journeyRuleRequest(state)).toEqual({
      signal: 'inactive_account',
      action_kind: 'enroll_sequence',
      playbook_key: 'win_back',
      inactive_days: 45,
    })
    expect(
      journeyRuleRequest(
        run([
          { type: 'chooseTrigger', trigger: 'signal' },
          { type: 'chooseSignal', signal: 'tender' },
        ]),
      ),
    ).toEqual({ signal: 'tender', action_kind: 'enroll_sequence', playbook_key: 'tender' })
  })

  it('aucune capacité de l’ancien constructeur perdue : « préparer seulement » un e-mail ou un appel', () => {
    const state = run([
      { type: 'chooseTrigger', trigger: 'signal' },
      { type: 'chooseSignal', signal: 'new_decision_maker' },
      { type: 'choosePrepared', prepared: 'call_to_make' },
    ])
    expect(journeyRuleRequest(state)).toEqual({
      signal: 'new_decision_maker',
      action_kind: 'prepare_action',
      prepared_action: 'call_to_make',
    })
    expect(journeyRuleRequest(reduceJourney(state, { type: 'choosePlaybook', playbook: 'new_cio' }))).toEqual({
      signal: 'new_decision_maker',
      action_kind: 'enroll_sequence',
      playbook_key: 'new_cio',
    })
  })

  it('un signal choisi propose son modèle naturel, jamais imposé', () => {
    const state = run([
      { type: 'chooseTrigger', trigger: 'signal' },
      { type: 'chooseSignal', signal: 'new_decision_maker' },
    ])
    expect(state.playbook).toBe('new_cio')
    const changed = reduceJourney(state, { type: 'choosePlaybook', playbook: 'warm_contact' })
    expect(reduceJourney(changed, { type: 'chooseSignal', signal: 'new_decision_maker' }).playbook).toBe('warm_contact')
  })
})

describe('« Quitter et conserver » — le brouillon de l’assistant (N3)', () => {
  const memory = () => {
    const store = new Map<string, string>()
    return {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    }
  }

  it('enregistre l’audience, le nom, l’objectif et la cadence, et les relit tels quels', () => {
    const storage = memory()
    const state = run([
      { type: 'setName', name: 'Ma campagne' },
      { type: 'toggleContact', contact: marie },
      { type: 'toggleContact', contact: paul },
      { type: 'next' },
      { type: 'chooseObjective', objective: 'present_expertise' },
      { type: 'next' },
      { type: 'setStepDay', index: 1, offsetDays: 7 },
    ])
    saveJourneyDraft(state, storage)
    const back = loadJourneyDraft(storage)
    expect(back).toEqual(state)
  })

  it('sans brouillon, ou avec un brouillon illisible, rien n’est inventé', () => {
    const storage = memory()
    expect(loadJourneyDraft(storage)).toBeNull()
    storage.setItem('bellum.sequence-journey.draft', '{pas du json')
    expect(loadJourneyDraft(storage)).toBeNull()
    storage.setItem('bellum.sequence-journey.draft', JSON.stringify({ step: 'nimporte' }))
    expect(loadJourneyDraft(storage)).toBeNull()
  })

  it('un stockage qui échoue ne casse pas l’assistant', () => {
    const broken = {
      getItem: () => {
        throw new Error('bloqué')
      },
      setItem: () => {
        throw new Error('bloqué')
      },
      removeItem: () => {
        throw new Error('bloqué')
      },
    }
    expect(() => saveJourneyDraft(initialJourney(), broken)).not.toThrow()
    expect(loadJourneyDraft(broken)).toBeNull()
    expect(() => clearJourneyDraft(broken)).not.toThrow()
  })

  it('vider le brouillon le supprime', () => {
    const storage = memory()
    saveJourneyDraft(initialJourney(), storage)
    clearJourneyDraft(storage)
    expect(loadJourneyDraft(storage)).toBeNull()
  })
})

describe('l’URL ouvre l’assistant', () => {
  it('`?parcours=1` sur l’audience, `?parcours=signal` déjà sur « quand un signal arrive »', () => {
    expect(journeyFromSearch({})).toBeNull()
    expect(journeyFromSearch({ parcours: '1' })).toEqual(initialJourney())
    const signal = journeyFromSearch({ parcours: 'signal' })
    expect(signal?.trigger).toBe('signal')
    expect(signal?.step).toBe('audience')
    expect(journeyFromSearch({ parcours: 'n’importe quoi' })).toBeNull()
  })

  // Théo C sequences-detail — « Dupliquer… » ouvre l'assistant avec le nom de la copie et la cadence de l'originale.
  it('`?parcours=1&nom=…&cadence=…` reprend le nom et la cadence de la séquence dupliquée', () => {
    const state = journeyFromSearch({
      parcours: '1',
      nom: '  Ouverture Data · Orange ',
      cadence: 'email.0,call.4,email.10',
    })
    expect(state?.name).toBe('Ouverture Data · Orange')
    expect(state?.cadence?.map(step => `${step.kind}.${step.offsetDays}`)).toEqual(['email.0', 'call.4', 'email.10'])
    expect(state?.step).toBe('audience')
  })

  it('une cadence illisible n’est jamais devinée : l’assistant repart de la cadence du modèle', () => {
    for (const cadence of ['sms.0', 'email.x', 'email.-1', 'email', '', 'email.0,'])
      expect(journeyFromSearch({ parcours: '1', cadence })?.cadence).toBeNull()
    expect(journeyFromSearch({ parcours: '1', cadence: Array(13).fill('email.0').join(',') })?.cadence).toBeNull()
  })

  it('le nom et la cadence ne servent qu’avec `parcours=1`', () => {
    expect(journeyFromSearch({ nom: 'x', cadence: 'email.0' })).toBeNull()
  })
})

describe('goTo — le fil des étapes est cliquable', () => {
  const contact = { id: 'c1', full_name: 'Marie Dubois', title: null, email: 'marie@acme.fr' }
  const withContact = () => reduceJourney(initialJourney(), { type: 'toggleContact', contact })

  it('revenir en arrière est toujours permis, et ne défait rien', () => {
    let state = withContact()
    state = reduceJourney(state, { type: 'next' })
    state = reduceJourney(state, { type: 'next' })
    expect(state.step).toBe('messages')
    const back = reduceJourney(state, { type: 'goTo', step: 'audience' })
    expect(back.step).toBe('audience')
    expect(back.contacts.size).toBe(1)
  })

  it('avancer saute les étapes déjà répondues, mais s’arrête devant celle qui attend un choix', () => {
    expect(reduceJourney(withContact(), { type: 'goTo', step: 'review' }).step).toBe('review')
    // Sans contact, l'audience attend sa réponse : aucun saut en avant.
    expect(reduceJourney(initialJourney(), { type: 'goTo', step: 'messages' }).step).toBe('audience')
  })

  it('aller à l’étape courante ne change rien', () => {
    const state = withContact()
    expect(reduceJourney(state, { type: 'goTo', step: 'audience' })).toEqual(state)
  })
})

describe('Théo C sequences-assistant — « Sélection métier » et l’ordre des étapes', () => {
  it('addContacts ajoute une audience entière, sans doublon ni perte de la sélection faite à la main', () => {
    const state = run([
      { type: 'toggleContact', contact: marie },
      { type: 'addContacts', contacts: [marie, paul] },
    ])
    expect([...state.contacts.keys()]).toEqual(['c1', 'c2'])
  })

  it('moveStep monte ou descend une touche ; les jours restent croissants, la première reste à J0', () => {
    const base = initialJourney()
    const before = journeyCadence(base)
    expect(before.length).toBeGreaterThan(1)
    const moved = reduceJourney(base, { type: 'moveStep', index: 1, direction: 'up' })
    const after = journeyCadence(moved)
    // La touche n°2 passe en tête (son canal y vient), le calendrier, lui, garde son ordre de jours.
    expect(after[0]?.kind).toBe(before[1]?.kind)
    expect(after[1]?.kind).toBe(before[0]?.kind)
    expect(after.map(step => step.offsetDays)).toEqual(before.map(step => step.offsetDays))
  })

  it('moveStep aux bords ne fait rien (la première ne monte pas, la dernière ne descend pas)', () => {
    const base = initialJourney()
    const last = journeyCadence(base).length - 1
    expect(journeyCadence(reduceJourney(base, { type: 'moveStep', index: 0, direction: 'up' }))).toEqual(
      journeyCadence(base),
    )
    expect(journeyCadence(reduceJourney(base, { type: 'moveStep', index: last, direction: 'down' }))).toEqual(
      journeyCadence(base),
    )
  })
})
