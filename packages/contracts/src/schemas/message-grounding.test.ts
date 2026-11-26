import { describe, expect, it } from 'vitest'
import { messageGroundingSchema } from './message-grounding.js'

// #4524.2 — « Sur quoi Laura s'appuie » : le choix du commercial, tel qu'il voyage du navigateur au moteur.
describe('#4524.2 — messageGroundingSchema', () => {
  it('accepte des faits cochés, chacun avec son genre, son libellé et sa preuve éventuelle', () => {
    const parsed = messageGroundingSchema.safeParse({
      mode: 'facts',
      facts: [
        { kind: 'account_signal', label: 'Cession de la filiale', proof: 'Les Echos · 1 oct.' },
        { kind: 'contact_need', label: 'Fiabiliser ses pipelines data' },
      ],
    })
    expect(parsed.success).toBe(true)
  })

  it('« Angle libre » n’impose aucun fait', () => {
    expect(messageGroundingSchema.safeParse({ mode: 'free_angle' }).success).toBe(true)
    expect(
      messageGroundingSchema.safeParse({ mode: 'free_angle', facts: [{ kind: 'account_signal', label: 'x' }] }).success,
    ).toBe(false)
  })

  it('refuse « faits cochés » sans aucun fait, un genre inconnu, un libellé blanc', () => {
    expect(messageGroundingSchema.safeParse({ mode: 'facts', facts: [] }).success).toBe(false)
    expect(messageGroundingSchema.safeParse({ mode: 'facts', facts: [{ kind: 'rumour', label: 'x' }] }).success).toBe(
      false,
    )
    expect(
      messageGroundingSchema.safeParse({ mode: 'facts', facts: [{ kind: 'account_signal', label: '  ' }] }).success,
    ).toBe(false)
  })

  it('borne le nombre de faits (le texte finit dans un prompt)', () => {
    const facts = Array.from({ length: 13 }, (_, i) => ({ kind: 'account_signal', label: `fait ${i}` }))
    expect(messageGroundingSchema.safeParse({ mode: 'facts', facts }).success).toBe(false)
  })

  it('#4977 — un fait peut porter le sujet « offre d’emploi » ; tout autre sujet est refusé', () => {
    const fact = { kind: 'account_signal', label: 'Expert OpenShift à Toulouse' }
    expect(messageGroundingSchema.safeParse({ mode: 'facts', facts: [{ ...fact, topic: 'job_offer' }] }).success).toBe(
      true,
    )
    expect(messageGroundingSchema.safeParse({ mode: 'facts', facts: [{ ...fact, topic: 'rumour' }] }).success).toBe(
      false,
    )
  })
})
