import { describe, expect, it } from 'vitest'
import type { WorkflowDefinition } from './action-os.js'
import { buildRunIntents, type WorkflowTarget } from './workflow-intents.js'

const NOW = new Date('2026-08-25T09:00:00.000Z')
const AT_J3 = '2026-08-28T09:00:00.000Z'
const ACCOUNT = 'a0000000-0000-4000-8000-000000000001'
const CONTACT = 'c0000000-0000-4000-8000-000000000002'

function definition(steps: WorkflowDefinition['steps']): WorkflowDefinition {
  return {
    key: 'test_flow',
    version: 1,
    name: { fr: 'Flux de test', en: 'Test flow' },
    description: { fr: 'x', en: 'x' },
    trigger: 'signal_detected',
    minimumLevel: 'n1_prepare',
    enabled: true,
    steps,
  }
}

function step(over: Partial<WorkflowDefinition['steps'][number]>): WorkflowDefinition['steps'][number] {
  return {
    key: 'k',
    intentType: 'notify_user',
    intent: 'faire quelque chose',
    capability: 'notifications',
    permission: 'actions:write',
    estimatedCredits: 0,
    risk: 'low',
    reversible: true,
    expectedResult: 'x',
    dependsOn: [],
    retry: { maxAttempts: 1, backoffSeconds: 0, retryOnUnknown: false },
    ...over,
  } as WorkflowDefinition['steps'][number]
}

const FULL: WorkflowTarget = {
  accountId: ACCOUNT,
  accountName: 'ACME Industries',
  contactId: CONTACT,
  crmProvider: 'hubspot',
  now: NOW,
}

/**
 * La règle unique du module : **on ne devine pas une cible**. Un pas sans cible
 * ne reçoit AUCUNE intention et reste honnêtement bloqué.
 *
 * Le premier test est celui sans lequel les autres ne prouvent rien : avec un
 * workflow vide, `buildRunIntents` rendrait `{}` et chaque « le pas est absent »
 * passerait au vert par absence de sujet.
 */
describe('buildRunIntents — la cible complète', () => {
  it('traduit chaque nature de pas en intention', () => {
    const flow = definition([
      step({ key: 'enrich', intentType: 'enrich_contact' }),
      step({ key: 'mail', intentType: 'send_email' }),
      step({ key: 'crm', intentType: 'create_crm_task' }),
      step({ key: 'note', intentType: 'create_crm_note' }),
      step({ key: 'rappel', intentType: 'schedule_reminder' }),
      step({ key: 'agenda', intentType: 'create_calendar_event' }),
      step({ key: 'notif', intentType: 'notify_user' }),
    ])
    const intents = buildRunIntents(flow, FULL)

    expect(Object.keys(intents).sort()).toEqual(['agenda', 'crm', 'enrich', 'mail', 'note', 'notif', 'rappel'])
    expect(intents['enrich']).toEqual({ type: 'enrich_contact', contactId: CONTACT })
    expect(intents['rappel']).toMatchObject({ type: 'schedule_reminder', contactId: CONTACT, at: AT_J3 })
  })

  it("n'invente JAMAIS le corps d'un e-mail — seulement la cible", () => {
    // Le routeur envoie le brouillon RELU (`email_message`). Fabriquer un corps
    // ici ferait partir un texte que personne n'a lu.
    const intents = buildRunIntents(definition([step({ key: 'mail', intentType: 'send_email' })]), FULL)
    expect(intents['mail']).toEqual({ type: 'send_email', contactId: CONTACT })
  })

  it('un rappel tient sur le CONTACT quand il y en a un, sur le compte sinon', () => {
    const flow = definition([step({ key: 'r', intentType: 'schedule_reminder' })])
    expect(buildRunIntents(flow, FULL)['r']).toMatchObject({ contactId: CONTACT })
    const sansContact = buildRunIntents(flow, { ...FULL, contactId: null })['r']
    expect(sansContact).toMatchObject({ accountId: ACCOUNT })
    // Jamais les deux : le contrat le refuse.
    expect(sansContact && 'contactId' in sansContact).toBe(false)
  })
})

describe('buildRunIntents — ce qu’une cible manquante laisse BLOQUÉ', () => {
  const flow = definition([
    step({ key: 'enrich', intentType: 'enrich_contact' }),
    step({ key: 'mail', intentType: 'send_email' }),
    step({ key: 'crm', intentType: 'create_crm_task' }),
    step({ key: 'notif', intentType: 'notify_user' }),
  ])

  it('sans contact, rien de ce qui écrit à quelqu’un ne part', () => {
    const intents = buildRunIntents(flow, { ...FULL, contactId: null })
    // La notification, elle, ne vise personne à l'extérieur : elle reste possible.
    expect(intents['notif']).toBeDefined()
  })

  it('sans CRM branché, aucune intention CRM — un empêchement, pas un échec', () => {
    // Fabriquer une intention vers un CRM absent produirait un échec au moment
    // du dispatch ; l'absence d'intention produit un pas bloqué, qui appelle un
    // geste précis : brancher l'outil.
    const intents = buildRunIntents(flow, { ...FULL, crmProvider: null })
    expect(intents['crm']).toBeUndefined()
    expect(intents['enrich']).toBeDefined()
  })

  it('un CRM inconnu du routeur est traité comme absent', () => {
    expect(buildRunIntents(flow, { ...FULL, crmProvider: 'un-crm-maison' })['crm']).toBeUndefined()
  })

  it("sans nom de compte, aucun évènement d'agenda — on n'invente pas un titre", () => {
    const agenda = definition([step({ key: 'a', intentType: 'create_calendar_event' })])
    expect(buildRunIntents(agenda, { ...FULL, accountName: null })['a']).toBeUndefined()
    expect(buildRunIntents(agenda, { ...FULL, accountName: '   ' })['a']).toBeUndefined()
  })

  it('sans AUCUNE cible, seule la notification subsiste', () => {
    const intents = buildRunIntents(flow, { accountId: null, contactId: null, crmProvider: null, now: NOW })
    expect(Object.keys(intents)).toEqual(['notif'])
  })

  it('`snooze` ne reçoit jamais d’intention — il n’y a rien à reporter au lancement', () => {
    const flow2 = definition([step({ key: 's', intentType: 'snooze' })])
    expect(buildRunIntents(flow2, FULL)).toEqual({})
  })
})
