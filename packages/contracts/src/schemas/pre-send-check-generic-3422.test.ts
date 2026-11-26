import { describe, expect, it } from 'vitest'
import { preSendCheck, preSendFailures } from './pre-send-check.js'

/**
 * #3422.20 (jeu de tests métier de référence — « message trop générique »).
 * Le message est la MAUVAISE RÉPONSE exacte citée par #3430 : il ne doit jamais
 * pouvoir partir sans que la liste « avant d'envoyer » le dise. Appelant :
 * `PreSendChecklist.tsx` (carte d'un message de séquence).
 */
const GENERIC = 'Bonjour, je me permets de vous contacter afin de vous présenter notre expertise Java.'
const PERSONAL =
  'Bonjour Claire, votre équipe applications recrute deux développeurs Java depuis mars. Avez-vous déjà un renfort prévu ?'

describe('#3422.20 — un message trop générique est signalé avant l’envoi', () => {
  it('le message générique échoue à au moins un contrôle, nommé', () => {
    const failures = preSendFailures(preSendCheck({ body: GENERIC, step: 1 }))
    expect(failures.length).toBeGreaterThan(0)
    // Il n'a aucune question : rien à quoi répondre.
    expect(failures.map(f => f.id)).toContain('easy_question')
  })

  it('le message précis, daté et interrogatif ne remonte PAS sur « question »', () => {
    const failures = preSendFailures(preSendCheck({ body: PERSONAL, step: 1 }))
    expect(failures.map(f => f.id)).not.toContain('easy_question')
  })

  it('la liste a la même longueur quel que soit le message — un contrôle ne masque jamais ses lignes', () => {
    expect(preSendCheck({ body: GENERIC, step: 1 })).toHaveLength(preSendCheck({ body: PERSONAL, step: 1 }).length)
  })
})
