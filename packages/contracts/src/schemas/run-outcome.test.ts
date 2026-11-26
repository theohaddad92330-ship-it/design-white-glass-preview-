import { describe, expect, it } from 'vitest'
import { RUN_ABANDONED_AFTER_MS, classifyRunOutcome } from './run-outcome.js'

/**
 * Ce que ces tests défendent : « on ne sait pas » est une réponse, et elle ne se
 * confond ni avec « ça marche encore » ni avec « ça a échoué ».
 */

const NOW = new Date('2026-08-29T12:00:00.000Z')
const ago = (ms: number) => new Date(NOW.getTime() - ms)

describe('classifyRunOutcome', () => {
  it('rend l’issue terminale telle que la table la porte', () => {
    expect(classifyRunOutcome({ status: 'completed', createdAt: ago(60_000) }, NOW)).toBe('completed')
    expect(classifyRunOutcome({ status: 'error', createdAt: ago(60_000) }, NOW)).toBe('failed')
    expect(classifyRunOutcome({ status: 'canceled', createdAt: ago(60_000) }, NOW)).toBe('canceled')
  })

  it('un run jeune encore « analyzing » travaille — ce n’est pas une issue', () => {
    expect(classifyRunOutcome({ status: 'analyzing', createdAt: ago(60_000) }, NOW)).toBe('running')
  })

  it('un run « analyzing » au-delà du plafond du worker n’a AUCUNE issue', () => {
    // Ni réussi, ni échoué : le processus qui nous devait un événement terminal
    // n'existe plus. Dire « échoué » serait une affirmation qu'on ne peut pas
    // tenir, dire « en cours » serait une promesse qu'on ne tiendra pas.
    expect(classifyRunOutcome({ status: 'analyzing', createdAt: ago(RUN_ABANDONED_AFTER_MS + 1) }, NOW)).toBe(
      'no_outcome',
    )
  })

  it('le plafond est une BORNE STRICTE — pile dessus, le run travaille encore', () => {
    expect(classifyRunOutcome({ status: 'analyzing', createdAt: ago(RUN_ABANDONED_AFTER_MS) }, NOW)).toBe('running')
  })

  it('un statut inconnu reste inconnu — jamais rangé de force', () => {
    expect(classifyRunOutcome({ status: 'queued', createdAt: ago(60_000) }, NOW)).toBe('unknown')
    expect(classifyRunOutcome({ status: '', createdAt: ago(60_000) }, NOW)).toBe('unknown')
  })

  it('le plafond vaut les 20 minutes du worker', () => {
    // Il MIROITE `JOB_TIMEOUT_MS`. S'il s'en écartait, un run vivant serait
    // déclaré sans suite, ou un run mort passerait pour vivant.
    expect(RUN_ABANDONED_AFTER_MS).toBe(1_200_000)
  })
})
