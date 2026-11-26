import { describe, expect, it, vi } from 'vitest'
import { newSubscribable } from './observable.js'

describe('newSubscribable', () => {
  it('exposes the initial value via getValue', () => {
    const s = newSubscribable(42)
    expect(s.getValue()).toBe(42)
  })

  it('returns updated values from getValue after setValue', () => {
    const s = newSubscribable(1)
    s.setValue(2)
    expect(s.getValue()).toBe(2)
  })

  it('does NOT replay the current value on subscribe', () => {
    const s = newSubscribable(42)
    const spy = vi.fn()
    s.subscribe(spy)
    expect(spy).not.toHaveBeenCalled()
  })

  it('notifies subscribers when the value changes', () => {
    const s = newSubscribable('a')
    const spy = vi.fn()
    s.subscribe(spy)
    s.setValue('b')
    expect(spy).toHaveBeenCalledWith('b')
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('skips notifications when setValue is called with the same value (===)', () => {
    const s = newSubscribable('a')
    const spy = vi.fn()
    s.subscribe(spy)
    s.setValue('a')
    expect(spy).not.toHaveBeenCalled()
  })

  it('accepts a reducer function to derive the next value', () => {
    const s = newSubscribable(10)
    const spy = vi.fn()
    s.subscribe(spy)
    s.setValue(n => n + 5)
    expect(s.getValue()).toBe(15)
    expect(spy).toHaveBeenCalledWith(15)
  })

  it('broadcasts to multiple subscribers', () => {
    const s = newSubscribable(0)
    const a = vi.fn()
    const b = vi.fn()
    s.subscribe(a)
    s.subscribe(b)
    s.setValue(1)
    expect(a).toHaveBeenCalledWith(1)
    expect(b).toHaveBeenCalledWith(1)
  })

  it('returns an unsubscribe function that stops notifications for that subscriber only', () => {
    const s = newSubscribable(0)
    const a = vi.fn()
    const b = vi.fn()
    const unsubA = s.subscribe(a)
    s.subscribe(b)

    s.setValue(1)
    unsubA()
    s.setValue(2)

    expect(a).toHaveBeenCalledTimes(1)
    expect(a).toHaveBeenCalledWith(1)
    expect(b).toHaveBeenCalledTimes(2)
    expect(b).toHaveBeenLastCalledWith(2)
  })

  it('unsubscribe removes ALL registrations of the same function (reference-based)', () => {
    // Implementation filters subscribers by reference, so calling unsub once
    // detaches every registration of that same function. Documented as a quirk.
    const s = newSubscribable(0)
    const spy = vi.fn()
    const unsub1 = s.subscribe(spy)
    s.subscribe(spy)

    s.setValue(1)
    expect(spy).toHaveBeenCalledTimes(2)

    unsub1()
    s.setValue(2)
    expect(spy).toHaveBeenCalledTimes(2)
  })
})
