import { useTranslation } from 'react-i18next'
import type { Shortcut } from './shortcuts'

/**
 * Comment une touche s'ÉCRIT — la plateforme, les libellés, l'attribut ARIA.
 *
 * Séparé du registre (qui dit QUELLES touches existent) et du composant (qui
 * dessine les capuchons) parce que `⌘` n'est pas un fait du produit : c'est un
 * fait du CLAVIER de celui qui regarde. Écrire « ⌘K » en dur affiche une touche
 * qui n'existe pas sous Windows, et c'est un défaut muet — personne ne dépose
 * un ticket pour un raccourci mal orthographié, il cesse simplement d'être
 * essayé.
 */

const APPLE_PLATFORM = /Mac|iPhone|iPad|iPod/

/**
 * Le clavier a-t-il une touche ⌘ ?
 *
 * `navigator.platform` est déprécié mais reste renseigné partout, et il répond
 * juste là où `userAgent` ment (un iPad qui se déclare « Macintosh »). L'`OR`
 * couvre les navigateurs qui l'ont retiré.
 */
function isAppleKeyboard(): boolean {
  if (typeof navigator === 'undefined') return false
  return APPLE_PLATFORM.test(navigator.platform || navigator.userAgent)
}

/**
 * Ce qu'un BOUTON de l'application passe aux capuchons : rien au doigt, les
 * touches à la souris. Écrit une fois — trois boutons l'utilisent, et trois
 * recopies auraient fini par diverger d'une variante.
 */
export const HIDE_ON_TOUCH = 'hidden pointer-fine:inline-flex'

/** Ce qui s'affiche sur un capuchon : ⌘/Ctrl, Échap, Maj/Shift, ou la touche elle-même. */
export function keyLabel(
  segment: string,
  apple: boolean,
  modLabel: string,
  escLabel: string,
  shiftLabel?: string,
): string {
  if (segment === 'MOD') return apple ? '⌘' : modLabel
  if (segment === 'ESC') return escLabel
  // #2207.67 — `⌘⇧K` (recherche globale) est la première combinaison à trois
  // segments du registre. `apple` porte le glyphe (⇧), comme `MOD` porte ⌘ :
  // les deux touches ont un glyphe reconnu sur clavier Apple et un nom ailleurs.
  if (segment === 'SHIFT') return apple ? '⇧' : (shiftLabel ?? segment)
  return segment
}

/**
 * Le raccourci au format `aria-keyshortcuts`, ou `undefined`.
 *
 * L'attribut ARIA prévu exactement pour ça : il est annoncé par le lecteur
 * d'écran SANS entrer dans le nom accessible du bouton. C'est ce qui permet à
 * l'entrée de navigation de rester nommée « Comptes ».
 */
export function shortcutAriaKeys(shortcut: Shortcut): string | undefined {
  const [modifier, second, third] = shortcut.keys
  // `aria-keyshortcuts` décrit une COMBINAISON. Une séquence à deux temps n'a
  // pas de syntaxe : « G C » s'y lit « G, OU C », et annoncer une touche qui ne
  // fait rien seule est pire que ne rien annoncer.
  if (modifier !== 'MOD') return undefined
  const requiresShift = second === 'SHIFT'
  const letter = requiresShift ? third : second
  if (letter === undefined) return undefined
  // Les noms sont ceux de `KeyboardEvent.key`, comme la spécification l'exige —
  // « Cmd » ou « ⌘ » n'y veulent rien dire.
  const mod = isAppleKeyboard() ? 'Meta' : 'Control'
  return requiresShift ? `${mod}+Shift+${letter}` : `${mod}+${letter}`
}

/**
 * Ce que les capuchons ont besoin de savoir : la plateforme et les trois
 * libellés traduits. Un seul appel de traduction pour les deux consommateurs.
 */
export function useKeyRenderer(): (segment: string) => string {
  const { t } = useTranslation('shortcuts')
  const apple = isAppleKeyboard()
  const modLabel = t('keys.mod')
  const escLabel = t('keys.escape')
  const shiftLabel = t('keys.shift')
  return segment => keyLabel(segment, apple, modLabel, escLabel, shiftLabel)
}

/**
 * Le raccourci en TEXTE — « ⌘ K », « Ctrl K », « G C ».
 *
 * Pour les endroits qui n'acceptent pas de balise : un attribut `title`, un
 * `aria-label`. Il résout `MOD` comme les capuchons, au même endroit.
 */
export function useShortcutLabel(shortcut: Shortcut): string {
  const render = useKeyRenderer()
  return shortcut.keys.map(render).join(' ')
}
