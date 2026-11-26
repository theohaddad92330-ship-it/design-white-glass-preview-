import { HttpError, HttpRetriesExhaustedError, HttpTimeoutError, TechnicalError } from '@bellum/errors'
import { describeExtractFailure, extractTimeoutMs } from './extract-failure'

const ctx = { filename: 'a.pdf', sizeBytes: 12 * 1024 * 1024, timeoutMs: 300_000 }

describe('extraction IA — cause nommée (#3586)', () => {
  it('le délai grandit avec la taille, borné 60 s – 5 min', () => {
    expect(extractTimeoutMs(100)).toBe(60_000)
    expect(extractTimeoutMs(5 * 1024 * 1024)).toBe(160_000)
    expect(extractTimeoutMs(500 * 1024 * 1024)).toBe(600_000)
  })

  it('un statut HTTP est nommé avec la taille et le délai', () => {
    const cause = new HttpError(413, 'trop gros', false, '/rag/extract')
    const msg = describeExtractFailure(new TechnicalError('HTTP request failed', { cause }), ctx)
    expect(msg).toContain('HTTP 413')
    expect(msg).toContain('12.0 Mo')
    expect(msg).toContain('300 s')
    expect(msg).not.toBe('HTTP request failed')
  })

  it('un timeout est nommé comme tel', () => {
    const cause = new HttpRetriesExhaustedError(3, '/rag/extract', {
      cause: new HttpTimeoutError(30_000, '/rag/extract'),
    })
    const msg = describeExtractFailure(new TechnicalError('HTTP request failed', { cause }), ctx)
    expect(msg).toContain('délai dépassé')
  })
})
