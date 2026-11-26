import { HttpError, TechnicalError } from '@bellum/errors'

import { classifyMessageFailure, messageFailureLogLevel } from './message-failure'

function wrapped(status: number, body: string): TechnicalError {
  return new TechnicalError('HTTP request failed', { cause: new HttpError(status, body, false, 'ia:message/generate') })
}

describe('classifyMessageFailure (#3458)', () => {
  it('un refus 422 nommé par le moteur garde sa raison, jamais un 500 muet', () => {
    const detail = 'packet de contexte insuffisant pour personnaliser : ajoutez un signal'
    const failure = classifyMessageFailure(wrapped(422, JSON.stringify({ detail })))
    expect(failure).toMatchObject({ reason: 'refused', status: 422, message: detail })
  })

  it('un refus typé du modèle (user_message) garde aussi sa phrase', () => {
    const body = JSON.stringify({ detail: { code: 'claude_truncated', user_message: 'Réponse tronquée.' } })
    expect(classifyMessageFailure(wrapped(422, body))).toMatchObject({
      reason: 'refused',
      message: 'Réponse tronquée.',
    })
  })

  // #4609 — « Ce contact est introuvable » sortait pour TOUT 404 du moteur, y compris « Account not found »
  // (le compte du contact) et le « Not Found » d'une route absente (service pas encore déployé).
  it('sait dire NON — un 404 « Account not found » nomme le COMPTE, pas le contact', () => {
    const failure = classifyMessageFailure(wrapped(404, JSON.stringify({ detail: 'Account not found' })))
    expect(failure).toMatchObject({ reason: 'account_not_found', status: 404 })
    expect(failure.message).toMatch(/^Le compte/)
  })

  it('sait dire NON — un 404 « Not Found » (route absente du moteur) est une panne 503, pas un contact disparu', () => {
    expect(classifyMessageFailure(wrapped(404, JSON.stringify({ detail: 'Not Found' })))).toMatchObject({
      reason: 'upstream_error',
      status: 503,
    })
  })

  it('un 404 « Contact not found » reste un contact introuvable', () => {
    expect(classifyMessageFailure(wrapped(404, JSON.stringify({ detail: 'Contact not found' })))).toMatchObject({
      reason: 'contact_not_found',
    })
  })

  it('un 500/502 du moteur est une panne 503, sans raison inventée', () => {
    expect(classifyMessageFailure(wrapped(502, '{"detail":"boom"}'))).toMatchObject({
      reason: 'upstream_error',
      status: 503,
    })
  })

  it('une erreur sans cause HTTP (timeout) est une panne 503', () => {
    expect(classifyMessageFailure(new Error('timeout'))).toMatchObject({ reason: 'upstream_error', status: 503 })
  })
})

/**
 * #4458 (Louis, tri Sentry 22/10/2026) — « le moteur IA a échoué (refused) » : le moteur a REFUSÉ
 * un brouillon et dit pourquoi (422, phrase française) — un signal métier, dit à l'écran, pas une
 * panne. Il part en `warn` ; seule la panne du moteur reste une exception Sentry.
 */
describe('messageFailureLogLevel (#4458)', () => {
  it('un refus du moteur est un warn', () => {
    expect(messageFailureLogLevel('refused')).toBe('warn')
  })

  it('sait dire NON — une panne du moteur, ou un contact introuvable, reste une error', () => {
    expect(messageFailureLogLevel('upstream_error')).toBe('error')
    expect(messageFailureLogLevel('contact_not_found')).toBe('error')
    expect(messageFailureLogLevel('account_not_found')).toBe('error')
  })
})
