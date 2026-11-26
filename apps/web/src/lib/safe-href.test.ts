import { describe, expect, it } from 'vitest'
import { safeHref } from './safe-href'

describe('safeHref', () => {
  it('allows http(s) URLs unchanged', () => {
    expect(safeHref('https://www.linkedin.com/in/foo')).toBe('https://www.linkedin.com/in/foo')
    expect(safeHref('http://example.com')).toBe('http://example.com')
  })

  it('neutralises javascript: and other dangerous schemes', () => {
    expect(safeHref('javascript:alert(1)')).toBeUndefined()
    expect(safeHref('JavaScript:alert(1)')).toBeUndefined()
    expect(safeHref('  javascript:alert(1)  ')).toBeUndefined()
    expect(safeHref('data:text/html,<script>alert(1)</script>')).toBeUndefined()
    expect(safeHref('vbscript:msgbox(1)')).toBeUndefined()
  })

  it('returns undefined for empty/nullish input', () => {
    expect(safeHref(null)).toBeUndefined()
    expect(safeHref(undefined)).toBeUndefined()
    expect(safeHref('')).toBeUndefined()
    expect(safeHref('   ')).toBeUndefined()
  })

  it('rejects mailto:/tel: by default, allows them only when opted in', () => {
    expect(safeHref('mailto:a@b.com')).toBeUndefined()
    expect(safeHref('mailto:a@b.com', { allowMailtoTel: true })).toBe('mailto:a@b.com')
    expect(safeHref('tel:+33123', { allowMailtoTel: true })).toBe('tel:+33123')
  })
})
