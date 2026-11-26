import type { ExecutionContext } from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import { InternalSecretGuard } from './internal-secret.guard'

function ctx(headers: Record<string, string | string[] | undefined>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  } as unknown as ExecutionContext
}

function guardWith(expected: string | undefined): InternalSecretGuard {
  const config = { get: jest.fn().mockReturnValue(expected) } as unknown as ConfigService
  return new InternalSecretGuard(config)
}

describe('InternalSecretGuard', () => {
  it('allows a request whose header matches the configured secret', () => {
    expect(guardWith('s3cret-value').canActivate(ctx({ 'x-internal-secret': 's3cret-value' }))).toBe(true)
  })

  it('rejects a mismatched secret of different length', () => {
    expect(guardWith('s3cret-value').canActivate(ctx({ 'x-internal-secret': 'nope' }))).toBe(false)
  })

  it('rejects a same-length-but-different secret (timing-safe compare)', () => {
    expect(guardWith('aaaaaa').canActivate(ctx({ 'x-internal-secret': 'bbbbbb' }))).toBe(false)
  })

  it('rejects when the header is absent', () => {
    expect(guardWith('s3cret-value').canActivate(ctx({}))).toBe(false)
  })

  it('fails closed when no secret is configured', () => {
    expect(guardWith('').canActivate(ctx({ 'x-internal-secret': 'anything' }))).toBe(false)
  })

  it('uses the first value when the header arrives as an array', () => {
    expect(guardWith('s3cret-value').canActivate(ctx({ 'x-internal-secret': ['s3cret-value', 'x'] }))).toBe(true)
  })
})
