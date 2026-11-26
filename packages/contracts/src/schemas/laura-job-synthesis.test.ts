import { describe, expect, it } from 'vitest'

import { lauraJobBriefSchema, lauraJobSynthesisIdentities, lauraJobSynthesisOf } from './laura-job.js'

/**
 * #3860.4 — DÉCISION LOUIS 09/10 : « l'étape de synthèse » = la DERNIÈRE étape
 * d'un job de Laura, un résumé ÉCRIT de ce que le job a produit (comptes
 * analysés, contacts, messages préparés, avec leurs liens) et de ce qui a échoué
 * ou reste `unknown` — sans recalcul, lu depuis `produced` des étapes. Aucun
 * débit de crédit.
 */

const A1 = '11111111-1111-4111-8111-111111111111'
const A2 = '22222222-2222-4222-8222-222222222222'
const C1 = '33333333-3333-4333-8333-333333333333'

function brief() {
  return lauraJobBriefSchema.parse({
    originalRequest: 'Analyse ces filiales et prépare un message pour chaque décideur',
    intent: 'Analyser puis écrire',
    expectedOutcome: 'Un brouillon par décideur',
    scope: { description: 'Les filiales', accountIds: [A1, A2] },
    steps: [
      {
        key: 'analyse',
        label: 'Analyser',
        capability: 'account_analysis',
        status: 'done',
        produced: { accountIds: [A1], contactIds: [C1] },
      },
      { key: 'messages', label: 'Écrire', capability: 'message_generation', status: 'done', dependsOn: ['analyse'] },
      { key: 'crm', label: 'Remonter au CRM', capability: 'crm_write', status: 'unknown', dependsOn: ['messages'] },
      { key: 'memory', label: 'Mémoire marché', capability: 'search_market_memory', status: 'failed' },
    ],
    errors: [{ stepKey: 'memory', message: 'La mémoire marché n’a pas répondu.', at: '2026-10-09T10:00:00.000Z' }],
    createdObjects: [
      { kind: 'outreach_message', id: 'm-1', label: 'Brouillon — DSI' },
      { kind: 'crm_note', id: 'n-1', label: 'Note CRM' },
    ],
  })
}

const NAMES = {
  accounts: new Map([[A1, 'Alstom']]),
  contacts: new Map([[C1, 'Directrice des achats']]),
}

describe('#3860.4 — la synthèse, dernière étape du job', () => {
  it('ne se rend qu’une fois le job ARRIVÉ au bout — jamais pendant qu’il tourne', () => {
    expect(lauraJobSynthesisOf('running', brief(), NAMES)).toBeNull()
    expect(lauraJobSynthesisOf('to_confirm', brief(), NAMES)).toBeNull()
    expect(lauraJobSynthesisIdentities('awaiting_approval', brief())).toBeNull()
    expect(lauraJobSynthesisOf('partial', brief(), NAMES)).not.toBeNull()
  })

  it('lit `produced` des étapes et les messages préparés, sans recalcul', () => {
    const synthesis = lauraJobSynthesisOf('partial', brief(), NAMES)
    expect(synthesis?.accounts).toEqual([{ id: A1, name: 'Alstom' }])
    expect(synthesis?.contacts).toEqual([{ id: C1, name: 'Directrice des achats' }])
    // Les messages préparés seulement : une note CRM n'est pas un message.
    expect(synthesis?.messages).toEqual([{ id: 'm-1', label: 'Brouillon — DSI' }])
    // A2 était dans le périmètre mais n'a RIEN produit : jamais compté analysé.
    expect(lauraJobSynthesisIdentities('partial', brief())?.accountIds).toEqual([A1])
  })

  it('nomme ce qui a échoué et ce qui reste `unknown`', () => {
    const synthesis = lauraJobSynthesisOf('partial', brief(), NAMES)
    expect(synthesis?.failed).toEqual([{ key: 'memory', label: 'Mémoire marché' }])
    expect(synthesis?.unknown).toEqual([{ key: 'crm', label: 'Remonter au CRM' }])
    expect(synthesis?.errors).toEqual(['La mémoire marché n’a pas répondu.'])
  })

  it('une identité dont le nom n’est plus lisible (supprimée) ne fait AUCUNE ligne', () => {
    const synthesis = lauraJobSynthesisOf('done', brief(), { accounts: new Map(), contacts: new Map() })
    expect(synthesis?.accounts).toEqual([])
    expect(synthesis?.contacts).toEqual([])
  })
})
