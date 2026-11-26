import { patchPreferencesSchema } from './memory.dto'

/**
 * #1928.2/.3/.5/.6 — la porte de `PATCH /memory/preferences`.
 *
 * Le sac reste LIBRE (d'autres clés y vivent déjà), mais les quatre réglages de
 * réponse refusent une valeur inconnue : stockée, elle serait ignorée en
 * silence par le prompt, et l'écran montrerait « Par défaut » sur un réglage que
 * la personne croit avoir posé.
 */
describe('PATCH /memory/preferences — la porte du sac', () => {
  it('laisse passer une clé libre telle quelle', () => {
    const body = { preferences: { tone: 'direct', sectors: ['Banque'] } }
    expect(patchPreferencesSchema.parse(body)).toEqual(body)
  })

  it('accepte un réglage de réponse connu', () => {
    expect(patchPreferencesSchema.safeParse({ preferences: { replyLength: 'short' } }).success).toBe(true)
  })

  it('refuse un réglage de réponse à valeur inconnue — jamais stocké pour rien', () => {
    expect(patchPreferencesSchema.safeParse({ preferences: { replyLength: 'banana' } }).success).toBe(false)
    expect(patchPreferencesSchema.safeParse({ preferences: { replyTone: null } }).success).toBe(false)
  })
})
