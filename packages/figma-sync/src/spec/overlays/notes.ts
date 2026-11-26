import type { Block, UxNote } from '../types'

/**
 * Les notes d'UX COMMUNES aux surcouches — écrites une fois (GA-26), citées par chaque spec.
 */

type Source = `${string}:${number}`

/** Famille modale : où va le focus, ce que fait Échap (exigé par `validateOverlay`). */
export const focusNote = (source: Source, focus: string, escape = 'ferme sans rien enregistrer'): UxNote => ({
  kind: 'decision',
  text: `Focus sur ${focus} à l’ouverture, enfermé dans la surcouche ; Échap ${escape} et rend le focus au déclencheur.`,
  source,
})

/** Le code pose une modale CENTRÉE étroite sur téléphone ; la maquette, un panneau bas pleine largeur. */
export const MOBILE_SHEET: UxNote = {
  kind: 'ecart',
  text: 'En mobile, `DialogContent` reste une modale centrée (`w-[calc(100%-2rem)]`) : la cible est un panneau bas pleine largeur, pied en colonne, action principale en haut, à portée de pouce.',
  source: 'packages/ui/src/components/dialog.tsx:80',
}

/** Le voile est un littéral dans le code ; la maquette le lie à la seule variable de voile. */
export const SCRIM: UxNote = {
  kind: 'ecart',
  text: 'Voile `bg-black/80` littéral (aucun jeton) : la maquette le lie à `guide/veil` ; à remplacer par un jeton de voile dans tokens.css.',
  source: 'packages/ui/src/components/dialog.tsx:23',
}

/** Un `window.confirm` du backoffice : boîte native, ni verbe sur le bouton, ni conséquence nommée. */
export const nativeConfirm = (source: Source): UxNote => ({
  kind: 'ecart',
  text: '`window.confirm` natif : le bouton dit « OK », la conséquence n’est pas nommée, rien n’est stylé. La cible est la confirmation maquettée (verbe explicite, bouton destructif).',
  source,
})

/** Un champ texte du catalogue. */
export const input = (label: string, placeholder?: string): Block => ({
  type: 'component',
  component: 'Input',
  props: { content: placeholder ? { label, placeholder } : { label } },
})

export const textarea = (label: string, placeholder?: string): Block => ({
  type: 'component',
  component: 'Textarea',
  props: { content: placeholder ? { label, placeholder } : { label } },
})

export const select = (label: string, value: string, items?: string[]): Block => ({
  type: 'component',
  component: 'Select',
  props: items ? { content: { label, value }, items } : { content: { label, value } },
})

export const paragraph = (text: string): Block => ({ type: 'text', text, style: 'body', color: 'text/secondary' })

/** Une ligne libellé → valeur (destinataire, objet, coût…). */
export const dataRow = (label: string, value: string): Block => ({
  type: 'component',
  component: 'DataRow',
  props: { content: { label, value } },
})

/** Un intertitre de corps (« Ce qui part », « Ce qui reste »). */
export const heading = (text: string): Block => ({ type: 'text', text, style: 'label' })

/** Un encadré d'information ou d'avertissement du catalogue. */
export const banner = (variant: 'info' | 'warning' | 'danger', title: string, description?: string): Block => ({
  type: 'component',
  component: 'InfoBanner',
  props: { variant, size: 'sm', content: description ? { title, description } : { title } },
})

/** Une modale maison sur `ModalPortal` : voile littéral, ni focus enfermé ni Échap garantis par Radix. */
export const modalPortal = (source: Source): UxNote => ({
  kind: 'ecart',
  text: 'Modale maison sur `ModalPortal` (voile `rgba` littéral, animation d’échelle) au lieu de `Dialog` : focus enfermé et Échap ne sont pas garantis. La cible est le `Dialog` du catalogue (RUX-23).',
  source,
})
