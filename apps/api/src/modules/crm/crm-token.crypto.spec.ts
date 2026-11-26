import { decryptToken, encryptToken } from './crm-token.crypto'

describe('crm-token.crypto', () => {
  const OLD = process.env['CRM_TOKEN_ENC_KEY']
  beforeAll(() => {
    process.env['CRM_TOKEN_ENC_KEY'] = 'test-encryption-key-with-enough-entropy-1234567890'
  })
  afterAll(() => {
    if (OLD === undefined) delete process.env['CRM_TOKEN_ENC_KEY']
    else process.env['CRM_TOKEN_ENC_KEY'] = OLD
  })

  it('round-trips a token', () => {
    const plaintext = 'CJ2fake-hubspot-access-token-abcdef'
    const encrypted = encryptToken(plaintext)
    expect(encrypted).not.toContain(plaintext)
    expect(encrypted.startsWith('v1:')).toBe(true)
    expect(decryptToken(encrypted)).toBe(plaintext)
  })

  it('produces a different ciphertext each time (random IV)', () => {
    const a = encryptToken('same-token')
    const b = encryptToken('same-token')
    expect(a).not.toBe(b)
    expect(decryptToken(a)).toBe('same-token')
    expect(decryptToken(b)).toBe('same-token')
  })

  it('rejects a tampered ciphertext (GCM auth)', () => {
    const encrypted = encryptToken('secret')
    const parts = encrypted.split(':')
    // Flip a byte in the ciphertext segment.
    const data = Buffer.from(parts[3], 'base64')
    data[0] = data[0] ^ 0xff
    parts[3] = data.toString('base64')
    expect(() => decryptToken(parts.join(':'))).toThrow()
  })

  it('rejects a malformed payload', () => {
    expect(() => decryptToken('not-a-valid-token')).toThrow('Malformed encrypted token')
  })
})
