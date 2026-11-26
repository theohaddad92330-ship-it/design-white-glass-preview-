import { describe, expect, it, vi } from 'vitest'
import { toPdfRenderError } from '../failure'

describe('toPdfRenderError', () => {
  it('porte la cause dans le message et la logge', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const err = toPdfRenderError(new Error('police illisible'))
    expect(err.message).toContain('police illisible')
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('accepte une valeur non-Error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(toPdfRenderError('boom').message).toContain('boom')
    spy.mockRestore()
  })
})
