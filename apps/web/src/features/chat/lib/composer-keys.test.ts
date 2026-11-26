import type { KeyboardEvent } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { handleComposerKeyDown } from './composer-keys'

function key(init: {
  key?: string
  shiftKey?: boolean
  metaKey?: boolean
  ctrlKey?: boolean
  keyCode?: number
  composing?: boolean
}) {
  const preventDefault = vi.fn()
  const event = {
    key: init.key ?? 'Enter',
    shiftKey: init.shiftKey ?? false,
    metaKey: init.metaKey ?? false,
    ctrlKey: init.ctrlKey ?? false,
    keyCode: init.keyCode ?? 13,
    nativeEvent: { isComposing: init.composing ?? false },
    preventDefault,
  } as unknown as KeyboardEvent<HTMLTextAreaElement>
  return { event, preventDefault }
}

describe('#3563.5 — l’Entrée qui valide une composition n’envoie pas le message', () => {
  it('Entrée simple envoie (réglage `enter`)', () => {
    const send = vi.fn()
    const { event, preventDefault } = key({})
    handleComposerKeyDown(event, send, 'enter')
    expect(send).toHaveBeenCalledTimes(1)
    expect(preventDefault).toHaveBeenCalled()
  })

  it('Entrée PENDANT une composition (isComposing) n’envoie rien', () => {
    const send = vi.fn()
    handleComposerKeyDown(key({ composing: true }).event, send, 'enter')
    expect(send).not.toHaveBeenCalled()
  })

  it('keyCode 229 (clôture d’IME sans isComposing) n’envoie rien non plus', () => {
    const send = vi.fn()
    handleComposerKeyDown(key({ keyCode: 229 }).event, send, 'enter')
    expect(send).not.toHaveBeenCalled()
  })

  it('Maj+Entrée et une autre touche n’envoient pas ; Ctrl+Entrée envoie en mode `mod-enter`', () => {
    const send = vi.fn()
    handleComposerKeyDown(key({ shiftKey: true }).event, send, 'enter')
    handleComposerKeyDown(key({ key: 'é' }).event, send, 'enter')
    handleComposerKeyDown(key({}).event, send, 'mod-enter')
    expect(send).not.toHaveBeenCalled()
    handleComposerKeyDown(key({ ctrlKey: true }).event, send, 'mod-enter')
    expect(send).toHaveBeenCalledTimes(1)
  })
})
