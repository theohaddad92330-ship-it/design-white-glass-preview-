import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { followBottom } from './follow-bottom'

function fakeBox(heights: { value: number }) {
  return {
    scrollTop: 0,
    get scrollHeight() {
      return heights.value
    },
  } as unknown as HTMLElement
}

describe('#3551 — le fil suit la réponse après un envoi', () => {
  it('descend tout de suite, PUIS à l’image suivante quand la hauteur a grandi (fil fenêtré)', () => {
    const heights = { value: 1000 }
    const box = fakeBox(heights)
    let frame: (() => void) | null = null
    followBottom(box, cb => {
      frame = cb
    })
    expect(box.scrollTop).toBe(1000)
    // La bulle neuve est mesurée après coup : la hauteur réelle dépasse celle lue au premier passage.
    heights.value = 1400
    frame!()
    expect(box.scrollTop).toBe(1400)
  })

  it('⚠️ SAIT DIRE NON — handleSend remet « en bas » : sans cela, un fil remonté ne suivait plus', () => {
    const source = readFileSync(join(__dirname, 'Chat.tsx'), 'utf8')
    const send = source.slice(source.indexOf('const handleSend = useCallback('))
    const before = send.slice(0, send.indexOf('setSending(true)'))
    expect(before).toContain('wasNearBottomRef.current = true')
  })
})
