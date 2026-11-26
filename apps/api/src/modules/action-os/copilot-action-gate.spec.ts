import { actionIntentTypeSchema, intentSite, type ActionIntentType } from '@bellum/contracts'
import {
  authorizeAtActionLevel,
  resolveActionLevel,
  simulateAtActionLevel,
  simulationValidates,
  type ActionGesture,
} from './copilot-action-gate'

/** Un geste minimal : tout ce que la porte a besoin de savoir, et rien de plus. */
function gesture(intentType: ActionIntentType, over: Partial<ActionGesture> = {}): ActionGesture {
  return { intentType, risk: 'low', estimatedCredits: 0, targetCount: 1, ...over }
}

const ALL_INTENTS = actionIntentTypeSchema.options
const INTERNAL = ALL_INTENTS.filter(type => intentSite(type) === 'bellum')
const OUTSIDE = ALL_INTENTS.filter(type => intentSite(type) !== 'bellum')

describe('#2449.3-.7 — « répondre seulement » ne touche à rien', () => {
  it('sait dire NON aux TREIZE intents du catalogue : aucun n’est une lecture', () => {
    expect(ALL_INTENTS.length).toBeGreaterThanOrEqual(13)
    for (const intentType of ALL_INTENTS) {
      const verdict = authorizeAtActionLevel({
        level: 'respond_only',
        gesture: gesture(intentType),
        backedByUserGesture: true,
      })
      expect(verdict).toEqual({ verdict: 'refused', because: 'level_writes_nothing' })
    }
  })

  it('le geste de l’utilisateur ne RACHÈTE pas le niveau : un clic n’ouvre pas une écriture', () => {
    // #2449.6 — le niveau n'est pas une préférence d'affichage qu'un clic lève.
    for (const backedByUserGesture of [true, false]) {
      expect(
        authorizeAtActionLevel({
          level: 'respond_only',
          gesture: gesture('pin_memory_fact'),
          backedByUserGesture,
        }).verdict,
      ).toBe('refused')
    }
  })

  it('#2449.4 un brouillon EXTERNE, #2449.5 une tâche, #2449.7 un envoi : les trois refusés', () => {
    for (const intentType of ['create_mail_draft', 'create_crm_task', 'send_email'] as const) {
      expect(
        authorizeAtActionLevel({ level: 'respond_only', gesture: gesture(intentType), backedByUserGesture: true })
          .verdict,
      ).toBe('refused')
    }
  })
})

describe('#2449.8-.15 — « préparer » crée à l’INTÉRIEUR de BellumAI, jamais dehors', () => {
  it('TÉMOIN POSITIF — chaque geste interne et gratuit passe', () => {
    expect(INTERNAL.length).toBeGreaterThanOrEqual(6)
    for (const intentType of INTERNAL) {
      expect(
        authorizeAtActionLevel({ level: 'prepare', gesture: gesture(intentType), backedByUserGesture: false }),
      ).toEqual({ verdict: 'allowed', preparedInBellum: true })
    }
  })

  it('sait dire NON : tout ce qui atterrit ailleurs est refusé, même sur un clic', () => {
    expect(OUTSIDE.length).toBeGreaterThanOrEqual(5)
    for (const intentType of OUTSIDE) {
      expect(
        authorizeAtActionLevel({ level: 'prepare', gesture: gesture(intentType), backedByUserGesture: true }),
      ).toEqual({ verdict: 'refused', because: 'level_prepares_only' })
    }
  })

  it('préparer ne DÉPENSE pas : un geste interne facturé est refusé', () => {
    expect(
      authorizeAtActionLevel({
        level: 'prepare',
        gesture: gesture('generate_message', { estimatedCredits: 1 }),
        backedByUserGesture: true,
      }),
    ).toEqual({ verdict: 'refused', because: 'level_prepares_free' })
  })

  it('préparer n’ENGAGE pas : une famille sensible est refusée', () => {
    expect(
      authorizeAtActionLevel({
        level: 'prepare',
        gesture: gesture('generate_message', { sensitiveFamily: 'client_commitment' }),
        backedByUserGesture: true,
      }),
    ).toEqual({ verdict: 'refused', because: 'level_prepares_unengaged' })
  })
})

describe('#2449.18-.24 — « exécuter » demande AVANT chaque geste qui sort ou qui coûte', () => {
  const noGo = (over: Partial<ActionGesture> & { intentType: ActionIntentType }) =>
    authorizeAtActionLevel({
      level: 'execute',
      gesture: gesture(over.intentType, over),
      backedByUserGesture: false,
    }) as Extract<ReturnType<typeof authorizeAtActionLevel>, { because: unknown }>

  it('#2449.18 — une mise à jour CRM demande, parce qu’elle SORT de BellumAI', () => {
    expect(noGo({ intentType: 'create_crm_note' })).toEqual({ verdict: 'needs_go', because: ['leaves_bellum'] })
    expect(noGo({ intentType: 'create_crm_task' }).verdict).toBe('needs_go')
  })

  it('#2449.20 — un enrichissement demande, même si personne n’a annoncé son coût', () => {
    expect(noGo({ intentType: 'enrich_contact' }).because).toContain('leaves_bellum')
  })

  it('#2449.23 — une dépense demande, même sur un geste qui ne sort pas', () => {
    expect(noGo({ intentType: 'generate_message', estimatedCredits: 3 }).because).toContain('spends')
  })

  it('#2449.22 — un export sensible demande', () => {
    expect(noGo({ intentType: 'generate_message', sensitiveFamily: 'data_export' }).because).toContain('sensitive')
  })

  it('#2449.24 — une action en LOT demande, dès la deuxième cible', () => {
    expect(noGo({ intentType: 'pin_memory_fact', targetCount: 2 }).because).toContain('in_bulk')
    expect(noGo({ intentType: 'pin_memory_fact', targetCount: 1 }).verdict).toBe('allowed')
  })

  it('#2400.8 — l’irréversible garde sa porte même quand le reste passerait', () => {
    expect(noGo({ intentType: 'send_email' }).because).toContain('irreversible')
  })

  it('le GO est le geste de l’utilisateur (doctrine : « auto-approuvé sur geste utilisateur »)', () => {
    expect(
      authorizeAtActionLevel({
        level: 'execute',
        gesture: gesture('create_crm_note'),
        backedByUserGesture: true,
      }),
    ).toEqual({ verdict: 'allowed' })
  })

  it('TÉMOIN POSITIF — un geste interne, gratuit et unitaire passe sans rien demander', () => {
    expect(
      authorizeAtActionLevel({
        level: 'execute',
        gesture: gesture('schedule_reminder'),
        backedByUserGesture: false,
      }),
    ).toEqual({ verdict: 'allowed' })
  })
})

describe('#2449.26-.32 — « automatiser » : six conditions, toutes nécessaires', () => {
  const ready = {
    capability_exists: true,
    workspace_policy_allows: true,
    role_allowed: true,
    simulation_validated: true,
    cap_defined: true,
    kill_switch_available: true,
  } as const

  it('TÉMOIN POSITIF — les six réunies, un geste interne part seul', () => {
    expect(
      authorizeAtActionLevel({
        level: 'automate',
        gesture: gesture('notify_user'),
        backedByUserGesture: false,
        readiness: { ...ready },
      }),
    ).toEqual({ verdict: 'allowed' })
  })

  it('sait dire NON : chacune des six, retirée SEULE, refuse et se NOMME', () => {
    for (const name of Object.keys(ready) as Array<keyof typeof ready>) {
      expect(
        authorizeAtActionLevel({
          level: 'automate',
          gesture: gesture('notify_user'),
          backedByUserGesture: false,
          readiness: { ...ready, [name]: false },
        }),
      ).toEqual({ verdict: 'refused', because: 'automation_not_ready', missing: [name] })
    }
  })

  it('sans mesure des six, on refuse — « on ne sait pas » n’est pas « c’est bon »', () => {
    const verdict = authorizeAtActionLevel({
      level: 'automate',
      gesture: gesture('notify_user'),
      backedByUserGesture: false,
    })
    expect(verdict.verdict).toBe('refused')
  })

  it('AUCUN niveau n’envoie à une personne, pas même « automatiser » avec les six', () => {
    // Doctrine : « le copilote n'envoie jamais d'e-mail : il prépare, le
    // commercial envoie ». Un réglage ne lève pas cette ligne.
    for (const intentType of ALL_INTENTS.filter(type => intentSite(type) === 'person')) {
      expect(
        authorizeAtActionLevel({
          level: 'automate',
          gesture: gesture(intentType),
          backedByUserGesture: true,
          readiness: { ...ready },
        }),
      ).toEqual({ verdict: 'refused', because: 'never_reaches_a_person' })
    }
  })

  it('#2400.8 — un geste irréversible ne part pas seul, même prêt', () => {
    expect(
      authorizeAtActionLevel({
        level: 'automate',
        gesture: gesture('create_crm_note', { risk: 'irreversible' }),
        backedByUserGesture: false,
        readiness: { ...ready },
      }).verdict,
    ).toBe('needs_go')
  })
})

describe('#2400.5 / #2449.29 — la simulation tourne sur les gestes RÉELS et n’écrit rien', () => {
  it('rend un verdict par geste, sans en exécuter aucun', () => {
    const report = simulateAtActionLevel({
      level: 'execute',
      gestures: [gesture('schedule_reminder'), gesture('create_crm_note'), gesture('send_email')],
      backedByUserGesture: false,
    })
    expect(report.gestures.map(g => g.verdict)).toEqual(['allowed', 'needs_go', 'needs_go'])
    expect(report.blocked).toBe(2)
  })

  it('une simulation ne VALIDE que si tout passerait seul', () => {
    const clean = simulateAtActionLevel({
      level: 'execute',
      gestures: [gesture('schedule_reminder'), gesture('update_setting')],
      backedByUserGesture: false,
    })
    expect(simulationValidates(clean)).toBe(true)

    const dirty = simulateAtActionLevel({
      level: 'execute',
      gestures: [gesture('schedule_reminder'), gesture('send_email')],
      backedByUserGesture: false,
    })
    expect(simulationValidates(dirty)).toBe(false)
  })

  it('une simulation VIDE ne valide rien — zéro geste n’est pas une preuve', () => {
    expect(
      simulationValidates(simulateAtActionLevel({ level: 'execute', gestures: [], backedByUserGesture: false })),
    ).toBe(false)
  })
})

describe('#2400.3 — la porte décide sur les CINQ MODES, pas seulement les quatre niveaux', () => {
  it('un mode SEUL se résout sur son niveau (GRADUATED_MODE_LEVEL)', () => {
    expect(resolveActionLevel({ mode: 'observe' })).toBe('respond_only')
    expect(resolveActionLevel({ mode: 'suggest' })).toBe('respond_only')
    expect(resolveActionLevel({ mode: 'prepare' })).toBe('prepare')
    expect(resolveActionLevel({ mode: 'execute-after-approval' })).toBe('execute')
    expect(resolveActionLevel({ mode: 'auto-execute' })).toBe('automate')
  })

  it('ni niveau ni mode déclarés : `undefined`, byte-identique à avant', () => {
    expect(resolveActionLevel({})).toBeUndefined()
  })

  it('un niveau SEUL, sans mode : inchangé — aucun appelant existant ne change de sens', () => {
    expect(resolveActionLevel({ level: 'automate' })).toBe('automate')
  })

  it('les DEUX déclarés : le PLUS PRUDENT gagne — jamais un élargissement', () => {
    // Le niveau dit « automatiser », le mode dit « observer seulement » : le
    // mode, plus prudent, gagne — composer ne doit jamais ÉLARGIR ce qu'un
    // niveau déjà déclaré autorisait.
    expect(resolveActionLevel({ level: 'automate', mode: 'observe' })).toBe('respond_only')
    // L'inverse : le niveau, plus prudent que le mode, gagne.
    expect(resolveActionLevel({ level: 'respond_only', mode: 'auto-execute' })).toBe('respond_only')
    // Les deux au même niveau : ce niveau, sans ambiguïté.
    expect(resolveActionLevel({ level: 'prepare', mode: 'prepare' })).toBe('prepare')
  })
})
