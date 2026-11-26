import { describe, expect, it } from 'vitest'
import { isEmailValid } from './email.js'

describe('isEmailValid', () => {
  it('shoud validate a valid email', () => {
    expect(isEmailValid('foo@bar.fr')).toBe(true)
  })

  it('shoud not validate an email with wrong TLD', () => {
    expect(isEmailValid('foo@bar.tst')).toBe(false)
  })

  it('shoud validate an email with a valid subdomain', () => {
    expect(isEmailValid('foo@bar.tst.fr')).toBe(true)
  })

  it('shoud not validate a wrong email', () => {
    expect(isEmailValid('notanemail@ahah')).toBe(false)
  })

  it('should not validate an email longer than 255 charachters', () => {
    expect(isEmailValid(`${[...Array(256)].fill('a').join('')}@orus.eu`)).toBe(false)
  })
})
