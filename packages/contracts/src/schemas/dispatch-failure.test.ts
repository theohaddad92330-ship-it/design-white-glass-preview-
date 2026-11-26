import { describe, expect, it } from 'vitest'
import { dispatchFailureOutcome } from './dispatch-failure.js'

/**
 * L'invariant n°6 : « un timeout n'est pas un succès » — et il n'est pas non
 * plus un échec. Le contrat du routeur le déclare depuis le premier jour ; le
 * code repliait tout dans `failed`, ce que le commentaire du contrat interdit
 * explicitement : « rejouerait une action peut-être déjà faite ».
 *
 * La seule question : la requête a-t-elle pu PARTIR ?
 */
describe('dispatchFailureOutcome', () => {
  it('un délai dépassé en vol est UNKNOWN — rejouer y serait un double envoi', () => {
    for (const error of [
      Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }),
      Object.assign(new Error('fetch failed'), { cause: { code: 'UND_ERR_HEADERS_TIMEOUT' } }),
      Object.assign(new Error('read ETIMEDOUT'), { code: 'ETIMEDOUT' }),
      Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }),
      new Error('Request timed out after 30000ms'),
    ]) {
      expect(dispatchFailureOutcome(error), String((error as Error).message)).toBe('unknown')
    }
  })

  it('une connexion JAMAIS établie est un ÉCHEC — rien n’est parti, on peut rejouer', () => {
    // ⚠️ `UND_ERR_CONNECT_TIMEOUT` contient le mot « timeout » et n'en est pas
    // un au sens qui compte : c'est un délai d'ÉTABLISSEMENT. Le distant n'a
    // jamais rien reçu.
    for (const error of [
      Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }),
      Object.assign(new Error('getaddrinfo ENOTFOUND api.exemple'), { code: 'ENOTFOUND' }),
      Object.assign(new Error('fetch failed'), { cause: { code: 'UND_ERR_CONNECT_TIMEOUT' } }),
      new Error('unable to verify the first certificate'),
    ]) {
      expect(dispatchFailureOutcome(error), String((error as Error).message)).toBe('failed')
    }
  })

  it('un refus du distant est un ÉCHEC : il a répondu, donc il a traité', () => {
    expect(dispatchFailureOutcome(new Error('HTTP 422 Unprocessable Entity'))).toBe('failed')
    expect(dispatchFailureOutcome(new Error('HTTP 500 Internal Server Error'))).toBe('failed')
    expect(dispatchFailureOutcome(new Error('Invalid recipient'))).toBe('failed')
  })

  it('ce qu’on ne reconnaît pas vaut ÉCHEC', () => {
    // Le défaut prudent est celui qui autorise un rejeu : classer trop
    // largement en `unknown` bloquerait des reprises légitimes et laisserait
    // des actions en suspens pour toujours.
    expect(dispatchFailureOutcome(null)).toBe('failed')
    expect(dispatchFailureOutcome(undefined)).toBe('failed')
    expect(dispatchFailureOutcome('boom')).toBe('failed')
    expect(dispatchFailureOutcome({})).toBe('failed')
  })

  it('est PURE : deux appels sur la même erreur rendent la même chose', () => {
    const error = Object.assign(new Error('read ETIMEDOUT'), { code: 'ETIMEDOUT' })
    expect(dispatchFailureOutcome(error)).toBe(dispatchFailureOutcome(error))
  })
})
