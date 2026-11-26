import { describe, expect, it } from 'vitest'
import { demoTurn } from '@/features/chat/api/demo-turn'

/** #4294.9 — « qu'a-t-on déjà fait chez X ? » posé à Laura en salle : synthèse puis besoins datés. */
describe('#4294.9 — l’historique d’un compte chez Laura, en salle de démonstration', () => {
  const reply = demoTurn('Qu’a-t-on déjà fait chez Cévennes Défense Systèmes ?', 'REPLI').reply

  it('ouvre sur la synthèse, puis une ligne datée par besoin, et pèse angle et interlocuteur', () => {
    expect(reply.indexOf('Synthèse')).toBeGreaterThanOrEqual(0)
    expect(reply.indexOf('Synthèse')).toBeLessThan(reply.indexOf('Besoins passés'))
    expect(reply).toContain('1 gagné, 1 terminé, 1 perdu')
    expect(reply).toContain('à revalider')
    expect(reply).toMatch(/Angle :.*Interlocuteur :/s)
  })

  it('sait dire NON : aucune probabilité, aucune source nommée, un autre compte retombe au repli', () => {
    expect(reply).not.toMatch(/%|probab|dataforge|orion|base commune/i)
    expect(demoTurn('Qu’a-t-on déjà fait chez Inconnue SA ?', 'REPLI').reply).toBe('REPLI')
  })
})
