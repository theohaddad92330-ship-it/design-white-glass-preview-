import { HttpException, HttpStatus } from '@nestjs/common'
import { MailTransportRejectedError } from '../mailer/mail-transport-rejected.error'
import { classifyTransportFailure } from './send-transport-outcome'

describe('classifyTransportFailure — #3699.5 : un refus n’est pas un doute', () => {
  it('une réponse de refus du transport est un ÉCHEC : rien n’est parti', () => {
    expect(classifyTransportFailure(new MailTransportRejectedError('Resend API error: invalid'))).toBe('failed')
  })

  it('un refus applicatif (opt-out, droit manquant) est un ÉCHEC', () => {
    expect(classifyTransportFailure(new HttpException('désabonné', HttpStatus.CONFLICT))).toBe('failed')
  })

  it('une réponse HTTP non-OK d’une boîte connectée est un ÉCHEC', () => {
    expect(classifyTransportFailure(new Error('Microsoft sendMail failed: 403 Forbidden'))).toBe('failed')
  })

  it.each([
    ['fetch coupé', Object.assign(new TypeError('fetch failed'), {})],
    ['délai dépassé', Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' })],
    ['abandon', Object.assign(new Error('aborted'), { name: 'AbortError' })],
    ['socket', Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' })],
  ])('%s : la réponse n’est jamais arrivée, le message est peut-être parti → INCERTAIN', (_label, cause) => {
    expect(classifyTransportFailure(cause)).toBe('uncertain')
  })

  it('une valeur inconnue (ni Error ni objet) est incertaine : on ne devine pas un échec', () => {
    expect(classifyTransportFailure('boom')).toBe('uncertain')
  })
})
