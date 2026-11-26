import { useEffect, useRef, type KeyboardEvent, type RefObject } from 'react'
import type { SendCommentOn } from '@/features/preferences/preferences-provider'

/**
 * #3563.5 (recette prod 02/10, vu par 4 recettes) — « é » devenait « ééé » et partait dans le message suivant.
 *
 * La cause n'est pas le brouillon : c'est l'Entrée tapée PENDANT une composition (touche morte, clavier
 * à accents, IME). Elle envoyait le message au milieu de la composition ; la composition se terminait ensuite
 * dans un champ déjà vidé, et le caractère composé se collait au message d'après. Une touche d'Entrée qui
 * VALIDE une composition n'est pas un envoi (`isComposing`, ou `keyCode 229` pour les navigateurs qui ne le
 * posent pas sur le keydown de clôture).
 */
export function isComposingKey(event: Pick<KeyboardEvent, 'nativeEvent' | 'keyCode'>): boolean {
  return event.nativeEvent?.isComposing === true || event.keyCode === 229
}

export function handleComposerKeyDown(
  event: KeyboardEvent<HTMLTextAreaElement>,
  onSend: () => void,
  sendOn: SendCommentOn,
): void {
  if (event.key !== 'Enter' || event.shiftKey || isComposingKey(event)) return
  // `enter` → plain Enter sends (Shift+Enter = newline). `mod-enter` → only
  // Cmd/Ctrl+Enter sends, so a bare Enter inserts a newline instead.
  if (sendOn === 'mod-enter' && !event.metaKey && !event.ctrlKey) return
  event.preventDefault()
  onSend()
}

/**
 * #B2.1 (recette prod 12/10) — « Entrée n'envoie pas, seul le bouton marche ».
 *
 * Certains claviers/outils de saisie n'émettent PAS le `keydown` Entrée attendu : le navigateur insère
 * seulement un saut de ligne (`beforeinput` `insertLineBreak`/`insertParagraph`). Sans filet, le message
 * restait dans le champ avec une ligne de plus. Ce filet n'agit que si `keydown` n'a pas déjà tranché
 * (un `preventDefault` en amont supprime le `beforeinput`) : jamais pendant une composition, jamais avec
 * Maj enfoncée (dernier `keydown` vu), jamais en mode Ctrl/Cmd+Entrée.
 */
export function useEnterFallback(
  textareaRef: RefObject<HTMLTextAreaElement | null>,
  onSend: () => void,
  sendOn: SendCommentOn,
): void {
  const sendRef = useRef(onSend)
  sendRef.current = onSend
  useEffect(() => {
    const el = textareaRef.current
    if (!el || sendOn !== 'enter') return
    let shiftHeld = false
    const track = (e: Event) => {
      shiftHeld = (e as globalThis.KeyboardEvent).shiftKey === true
    }
    const onBeforeInput = (e: Event) => {
      const input = e as InputEvent
      if (input.inputType !== 'insertLineBreak' && input.inputType !== 'insertParagraph') return
      if (input.isComposing || shiftHeld) return
      e.preventDefault()
      sendRef.current()
    }
    el.addEventListener('keydown', track)
    el.addEventListener('keyup', track)
    el.addEventListener('beforeinput', onBeforeInput)
    return () => {
      el.removeEventListener('keydown', track)
      el.removeEventListener('keyup', track)
      el.removeEventListener('beforeinput', onBeforeInput)
    }
  }, [textareaRef, sendOn])
}
