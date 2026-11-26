import { afterEach, describe, expect, it } from 'vitest'
import { isDevEnvironment } from './env.js'

// Vitest runs in Node so `process` exists at runtime. Local declaration keeps
// the file compilable without depending on `@types/node` being globally
// visible from every consumer that pulls this package through tsc --build.
declare const process: { env: { NODE_ENV?: string } }

describe('isDevEnvironment', () => {
  const original = process.env.NODE_ENV

  afterEach(() => {
    process.env.NODE_ENV = original
  })

  it('returns false when NODE_ENV is "production"', () => {
    process.env.NODE_ENV = 'production'
    expect(isDevEnvironment()).toBe(false)
  })

  it('returns true when NODE_ENV is "development"', () => {
    process.env.NODE_ENV = 'development'
    expect(isDevEnvironment()).toBe(true)
  })

  it('returns true when NODE_ENV is "test"', () => {
    process.env.NODE_ENV = 'test'
    expect(isDevEnvironment()).toBe(true)
  })

  it('returns true when NODE_ENV is unset', () => {
    delete process.env.NODE_ENV
    expect(isDevEnvironment()).toBe(true)
  })
})
