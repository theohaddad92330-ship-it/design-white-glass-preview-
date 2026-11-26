import { describe, expect, it } from 'vitest'
import {
  AUTOMATION_CARD_ATTRIBUTE_COUNT,
  ROUTINE_MAX_ITEMS_PER_RUN_BOUNDS,
  routineDefinitionSchema,
  routineRiskOf,
  applyRoutineContent,
  ROUTINE_CONTENT_MAX_LENGTH,
  routineContentViewSchema,
  updateRoutineContentRequestSchema,
  routineRunViewSchema,
  routineSubscriptionSchema,
  updateRoutineRequestSchema,
} from './routines.js'

/**
 * #2916 (#2399.3) / #2398.6 (épopée #2843) — LA FICHE D'AUTOMATISATION À
 * DIX-HUIT ATTRIBUTS.
 *
 * Garde de COMPTE, même patron que `test_copilote_scenario_corpus.py §12` :
 * elle lit les clés RÉELLES du schéma, jamais une liste recopiée qui
 * divergerait dès le premier attribut ajouté sans qu'elle bouge.
 */
describe('routineDefinitionSchema — la fiche d’automatisation compte exactement 25 attributs', () => {
  it('AUTOMATION_CARD_ATTRIBUTE_COUNT égale le nombre RÉEL de clés du schéma', () => {
    expect(Object.keys(routineDefinitionSchema.shape)).toHaveLength(AUTOMATION_CARD_ATTRIBUTE_COUNT)
  })

  it('example et version sont bien les deux attributs neufs (#2916)', () => {
    expect(Object.keys(routineDefinitionSchema.shape)).toEqual(expect.arrayContaining(['example', 'version']))
  })

  it('stopCondition est le nouvel attribut (#2398.6/#2398.14, épopée #2843)', () => {
    expect(Object.keys(routineDefinitionSchema.shape)).toEqual(expect.arrayContaining(['stopCondition']))
  })

  // #2843.7 — les champs de #2398.6 qui manquaient : rôle, étapes, actions préparées,
  // validations, budget (+ portée et type d'espace, #2843.29). Owner et statut vivent
  // sur l'abonnement (`routineSubscriptionSchema`), pas sur la définition.
  it('#2843.7 — rôles, étapes, actions préparées, validations, budget, portée et profils d’espace', () => {
    expect(Object.keys(routineDefinitionSchema.shape)).toEqual(
      expect.arrayContaining([
        'roles',
        'workspaceProfiles',
        'scope',
        'steps',
        'preparedActions',
        'validations',
        'budget',
      ]),
    )
  })
})

/**
 * #2843.7 — un attribut de la fiche n'est jamais VIDE : une liste vide de rôles,
 * d'étapes, d'actions ou de validations dirait « rien » là où le catalogue doit
 * nommer. Le schéma dit NON.
 */
describe('#2843.7 — les listes de la fiche ne sont jamais vides', () => {
  const full = {
    key: 'daily_briefing' as const,
    name: { fr: 'n', en: 'n' },
    description: { fr: 'd', en: 'd' },
    outcome: { fr: 'o', en: 'o' },
    cadence: 'daily' as const,
    defaultHour: 8,
    defaultWeekday: null,
    requires: [],
    defaultChannel: 'in_app' as const,
    automationLevel: 'n1_prepare' as const,
    condition: { fr: 'c', en: 'c' },
    reads: { fr: 'r', en: 'r' },
    fallback: { fr: 'f', en: 'f' },
    acceptance: { fr: 'a', en: 'a' },
    defaultEnabled: true,
    example: null,
    stopCondition: null,
    version: 1,
    roles: ['general'],
    workspaceProfiles: ['staffing'],
    scope: 'personal',
    steps: ['read', 'notify'],
    preparedActions: ['notification'],
    validations: ['review_before_acting'],
    budget: 'no_model_call',
  }

  it('accepte une fiche complète', () => {
    expect(routineDefinitionSchema.safeParse(full).success).toBe(true)
  })

  it.each(['roles', 'workspaceProfiles', 'steps', 'preparedActions', 'validations'] as const)(
    'refuse %s vide',
    field => {
      expect(routineDefinitionSchema.safeParse({ ...full, [field]: [] }).success).toBe(false)
    },
  )

  it.each(['roles', 'workspaceProfiles', 'scope', 'steps', 'preparedActions', 'validations', 'budget'] as const)(
    'refuse %s absent',
    field => {
      const { [field]: _omit, ...rest } = full
      expect(routineDefinitionSchema.safeParse(rest).success).toBe(false)
    },
  )
})

/**
 * #2843.13 — l'abonnement porte l'AUTONOMIE et l'OWNER réglés par l'utilisateur ;
 * `null` = le défaut du catalogue (jamais un niveau deviné).
 */
describe('#2843.13 — autonomie et owner sur l’abonnement', () => {
  it('le patch accepte une autonomie et un owner, et `null` pour revenir au défaut', () => {
    expect(updateRoutineRequestSchema.safeParse({ autonomy: 'n0_inform' }).success).toBe(true)
    expect(updateRoutineRequestSchema.safeParse({ autonomy: null, ownerUserId: null }).success).toBe(true)
    expect(updateRoutineRequestSchema.safeParse({ ownerUserId: '7b3c1f0e-1d2a-4c5b-9e8f-0a1b2c3d4e5f' }).success).toBe(
      true,
    )
  })

  it('refuse une autonomie inconnue et un owner qui n’est pas un uuid', () => {
    expect(updateRoutineRequestSchema.safeParse({ autonomy: 'n9' }).success).toBe(false)
    expect(updateRoutineRequestSchema.safeParse({ ownerUserId: 'quelqu’un' }).success).toBe(false)
  })

  it('l’abonnement expose autonomie et owner', () => {
    expect(Object.keys(routineSubscriptionSchema.shape)).toEqual(expect.arrayContaining(['autonomy', 'ownerUserId']))
  })
})

/**
 * #2398.6/#2398.14 (épopée #2843) — LA CONDITION D'ARRÊT est NULLABLE, même
 * doctrine que `example` : une routine dont l'arrêt n'a pas été vérifié dans
 * le code n'en affiche aucun plutôt qu'un comportement deviné (GA-18/GA-19).
 */
describe('routineDefinitionSchema.stopCondition — nullable, jamais devinée', () => {
  const base = {
    key: 'daily_briefing' as const,
    name: { fr: 'n', en: 'n' },
    description: { fr: 'd', en: 'd' },
    outcome: { fr: 'o', en: 'o' },
    cadence: 'daily' as const,
    defaultHour: 8,
    defaultWeekday: null,
    requires: [],
    defaultChannel: 'in_app' as const,
    automationLevel: 'n1_prepare' as const,
    condition: { fr: 'c', en: 'c' },
    reads: { fr: 'r', en: 'r' },
    fallback: { fr: 'f', en: 'f' },
    acceptance: { fr: 'a', en: 'a' },
    defaultEnabled: true,
    example: null,
    version: 1,
    roles: ['general' as const],
    workspaceProfiles: ['staffing' as const, 'forfait_conseil' as const],
    scope: 'personal' as const,
    steps: ['read' as const, 'notify' as const],
    preparedActions: ['notification' as const],
    validations: ['review_before_acting' as const],
    budget: 'no_model_call' as const,
  }

  it('accepte `null` — non renseignée', () => {
    const parsed = routineDefinitionSchema.parse({ ...base, stopCondition: null })
    expect(parsed.stopCondition).toBeNull()
  })

  it('accepte une phrase FR+EN', () => {
    const parsed = routineDefinitionSchema.parse({
      ...base,
      stopCondition: { fr: 'Elle s’arrête quand X.', en: 'It stops when X.' },
    })
    expect(parsed.stopCondition).toEqual({ fr: 'Elle s’arrête quand X.', en: 'It stops when X.' })
  })

  it('refuse un champ absent — jamais un attribut de la fiche omis en silence', () => {
    const { stopCondition: _omit, ...withoutStopCondition } = { ...base, stopCondition: null }
    expect(() => routineDefinitionSchema.parse(withoutStopCondition)).toThrow()
  })
})

/**
 * #2205.54 (épopée #2843) — `proofRef` porte la PREUVE vérifiable d'une
 * exécution, jamais devinée : nullable, jamais un champ optionnel omis (une
 * ligne d'historique sans preuve doit le DIRE, pas se taire dessus).
 */
describe('routineRunViewSchema — la preuve d’exécution (#2205.54)', () => {
  const base = {
    id: '11111111-1111-4111-8111-111111111111',
    createdAt: '2026-09-29T08:00:00.000Z',
    notified: true,
    outcome: 'ok',
    failed: false,
  }

  it('accepte un lien vérifiable', () => {
    const parsed = routineRunViewSchema.parse({ ...base, proofRef: 'https://mail.example/d1' })
    expect(parsed.proofRef).toBe('https://mail.example/d1')
  })

  it('accepte `null` — jamais un champ omis en silence', () => {
    const parsed = routineRunViewSchema.parse({ ...base, proofRef: null })
    expect(parsed.proofRef).toBeNull()
  })

  it('refuse un booléen ou un nombre : une preuve est une référence, jamais un indicateur', () => {
    expect(() => routineRunViewSchema.parse({ ...base, proofRef: true })).toThrow()
  })
})

/**
 * #2843 (#2205.45) — LE PLAFOND DE DESTINATAIRES, distinct de la cible
 * calculée. Aujourd'hui figé à UN brouillon par passage pour
 * `no_reply_follow_up` (seule routine où le calcul de la cible est déjà
 * séparé de l'écriture) — ce champ le rend RÉGLABLE, borné, jamais un texte
 * libre qu'un exécuteur devrait valider lui-même.
 */
describe('routineSubscriptionSchema / updateRoutineRequestSchema — le plafond de destinataires (#2205.45)', () => {
  const baseSubscription = {
    key: 'no_reply_follow_up',
    status: 'active',
    enabled: true,
    hour: 8,
    weekday: null,
    channel: 'in_app',
    timeZone: 'Europe/Paris',
    autonomy: null,
    ownerUserId: null,
  }

  it('accepte `null` — aucun plafond réglé, le défaut du lot précédent (UN brouillon) s’applique', () => {
    const parsed = routineSubscriptionSchema.parse({ ...baseSubscription, maxItemsPerRun: null })
    expect(parsed.maxItemsPerRun).toBeNull()
  })

  it.each([ROUTINE_MAX_ITEMS_PER_RUN_BOUNDS.min, ROUTINE_MAX_ITEMS_PER_RUN_BOUNDS.max])(
    'accepte %i — dans les bornes',
    value => {
      const parsed = routineSubscriptionSchema.parse({ ...baseSubscription, maxItemsPerRun: value })
      expect(parsed.maxItemsPerRun).toBe(value)
    },
  )

  it('refuse 0 — sous la borne basse', () => {
    expect(() =>
      routineSubscriptionSchema.parse({
        ...baseSubscription,
        maxItemsPerRun: ROUTINE_MAX_ITEMS_PER_RUN_BOUNDS.min - 1,
      }),
    ).toThrow()
  })

  it('refuse au-delà de la borne haute — jamais un « vider toute la file en un tour »', () => {
    expect(() =>
      routineSubscriptionSchema.parse({
        ...baseSubscription,
        maxItemsPerRun: ROUTINE_MAX_ITEMS_PER_RUN_BOUNDS.max + 1,
      }),
    ).toThrow()
  })

  it('updateRoutineRequestSchema : le champ est optionnel, absent par défaut', () => {
    const parsed = updateRoutineRequestSchema.parse({ hour: 9 })
    expect(parsed.maxItemsPerRun).toBeUndefined()
  })
})

/**
 * #2843.24 (#2399.3) — le RISQUE 0-4 d'une automatisation est DÉRIVÉ de ce qu'elle
 * laisse derrière elle : une seule source (les actions préparées), jamais une
 * saisie de plus qui divergerait (GA-26). Le plus risqué l'emporte.
 */
describe('#2843.24 — routineRiskOf', () => {
  it('lire et informer = 0 ; proposer une écriture dans l’outil du client = 4', () => {
    expect(routineRiskOf({ preparedActions: ['notification'] })).toBe(0)
    expect(routineRiskOf({ preparedActions: ['notification', 'digest'] })).toBe(1)
    expect(routineRiskOf({ preparedActions: ['notification', 'task'] })).toBe(2)
    expect(routineRiskOf({ preparedActions: ['notification', 'message_draft'] })).toBe(3)
    expect(routineRiskOf({ preparedActions: ['crm_update_proposal', 'notification'] })).toBe(4)
  })
})

/**
 * #2843.30 — le CONTENU d'une routine (le texte de sa notification) se règle par
 * espace : un gabarit où `{{resultat}}` reçoit ce que la routine a calculé.
 * `null` = le texte par défaut ; jamais un gabarit vide ni démesuré.
 */
describe('#2843.30 — gabarit du contenu d’une routine', () => {
  it('accepte un gabarit, le renvoie, et applique le résultat au jeton', () => {
    expect(updateRoutineContentRequestSchema.safeParse({ template: 'Bonjour — {{resultat}}' }).success).toBe(true)
    expect(applyRoutineContent('Bonjour — {{resultat}}', '2 relances')).toBe('Bonjour — 2 relances')
    expect(applyRoutineContent(null, '2 relances')).toBe('2 relances')
  })

  it('refuse un gabarit vide ou trop long', () => {
    expect(updateRoutineContentRequestSchema.safeParse({ template: '   ' }).success).toBe(false)
    expect(
      updateRoutineContentRequestSchema.safeParse({ template: 'x'.repeat(ROUTINE_CONTENT_MAX_LENGTH + 1) }).success,
    ).toBe(false)
  })

  it('la vue dit si le contenu est personnalisé, sans jamais inventer le défaut', () => {
    expect(routineContentViewSchema.parse({ key: 'daily_briefing', template: null }).template).toBeNull()
  })
})
