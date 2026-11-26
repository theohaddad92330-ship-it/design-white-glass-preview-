import { COMPONENTS, TEMPLATES } from './catalog'
import { COLOR_TOKENS, RADIUS_TOKENS, SHADOW_TOKENS, SPACE_TOKENS, TEXT_STYLES } from './token-names.generated'
import type { OverlaySpec, PageSpec } from './types'

/**
 * La validation RUNTIME d'une spec. Le type attrape déjà presque tout à la
 * compilation ; celle-ci tient la même règle pour ce qui échappe au type (un
 * `as`, un JSON, une spec écrite par un script) et c'est elle que le plugin
 * rejoue avant de dessiner. Elle rend la LISTE des erreurs, jamais la
 * première seule : un lot qui écrit dix pages veut tout voir d'un coup.
 */

type Loose = Record<string, unknown>

const has = (list: readonly string[], v: unknown): boolean => typeof v === 'string' && list.includes(v)
// `Object.hasOwn` n'existe pas dans le bac à sable des plugins Figma, qui embarque ce module.
const hasKey = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k)
const isObj = (v: unknown): v is Loose => typeof v === 'object' && v !== null && !Array.isArray(v)

function checkToken(errors: string[], at: string, kind: string, list: readonly string[], v: unknown): void {
  if (v !== undefined && !has(list, v)) errors.push(`${at} : ${kind} « ${String(v)} »`)
}

function validateBlocks(blocks: unknown, at: string, errors: string[]): void {
  if (!Array.isArray(blocks)) {
    errors.push(`${at} : une liste de blocs est attendue`)
    return
  }
  blocks.forEach((raw, i) => {
    const here = `${at}[${i}]`
    if (!isObj(raw)) {
      errors.push(`${here} : bloc illisible`)
      return
    }
    switch (raw.type) {
      case 'text':
        if (typeof raw.text !== 'string') errors.push(`${here} : texte manquant`)
        checkToken(errors, here, 'style de texte inconnu', TEXT_STYLES, raw.style ?? '(absent)')
        checkToken(errors, here, 'couleur inconnue', COLOR_TOKENS, raw.color)
        return
      case 'stack':
        if (raw.direction !== 'row' && raw.direction !== 'column')
          errors.push(`${here} : direction row|column attendue`)
        checkToken(errors, here, 'espacement inconnu', SPACE_TOKENS, raw.gap ?? '(absent)')
        checkToken(errors, here, 'espacement inconnu', SPACE_TOKENS, raw.padding)
        checkToken(errors, here, 'couleur inconnue', COLOR_TOKENS, raw.fill)
        checkToken(errors, here, 'couleur inconnue', COLOR_TOKENS, raw.stroke)
        checkToken(errors, here, 'rayon inconnu', RADIUS_TOKENS, raw.radius)
        checkToken(errors, here, 'ombre inconnue', SHADOW_TOKENS, raw.shadow)
        validateBlocks(raw.children, `${here}.children`, errors)
        return
      case 'grid':
        checkToken(errors, here, 'espacement inconnu', SPACE_TOKENS, raw.gap ?? '(absent)')
        if (![1, 2, 3, 4, 5, 6, 12].includes(raw.columns as number)) errors.push(`${here} : colonnes 1|2|3|4|5|6|12`)
        validateBlocks(raw.children, `${here}.children`, errors)
        return
      case 'placeholder':
        if (typeof raw.label !== 'string' || raw.label.length === 0)
          errors.push(`${here} : un emplacement porte un libellé`)
        if (!has(['sm', 'md', 'lg'], raw.height)) errors.push(`${here} : hauteur sm|md|lg`)
        return
      case 'component':
        validateComponent(raw, here, errors)
        return
      default:
        errors.push(`${here} : type de bloc inconnu « ${String(raw.type)} »`)
    }
  })
}

function validateComponent(raw: Loose, at: string, errors: string[]): void {
  const id = String(raw.component)
  if (!hasKey(COMPONENTS, id)) {
    errors.push(`${at} : composant inconnu « ${id} »`)
    return
  }
  const def = COMPONENTS[id as keyof typeof COMPONENTS] as {
    variants: Record<string, readonly string[]>
    content: readonly string[]
    items?: true | number
    table?: true
    children?: true
  }
  const props = isObj(raw.props) ? raw.props : {}
  for (const [key, value] of Object.entries(props)) {
    if (key === 'content') {
      for (const k of Object.keys(isObj(value) ? value : {})) {
        if (!def.content.includes(k)) errors.push(`${at} : ${id}.content « ${k} » inconnu`)
      }
    } else if (key === 'items') {
      if (!def.items) errors.push(`${at} : ${id} ne prend pas d’items`)
      else if (!Array.isArray(value)) errors.push(`${at} : ${id}.items doit être une liste`)
      else if (typeof def.items === 'number' && value.length !== def.items) {
        errors.push(`${at} : ${id} attend ${def.items} éléments, pas ${value.length}`)
      }
    } else if (key === 'table') {
      if (!def.table) errors.push(`${at} : ${id} ne prend pas de tableau`)
    } else if (hasKey(def.variants, key)) {
      if (!has(def.variants[key] ?? [], value)) errors.push(`${at} : ${id}.${key} « ${String(value)} » inconnu`)
    } else {
      errors.push(`${at} : ${id} n’a pas de prop « ${key} »`)
    }
  }
  if (raw.children !== undefined) {
    if (!def.children) errors.push(`${at} : ${id} ne porte pas d’enfants`)
    else validateBlocks(raw.children, `${at}.children`, errors)
  }
}

export function validatePage(page: PageSpec): string[] {
  const p = page as unknown as Loose
  const errors: string[] = []
  const id = String(p.id)
  const templateId = String(p.template)
  if (!hasKey(TEMPLATES, templateId)) return [`${id} : gabarit inconnu « ${templateId} »`]
  const template = TEMPLATES[templateId as keyof typeof TEMPLATES]
  const slots = isObj(p.slots) ? p.slots : {}
  const states = isObj(p.states) ? p.states : {}

  if (!/^(app|site|dm)\/[\w-]+(\/[\w-]+)*$/.test(id) || !id.startsWith(`${String(p.surface)}/`)) {
    errors.push(`${id} : l’identifiant doit commencer par sa surface (app/…, site/…, dm/…)`)
  }
  for (const [slot, blocks] of Object.entries(slots)) {
    if (!(template.slots as readonly string[]).includes(slot)) {
      errors.push(`${id} : slot « ${slot} » absent du gabarit « ${templateId} »`)
    } else validateBlocks(blocks, `${id}.slots.${slot}`, errors)
  }
  for (const slot of template.required) {
    if (!hasKey(slots, slot)) errors.push(`${id} : slot obligatoire « ${slot} » manquant`)
  }
  for (const state of template.states) {
    if (!hasKey(states, state)) errors.push(`${id} : état obligatoire « ${state} » manquant`)
  }
  const optional: readonly string[] = 'optionalStates' in template ? template.optionalStates : []
  for (const [state, blocks] of Object.entries(states)) {
    if (!(template.states as readonly string[]).includes(state) && !optional.includes(state)) {
      errors.push(`${id} : état « ${state} » inconnu du gabarit « ${templateId} »`)
    } else validateBlocks(blocks, `${id}.states.${state}`, errors)
  }
  const viewports = Array.isArray(p.viewports) ? p.viewports : []
  if (viewports.length === 0 || viewports.some(v => v !== 'desktop' && v !== 'mobile')) {
    errors.push(`${id} : viewports desktop|mobile, au moins un`)
  }
  for (const note of Array.isArray(p.uxNotes) ? p.uxNotes : []) {
    const n = isObj(note) ? note : {}
    if (n.kind !== 'ecart' && n.kind !== 'decision') errors.push(`${id} : note UX de nature « ${String(n.kind)} »`)
    if (typeof n.source !== 'string' || !/^[\w./@[\]-]+:\d+$/.test(n.source)) {
      errors.push(`${id} : note UX sans source fichier:ligne (source « ${String(n.source)} »)`)
    }
  }
  return errors
}

// ─── Surcouches ───────────────────────────────────────────────────────────

const OVERLAY_KINDS = ['dialog', 'confirm', 'wizard', 'command', 'sheet', 'popover', 'dropdown', 'tooltip', 'toast']
/** Les familles MODALES : voile sur la page, focus enfermé, Échap ferme. */
export const MODAL_KINDS: readonly string[] = ['dialog', 'confirm', 'wizard', 'command', 'sheet']
/** Un libellé qui ne dit pas CE qui va se passer : interdit sur un bouton destructif. */
const VAGUE_LABELS = /^(ok|oui|confirmer|valider|continuer|d’accord|d'accord|yes|confirm)\b/i
const SOURCE = /^[\w./@[\]-]+:\d+$/
/** Les familles SANS pied (le rendu n'a pas de boutons où poser des actions). */
const NO_ACTIONS = ['tooltip', 'dropdown', 'toast']
/** Les familles SANS corps (leur composant n'a ni enfant ni zone libre). */
const NO_BODY = ['tooltip', 'dropdown', 'toast', 'confirm']

/**
 * Une surcouche : son identifiant, sa famille, sa page parente (au registre, même surface), ses
 * blocs, et les règles d'UX que la maquette tient (destructif = verbe explicite sur un bouton
 * `destructive`, famille modale = focus et Échap nommés). Le backoffice se dessine aussi sur téléphone (Q7).
 */
export function validateOverlay(overlay: OverlaySpec, pages: readonly PageSpec[]): string[] {
  const o = overlay as unknown as Loose
  const errors: string[] = []
  const id = String(o.id)
  const surface = String(o.surface)
  const kind = String(o.kind)
  if (!/^(app|site|dm)\/overlays\/[\w-]+$/.test(id) || !id.startsWith(`${surface}/`))
    errors.push(`${id} : l’identifiant doit être <surface>/overlays/<slug>, de sa surface`)
  if (!OVERLAY_KINDS.includes(kind)) errors.push(`${id} : famille inconnue « ${kind} »`)
  const parent = isObj(o.parent) ? o.parent : {}
  if (typeof parent.page === 'string') {
    const page = pages.find(p => p.id === parent.page)
    if (!page) errors.push(`${id} : page parente « ${parent.page} » absente du registre`)
    else if (page.surface !== surface) errors.push(`${id} : page parente « ${parent.page} » d’une autre surface`)
  } else if (!hasKey(TEMPLATES, String(parent.template))) {
    errors.push(`${id} : gabarit inconnu « ${String(parent.template)} »`)
  }
  if (typeof o.source !== 'string' || !SOURCE.test(o.source))
    errors.push(`${id} : source sans fichier:ligne (« ${String(o.source)} »)`)
  if (typeof o.title !== 'string' || o.title.length === 0) errors.push(`${id} : titre manquant`)
  const viewports = Array.isArray(o.viewports) ? o.viewports : []
  if (viewports.length === 0 || viewports.some(v => v !== 'desktop' && v !== 'mobile'))
    errors.push(`${id} : viewports desktop|mobile, au moins un`)
  if (o.body !== undefined) validateBlocks(o.body, `${id}.body`, errors)

  const actions = (Array.isArray(o.actions) ? o.actions : []).filter(isObj)
  for (const a of actions) {
    if (typeof a.label !== 'string' || !a.label) errors.push(`${id} : action sans libellé`)
    checkToken(errors, id, 'variante de bouton inconnue', COMPONENTS.Button.variants.variant, a.variant)
  }
  const primary = actions.at(-1)
  // Ce que le rendu ne dessinerait pas ne s'écrit pas : une donnée muette ferait croire qu'elle est maquettée.
  if (NO_ACTIONS.includes(kind) && o.actions !== undefined)
    errors.push(`${id} : la famille ${kind} ne porte pas d’actions`)
  if (NO_BODY.includes(kind) && o.body !== undefined) errors.push(`${id} : la famille ${kind} ne porte pas de corps`)
  if (kind === 'confirm' && actions.length !== 2)
    errors.push(`${id} : une confirmation porte deux boutons (renoncer, confirmer)`)
  // RUX-23 : une confirmation destructive ouvre le focus sur le bouton qui RENONCE, jamais sur celui qui détruit.
  const cancel = actions[0]
  if (kind === 'confirm' && o.destructive === true && cancel && typeof cancel.label === 'string') {
    const notes = (Array.isArray(o.uxNotes) ? o.uxNotes : []).filter(isObj)
    if (!notes.some(n => /focus/i.test(String(n.text)) && String(n.text).includes(`« ${cancel.label} »`)))
      errors.push(`${id} : confirmation destructive — le focus initial va sur « ${cancel.label} » (RUX-23)`)
  }
  // Un toast destructif est un toast d'ÉCHEC (variante `destructive`) : il n'a pas de bouton à contrôler.
  if (o.destructive === true && !NO_ACTIONS.includes(kind)) {
    if (!primary || primary.variant !== 'destructive')
      errors.push(`${id} : destructif — le bouton primaire (le dernier) doit être \`destructive\``)
    if (primary && VAGUE_LABELS.test(String(primary.label)))
      errors.push(`${id} : destructif — « ${String(primary.label)} » n’est pas un verbe explicite (dire ce qui part)`)
  }
  if (MODAL_KINDS.includes(kind)) {
    const notes = (Array.isArray(o.uxNotes) ? o.uxNotes : []).filter(isObj)
    if (!notes.some(n => /focus/i.test(String(n.text)) && /Échap/.test(String(n.text))))
      errors.push(`${id} : famille modale — une note d’UX dit où va le focus et ce que fait Échap`)
  }
  if (kind === 'dropdown') {
    if (!Array.isArray(o.items) || o.items.length === 0) errors.push(`${id} : un menu porte ses entrées (items)`)
    if (typeof o.trigger !== 'string' || !o.trigger) errors.push(`${id} : un menu nomme son déclencheur (trigger)`)
  } else if (o.items !== undefined || o.trigger !== undefined) {
    errors.push(`${id} : entrées et déclencheur ne concernent que les menus (dropdown)`)
  }
  for (const note of Array.isArray(o.uxNotes) ? o.uxNotes : []) {
    const n = isObj(note) ? note : {}
    if (n.kind !== 'ecart' && n.kind !== 'decision') errors.push(`${id} : note UX de nature « ${String(n.kind)} »`)
    if (typeof n.source !== 'string' || !SOURCE.test(n.source))
      errors.push(`${id} : note UX sans source fichier:ligne (source « ${String(n.source)} »)`)
  }
  return errors
}

/** Tout le registre des surcouches : chacune, et l'unicité des identifiants. */
export function validateOverlays(overlays: readonly OverlaySpec[], pages: readonly PageSpec[]): string[] {
  const errors = overlays.flatMap(o => validateOverlay(o, pages))
  const seen = new Set<string>()
  for (const o of overlays) {
    if (seen.has(o.id)) errors.push(`${o.id} : identifiant en double`)
    seen.add(o.id)
  }
  return errors
}

/** Valide tout le registre : chaque page, et l'unicité des identifiants. */
export function validatePages(pages: readonly PageSpec[]): string[] {
  const errors = pages.flatMap(validatePage)
  const seen = new Set<string>()
  for (const page of pages) {
    if (seen.has(page.id)) errors.push(`${page.id} : identifiant en double`)
    seen.add(page.id)
  }
  return errors
}
