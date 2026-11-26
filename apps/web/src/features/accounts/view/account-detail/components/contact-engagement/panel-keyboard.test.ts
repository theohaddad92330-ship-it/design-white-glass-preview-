import { describe, expect, it } from 'vitest'
import { closesPanelOnKey } from './panel-keyboard'

const key = (over: Partial<Pick<KeyboardEvent, 'key' | 'defaultPrevented' | 'isComposing'>> = {}) => ({
  key: 'Escape',
  defaultPrevented: false,
  isComposing: false,
  ...over,
})

describe('closesPanelOnKey (#3696.7)', () => {
  it('Échap, depuis le panneau, le ferme', () => {
    expect(closesPanelOnKey(key(), true)).toBe(true)
  })

  it('SAIT DIRE NON — une autre touche, un menu portalisé, une composition IME ou un événement consommé', () => {
    expect(closesPanelOnKey(key({ key: 'Enter' }), true)).toBe(false)
    expect(closesPanelOnKey(key(), false)).toBe(false)
    expect(closesPanelOnKey(key({ isComposing: true }), true)).toBe(false)
    expect(closesPanelOnKey(key({ defaultPrevented: true }), true)).toBe(false)
  })
})
