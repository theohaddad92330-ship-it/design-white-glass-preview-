import { describe, expect, it } from 'vitest'
import { TechnicalError } from '@bellum/errors'
import { computeUrl } from './url.js'

describe('computeUrl', () => {
  it('returns the template unchanged when there are no placeholders', () => {
    expect(computeUrl({ template: '/health', variables: {} })).toBe('/health')
  })

  it('replaces a single placeholder', () => {
    expect(computeUrl({ template: '/api/jobs/{jobId}', variables: { jobId: '42' } })).toBe('/api/jobs/42')
  })

  it('replaces multiple placeholders', () => {
    expect(
      computeUrl({
        template: '/api/candidates/{candidateId}/notes/{noteId}',
        variables: { candidateId: '42', noteId: '7' },
      }),
    ).toBe('/api/candidates/42/notes/7')
  })

  it('throws TechnicalError when a variable is missing', () => {
    expect(() =>
      computeUrl({
        template: '/api/jobs/{jobId}',
        variables: {} as { jobId: string },
      }),
    ).toThrow(TechnicalError)
  })

  it('appends query parameters', () => {
    const url = computeUrl({
      template: '/api/jobs/{jobId}/candidates',
      variables: { jobId: '42' },
      query: { parsed: 'true', page: '1' },
    })
    expect(url).toBe('/api/jobs/42/candidates?parsed=true&page=1')
  })

  it('omits undefined query parameters', () => {
    const url = computeUrl({
      template: '/api/jobs',
      variables: {},
      query: { filter: 'active', cursor: undefined },
    })
    expect(url).toBe('/api/jobs?filter=active')
  })

  it('returns path without trailing ? when all query params are undefined', () => {
    const url = computeUrl({
      template: '/api/jobs',
      variables: {},
      query: { cursor: undefined },
    })
    expect(url).toBe('/api/jobs')
  })

  it('encodes query parameter values', () => {
    const url = computeUrl({
      template: '/search',
      variables: {},
      query: { q: 'hello world&more' },
    })
    expect(url).toBe('/search?q=hello+world%26more')
  })
})
