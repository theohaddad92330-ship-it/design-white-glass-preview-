import { describe, expect, it } from 'vitest'
import { buildUrlWithPriority } from './rate-limiter.js'

describe('buildUrlWithPriority', () => {
  it('joins base and path', () => {
    expect(buildUrlWithPriority({ baseUrl: 'https://api.example.com', path: '/v1/x' })).toBe(
      'https://api.example.com/v1/x',
    )
  })

  it('appends priority as a query param when provided', () => {
    expect(buildUrlWithPriority({ baseUrl: 'https://api.example.com', path: '/v1/x', priority: 3 })).toBe(
      'https://api.example.com/v1/x?priority=3',
    )
  })

  it('omits priority query when undefined', () => {
    expect(buildUrlWithPriority({ baseUrl: 'https://api.example.com', path: '/v1/x' })).not.toContain('priority=')
  })

  it('preserves existing query params in the path', () => {
    const url = buildUrlWithPriority({ baseUrl: 'https://api.example.com', path: '/v1/x?foo=bar', priority: 2 })
    expect(url).toContain('foo=bar')
    expect(url).toContain('priority=2')
  })

  it('handles trailing slash on baseUrl correctly', () => {
    expect(buildUrlWithPriority({ baseUrl: 'https://api.example.com/', path: '/v1/x' })).toBe(
      'https://api.example.com/v1/x',
    )
  })
})
