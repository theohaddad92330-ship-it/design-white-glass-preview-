import { describe, expect, it } from 'vitest'
import { conversationSummarySections } from './conversation-summary.js'
import { conversationThreadStateSchema } from './conversation-thread-state.js'

/**
 * #1955.24-.28 — le résumé d'un fil se lit PAR CATÉGORIE, tirées de l'état
 * structuré que Laura écrit à chaque tour (`thread_state`, #1927.10 / #2268) :
 * rien n'est rédigé ni deviné ici, chaque ligne vient d'un champ réel.
 */
const state = conversationThreadStateSchema.parse({
  version: 1,
  objects: [
    { kind: 'account', id: 'a-1', label: 'SNCF' },
    { kind: 'contact', id: 'c-1', label: 'Claire Martin' },
  ],
  focus: [],
  last_list: null,
  searches: [],
  proposals: [
    { action: 'Préparer la relance', target_kind: 'contact', target_id: 'c-1', target_label: 'Claire Martin' },
    { action: 'Planifier un point', target_kind: null, target_id: null, target_label: null },
  ],
  questions: [{ question: 'Quel périmètre géographique ?', options: ['IDF', 'France'] }],
  ruled_out: [{ option: 'Thales', reason: 'déjà client' }],
  excluded: [{ criterion: 'grands groupes', reason: null }],
  decisions: ['Cibler la DSI en premier'],
})

describe('conversationSummarySections — #1955.24-.28', () => {
  it('range chaque champ de l’état sous SA catégorie', () => {
    expect(conversationSummarySections(state)).toEqual({
      decisions: ['Cibler la DSI en premier'],
      objects: [
        { kind: 'account', label: 'SNCF' },
        { kind: 'contact', label: 'Claire Martin' },
      ],
      pendingActions: [
        { action: 'Préparer la relance', target: 'Claire Martin' },
        { action: 'Planifier un point', target: null },
      ],
      corrections: [
        { kind: 'excluded', text: 'grands groupes', reason: null },
        { kind: 'ruled_out', text: 'Thales', reason: 'déjà client' },
      ],
      questions: ['Quel périmètre géographique ?'],
    })
  })

  it('NON — sans état, aucune catégorie ne se remplit (jamais une ligne inventée)', () => {
    expect(conversationSummarySections(null)).toEqual({
      decisions: [],
      objects: [],
      pendingActions: [],
      corrections: [],
      questions: [],
    })
  })
})
