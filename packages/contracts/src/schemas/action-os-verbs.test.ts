import { describe, expect, it } from 'vitest'
import { ACTION_OS_VERB_AUDIT, ACTION_OS_VERBS, actionOsVerbSchema } from './action-os-verbs.js'

describe('#2317.10 — les six verbes de l’Action OS, distincts de ceux de Laura', () => {
  it('nomme les six verbes, dans l’ordre de l’épopée', () => {
    expect(ACTION_OS_VERBS).toEqual(['create', 'assign', 'schedule', 'write', 'send_after_validation', 'keep_proof'])
  })

  it.each(ACTION_OS_VERBS)('%s est un verbe valide', verb => {
    expect(actionOsVerbSchema.parse(verb)).toBe(verb)
  })

  it('REFUSE un verbe qui n’est pas l’un des six', () => {
    expect(actionOsVerbSchema.safeParse('envoie').success).toBe(false)
  })

  it('chaque verbe porte une preuve `fichier:ligne` et son libellé français', () => {
    for (const verb of ACTION_OS_VERBS) {
      const entry = ACTION_OS_VERB_AUDIT[verb]
      expect(entry.label.length).toBeGreaterThan(0)
      expect(entry.evidence).toMatch(/^[\w./-]+\.ts:\d+$/)
    }
  })
})
