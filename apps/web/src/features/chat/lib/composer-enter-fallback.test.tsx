import { render } from '@testing-library/react'
import { useRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { SendCommentOn } from '@/features/preferences/preferences-provider'
import { useEnterFallback } from './composer-keys'

function Harness({ send, sendOn }: { send: () => void; sendOn: SendCommentOn }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useEnterFallback(ref, send, sendOn)
  return <textarea ref={ref} aria-label="saisie" />
}

function lineBreak(el: HTMLElement, init: { inputType?: string; isComposing?: boolean } = {}) {
  const event = new InputEvent('beforeinput', {
    inputType: init.inputType ?? 'insertLineBreak',
    isComposing: init.isComposing ?? false,
    cancelable: true,
    bubbles: true,
  })
  el.dispatchEvent(event)
  return event
}

describe('#B2.1 — Entrée envoie même quand le navigateur n’émet qu’un saut de ligne (sans keydown)', () => {
  it('un saut de ligne sans Maj envoie et n’insère rien', () => {
    const send = vi.fn()
    const { getByLabelText } = render(<Harness send={send} sendOn="enter" />)
    const event = lineBreak(getByLabelText('saisie'))
    expect(send).toHaveBeenCalledTimes(1)
    expect(event.defaultPrevented).toBe(true)
  })

  it('Maj enfoncée (dernier keydown) : retour à la ligne, pas d’envoi', () => {
    const send = vi.fn()
    const { getByLabelText } = render(<Harness send={send} sendOn="enter" />)
    const area = getByLabelText('saisie')
    area.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift', shiftKey: true, bubbles: true }))
    const event = lineBreak(area)
    expect(send).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
  })

  it('pendant une composition (accents, IME) : rien ne part', () => {
    const send = vi.fn()
    const { getByLabelText } = render(<Harness send={send} sendOn="enter" />)
    lineBreak(getByLabelText('saisie'), { isComposing: true })
    expect(send).not.toHaveBeenCalled()
  })

  it('réglage Ctrl/Cmd+Entrée : le saut de ligne n’envoie pas ; une frappe de texte non plus', () => {
    const send = vi.fn()
    const { getByLabelText, rerender } = render(<Harness send={send} sendOn="mod-enter" />)
    lineBreak(getByLabelText('saisie'))
    rerender(<Harness send={send} sendOn="enter" />)
    lineBreak(getByLabelText('saisie'), { inputType: 'insertText' })
    expect(send).not.toHaveBeenCalled()
  })
})
