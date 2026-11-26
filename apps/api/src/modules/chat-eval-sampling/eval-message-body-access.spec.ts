import { EVAL_MESSAGE_BODY_USER_ID_ENV, evalMayReadMessageBody } from './eval-message-body-access'

/**
 * #2958.98 (DEC-4036 Q5, Louis 19/10) — l'exception NOMMÉE à « le CORPS des messages ne sort
 * jamais » : le rejeu d'évaluation lit le corps des messages d'UN utilisateur, celui que
 * l'opérateur nomme par son identifiant. La garde doit savoir dire NON à tout le reste.
 */
const LOUIS = '7c0e6a52-1b2d-4f3e-9a8b-0c1d2e3f4a5b'
const env = (value?: string): NodeJS.ProcessEnv =>
  value === undefined ? {} : { [EVAL_MESSAGE_BODY_USER_ID_ENV]: value }

describe('evalMayReadMessageBody (#2958.98)', () => {
  it('OUI pour l’utilisateur nommé, hors démo', () => {
    expect(evalMayReadMessageBody(LOUIS, { isDemo: false }, env(LOUIS))).toBe(true)
    expect(evalMayReadMessageBody(LOUIS, { isDemo: false }, env(` ${LOUIS.toUpperCase()} `))).toBe(true)
  })

  it('NON sans variable — no-op strict', () => {
    expect(evalMayReadMessageBody(LOUIS, { isDemo: false }, env())).toBe(false)
    expect(evalMayReadMessageBody(LOUIS, { isDemo: false }, env(''))).toBe(false)
  })

  it('NON pour tout autre utilisateur', () => {
    expect(evalMayReadMessageBody('11111111-2222-4333-8444-555555555555', { isDemo: false }, env(LOUIS))).toBe(false)
    expect(evalMayReadMessageBody('', { isDemo: false }, env(LOUIS))).toBe(false)
  })

  it('NON en démo, même pour l’utilisateur nommé', () => {
    expect(evalMayReadMessageBody(LOUIS, { isDemo: true }, env(LOUIS))).toBe(false)
  })

  it('NON pour une valeur qui n’est pas UN identifiant (e-mail, liste, joker)', () => {
    expect(evalMayReadMessageBody(LOUIS, { isDemo: false }, env('louis@example.com'))).toBe(false)
    expect(evalMayReadMessageBody(LOUIS, { isDemo: false }, env(`${LOUIS},11111111-2222-4333-8444-555555555555`))).toBe(
      false,
    )
    expect(evalMayReadMessageBody(LOUIS, { isDemo: false }, env('*'))).toBe(false)
  })
})
